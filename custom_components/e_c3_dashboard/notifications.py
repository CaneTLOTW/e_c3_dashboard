"""Portable e-C3 notifications and optional automatic wake-up handling."""

from __future__ import annotations

from datetime import timedelta
import logging
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util import slugify

from .const import CONF_VEHICLE_SLUG, DOMAIN, OPTION_NOTIFICATION_RECIPIENTS
from .i18n import language_for, text

_LOGGER = logging.getLogger(__name__)
# Keep the Store major version stable. The 0.5.46 notification expansion only
# adds backwards-compatible keys and `async_initialize()` fills missing defaults.
# Bumping this to 2 without a Store migration callback makes Home Assistant
# reject an existing v1 notification store during config-entry setup.
_STORE_VERSION = 1

SWITCH_NOTIFICATIONS = "notifications"
SWITCH_TRIP_REPORTS = "trip_reports"
SWITCH_CHARGE_REPORTS = "charge_reports"
SWITCH_ALERTS = "alerts"
SWITCH_WAKEUP_HOURLY = "wakeup_hourly"
SWITCH_WAKEUP_CHARGING = "wakeup_charging"
SWITCH_WAKEUP_PROBE = "wakeup_probe"

BASE_SWITCHES = (
    SWITCH_NOTIFICATIONS,
    SWITCH_TRIP_REPORTS,
    SWITCH_CHARGE_REPORTS,
    SWITCH_ALERTS,
    SWITCH_WAKEUP_HOURLY,
    SWITCH_WAKEUP_CHARGING,
    SWITCH_WAKEUP_PROBE,
)

_RANGE_WARNING_KM = 25.0
_RANGE_RESET_KM = 30.0
_HOME_SOC_WARNING = 30.0
_HOME_SOC_RESET = 35.0
_HOME_DELAY = timedelta(minutes=20)
_SERVICE_BATTERY_WARNING = 50.0
_SERVICE_BATTERY_RESET = 55.0
_STALE_HOME = timedelta(hours=3)
_STALE_AWAY = timedelta(hours=2)
_PROBE_WAIT = timedelta(minutes=15)
_CHARGE_START_DELAY = timedelta(minutes=10)

SETTING_DEFAULTS = {
    "range_warning_km": 25.0, "range_reset_km": 30.0,
    "home_soc_warning": 30.0, "home_soc_reset": 35.0,
    "home_delay_minutes": 20.0, "service_battery_warning": 50.0,
    "service_battery_reset": 55.0, "stale_home_hours": 3.0,
    "stale_away_hours": 2.0, "probe_wait_minutes": 15.0,
    "charge_start_delay_minutes": 10.0,
    "quiet_start": "22:00:00", "quiet_end": "07:00:00",
}

SETTING_META = {
    "range_warning_km": ("Range warning", "mdi:map-marker-distance", 1, 200, 1),
    "range_reset_km": ("Range reset", "mdi:map-marker-check", 1, 200, 1),
    "home_soc_warning": ("Home SOC warning", "mdi:battery-alert", 1, 100, 1),
    "home_soc_reset": ("Home SOC reset", "mdi:battery-check", 1, 100, 1),
    "home_delay_minutes": ("Home warning delay", "mdi:timer-outline", 1, 1440, 1),
    "service_battery_warning": ("12 V warning", "mdi:car-battery", 1, 100, 1),
    "service_battery_reset": ("12 V reset", "mdi:car-battery", 1, 100, 1),
    "stale_home_hours": ("Stale at home", "mdi:home-clock-outline", .25, 48, .25),
    "stale_away_hours": ("Stale away", "mdi:car-clock", .25, 48, .25),
    "probe_wait_minutes": ("Probe wait", "mdi:timer-sand", 1, 180, 1),
    "charge_start_delay_minutes": ("Charge start delay", "mdi:timer-play-outline", 0, 180, 1),
}


class VehicleNotificationManager:
    """Own optional notification state without creating user helpers.

    Every switch and recipient is deliberately opt-in.  This is a package
    boundary: a HACS installation must not contact a user, nor wake a vehicle,
    until the user has selected a Notify entity and enabled the relevant
    package switches.
    """

    def __init__(self, hass: HomeAssistant, entry, mapping: dict[str, str], metrics) -> None:
        self.hass = hass
        self.entry = entry
        self.mapping = mapping
        self.metrics = metrics
        slug = entry.data[CONF_VEHICLE_SLUG]
        self._store = Store(hass, _STORE_VERSION, f"{DOMAIN}_{slug}_notifications")
        self.data: dict[str, Any] = {
            "switches": {},
            "markers": {},
            "last_notification": None,
            "last_wakeup": None,
            "wakeup_count_today": 0,
            "wakeup_counter_date": None,
            "settings": dict(SETTING_DEFAULTS),
        }
        self._entities: list[Any] = []
        self._unsub: list[callable] = []

    async def async_initialize(self) -> None:
        """Restore markers, initialise opt-in switches, and observe vehicle state."""
        stored = await self._store.async_load()
        if isinstance(stored, dict):
            self.data.update(stored)
        self.data.setdefault("switches", {})
        self.data.setdefault("markers", {})
        settings = self.data.setdefault("settings", {})
        for key, default in SETTING_DEFAULTS.items():
            settings.setdefault(key, default)
        for key in BASE_SWITCHES:
            self.data["switches"].setdefault(key, False)
        for recipient in self.recipients:
            self.data["switches"].setdefault(self.recipient_switch_key(recipient), False)

        watched = [
            self._entity("engine"),
            self._entity("battery_charging"),
            self._entity("battery"),
            self._entity("autonomy", "range"),
            self._entity("service_battery"),
            self._entity("vehicle"),
        ]
        watched = [entity_id for entity_id in watched if entity_id]
        if watched:
            self._unsub.append(
                async_track_state_change_event(self.hass, watched, self._handle_state)
            )
        self._unsub.extend(
            [
                self.hass.bus.async_listen(f"{DOMAIN}_trip_completed", self._handle_trip),
                self.hass.bus.async_listen(f"{DOMAIN}_charge_completed", self._handle_charge),
                async_track_time_interval(self.hass, self._tick, timedelta(minutes=1)),
            ]
        )
        await self._save()

    async def async_shutdown(self) -> None:
        for unsubscribe in self._unsub:
            unsubscribe()
        self._unsub.clear()

    @property
    def recipients(self) -> list[str]:
        return list(self.entry.options.get(OPTION_NOTIFICATION_RECIPIENTS, []))

    @staticmethod
    def recipient_switch_key(entity_id: str) -> str:
        return f"recipient_{slugify(entity_id)}"

    def register_entity(self, entity: Any) -> None:
        self._entities.append(entity)

    def setting(self, key: str) -> Any:
        return self.data.get("settings", {}).get(key, SETTING_DEFAULTS[key])

    async def async_set_setting(self, key: str, value: Any) -> None:
        if key not in SETTING_DEFAULTS:
            raise ValueError(f"Unknown notification setting: {key}")
        if key in SETTING_META:
            _, _, minimum, maximum, _ = SETTING_META[key]
            value = float(value)
            if not minimum <= value <= maximum:
                raise ValueError(f"Notification setting {key} is out of range")
            pairs = {
                "range_warning_km": "range_reset_km",
                "home_soc_warning": "home_soc_reset",
                "service_battery_warning": "service_battery_reset",
            }
            if key in pairs and value >= float(self.setting(pairs[key])):
                raise ValueError(f"{key} must remain below its reset threshold")
            reverse = {reset: warning for warning, reset in pairs.items()}
            if key in reverse and value <= float(self.setting(reverse[key])):
                raise ValueError(f"{key} must remain above its warning threshold")
        elif key.startswith("quiet_"):
            from datetime import time as time_type
            value = time_type.fromisoformat(str(value)).isoformat()
        self.data.setdefault("settings", {})[key] = value
        await self._save()

    def diagnostic(self) -> dict[str, Any]:
        markers = self.data.get("markers", {})
        last = self.data.get("last_notification") or {}
        return {"settings": dict(self.data.get("settings", {})),
                "heartbeat": markers.get("last_heartbeat"),
                "heartbeat_source": markers.get("heartbeat_source"),
                "outage_since": markers.get("outage_since"),
                "outage_reported": bool(markers.get("outage_reported")),
                "probe_at": markers.get("probe_at"),
                "last_notification": {key: last.get(key) for key in ("type", "title", "message", "time")}}

    async def async_refresh_entities(self) -> None:
        """Publish newly registered controls to the dashboard status sensor."""
        for entity in self._entities:
            entity.async_write_ha_state()

    def is_enabled(self, key: str) -> bool:
        return bool(self.data.get("switches", {}).get(key, False))

    async def async_set_enabled(self, key: str, enabled: bool) -> None:
        if key not in BASE_SWITCHES and key not in {
            self.recipient_switch_key(recipient) for recipient in self.recipients
        }:
            raise ValueError(f"Unknown e-C3 Dashboard notification switch: {key}")
        self.data["switches"][key] = enabled
        await self._save()

    async def async_manual_wakeup(self) -> None:
        await self._async_wakeup(text(self.hass, "manual_wakeup"))

    async def async_test_notification(self) -> None:
        await self._async_notify(
            text(self.hass, "test_title"),
            text(self.hass, "test_message"),
            "test",
            required_category=None,
        )

    @callback
    def _handle_state(self, _event: Event) -> None:
        self.hass.async_create_task(self._async_on_state_change())

    async def _async_on_state_change(self) -> None:
        await self._evaluate()

    async def _handle_trip(self, event: Event) -> None:
        await self._send_trip(event.data)

    async def _handle_charge(self, event: Event) -> None:
        await self._send_charge(event.data)

    async def _tick(self, _now) -> None:
        await self._evaluate()

    def _entity(self, *keys: str) -> str | None:
        for key in keys:
            if value := self.mapping.get(key):
                return value
        return None

    def _state(self, *keys: str):
        entity_id = self._entity(*keys)
        return self.hass.states.get(entity_id) if entity_id else None

    @staticmethod
    def _number(state) -> float | None:
        if state is None or state.state in {"unknown", "unavailable", "none", ""}:
            return None
        try:
            return float(state.state)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _source_time(state):
        if state is None:
            return None
        for key in ("last_updated", "Last updated", "Zuletzt aktualisiert"):
            if value := state.attributes.get(key):
                parsed = dt_util.parse_datetime(str(value))
                if parsed:
                    return parsed
        return getattr(state, "last_reported", None) or state.last_updated

    @staticmethod
    def _valid_timestamp(state) -> Any:
        if state is None or state.state in {"unknown", "unavailable", "none", ""}:
            return None
        parsed = dt_util.parse_datetime(str(state.state))
        return parsed

    @staticmethod
    def _hours(value: float) -> timedelta:
        return timedelta(hours=float(value))

    @staticmethod
    def _minutes(value: float) -> timedelta:
        return timedelta(minutes=float(value))

    def _quiet_hours(self, now) -> bool:
        from datetime import time as time_type
        try:
            start = time_type.fromisoformat(str(self.setting("quiet_start")))
            end = time_type.fromisoformat(str(self.setting("quiet_end")))
        except ValueError:
            return False
        current = now.timetz().replace(tzinfo=None)
        return (start <= current < end) if start < end else (current >= start or current < end)

    def _is_home(self) -> bool:
        tracker = self._state("vehicle")
        return tracker is not None and tracker.state == "home"

    def _is_active(self) -> bool:
        return self._state("engine")?.state == "on" or self._state("battery_charging")?.state == "on"

    def _heartbeat(self):
        temperature = self._state("temperature")
        if temperature is not None and temperature.state not in {"unknown", "unavailable", "none", ""}:
            return self._source_time(temperature), "temperature"
        # Conservative fallback for mappings without temperature: vehicle tracker
        # freshness, not the previous max timestamp across arbitrary static entities.
        tracker = self._state("vehicle")
        return (self._source_time(tracker), "vehicle") if tracker is not None else (None, None)

    def _charge_target_soc(self) -> float:
        limit_switch = self._state("battery_charging_limit_switch")
        limit_number = self._state("battery_charging_limit_number")
        if limit_switch?.state == "on":
            limit = self._number(limit_number)
            if limit is not None and 0 < limit <= 100:
                return limit
        return 100.0

    def _fresh_charge_end(self, now):
        end_state = self._state("battery_charging_end")
        end = self._valid_timestamp(end_state)
        if not end or end <= now:
            return None
        source_time = self._source_time(end_state)
        if source_time and now - source_time > timedelta(minutes=30):
            return None
        return end

    def _charge_power_sample(self, now):
        power = self._number(self._state("battery_charging_rate"))
        if power is None or power <= 0:
            return None
        markers = self.data.setdefault("markers", {})
        samples = markers.setdefault("charge_power_samples", [])
        samples.append({"time": now.isoformat(), "kw": power})
        markers["charge_power_samples"] = samples[-2:]
        return power

    def _charge_end_fallback(self, now):
        soc = self._number(self._state("battery"))
        if soc is None:
            return None
        target = self._charge_target_soc()
        if target <= soc:
            return now
        self._charge_power_sample(now)
        samples = self.data.setdefault("markers", {}).get("charge_power_samples", [])[-2:]
        powers = [float(sample["kw"]) for sample in samples if float(sample.get("kw", 0)) > 0]
        if not powers:
            return None
        average_power = sum(powers) / len(powers)
        capacity = 43.4
        remaining_kwh = (target - soc) / 100 * capacity
        return now + timedelta(hours=remaining_kwh / average_power)

    async def _evaluate(self) -> None:
        now = dt_util.now()
        markers = self.data.setdefault("markers", {})

        heartbeat, source = self._heartbeat()
        if heartbeat:
            previous = dt_util.parse_datetime(markers.get("last_heartbeat", ""))
            if previous is None or heartbeat > previous:
                markers["last_heartbeat"] = heartbeat.isoformat()
                markers["heartbeat_source"] = source
                if markers.pop("outage_reported", False):
                    started = dt_util.parse_datetime(markers.pop("outage_since", ""))
                    markers.pop("probe_at", None)
                    markers.pop("quiet_pending", None)
                    if started:
                        await self._async_notify(
                            text(self.hass, "availability_recovered_title"),
                            text(self.hass, "availability_recovered_message").format(
                                duration=self._format_duration(now - started)
                            ),
                            "availability_recovered",
                            SWITCH_ALERTS,
                        )

        stale = self._hours(self.setting("stale_away_hours") if self._is_active() else self.setting("stale_home_hours"))
        last_heartbeat = dt_util.parse_datetime(markers.get("last_heartbeat", "")) or heartbeat
        if last_heartbeat and now - last_heartbeat > stale:
            markers.setdefault("outage_since", last_heartbeat.isoformat())
            if not markers.get("probe_at") and self.is_enabled(SWITCH_WAKEUP_PROBE):
                if await self._async_wakeup(text(self.hass, "availability_probe_reason")):
                    markers["probe_at"] = now.isoformat()
            probe_at = dt_util.parse_datetime(markers.get("probe_at", ""))
            ready = not self.is_enabled(SWITCH_WAKEUP_PROBE) or (
                probe_at is not None and now - probe_at >= self._minutes(self.setting("probe_wait_minutes"))
            )
            if ready and not markers.get("outage_reported"):
                if self._quiet_hours(now):
                    markers["quiet_pending"] = True
                else:
                    await self._async_notify(
                        text(self.hass, "availability_lost_title"),
                        text(self.hass, "availability_lost_message").format(duration=self._format_duration(now - last_heartbeat)),
                        "availability_lost",
                        SWITCH_ALERTS,
                    )
                    markers["outage_reported"] = True
        elif markers.pop("quiet_pending", False) and not self._quiet_hours(now) and last_heartbeat:
            await self._async_notify(
                text(self.hass, "availability_lost_title"),
                text(self.hass, "availability_lost_message").format(duration=self._format_duration(now - last_heartbeat)),
                "availability_lost",
                SWITCH_ALERTS,
            )
            markers["outage_reported"] = True

        await self._evaluate_thresholds(now)
        await self._evaluate_charge_start(now)
        await self._save()

    async def _evaluate_thresholds(self, now) -> None:
        markers = self.data.setdefault("markers", {})
        range_km = self._number(self._state("autonomy", "range"))
        if range_km is not None:
            if range_km <= float(self.setting("range_warning_km")) and not markers.get("range_low"):
                await self._async_notify(text(self.hass, "range_low_title"), text(self.hass, "range_low_message").format(range=round(range_km)), "range_low", SWITCH_ALERTS)
                markers["range_low"] = True
            elif range_km >= float(self.setting("range_reset_km")):
                markers.pop("range_low", None)

        service = self._number(self._state("service_battery"))
        if service is not None:
            if service <= float(self.setting("service_battery_warning")) and not markers.get("service_low"):
                await self._async_notify(text(self.hass, "service_low_title"), text(self.hass, "service_low_message").format(value=round(service)), "service_battery_low", SWITCH_ALERTS)
                markers["service_low"] = True
            elif service >= float(self.setting("service_battery_reset")):
                markers.pop("service_low", None)

        soc = self._number(self._state("battery"))
        if soc is not None and self._is_home() and self._state("battery_charging")?.state != "on":
            if soc <= float(self.setting("home_soc_warning")):
                since = dt_util.parse_datetime(markers.get("home_low_since", ""))
                if not since:
                    markers["home_low_since"] = now.isoformat()
                elif now - since >= self._minutes(self.setting("home_delay_minutes")) and not markers.get("home_low_notified"):
                    await self._async_notify(text(self.hass, "home_charge_title"), text(self.hass, "home_charge_message").format(soc=round(soc)), "home_charge", SWITCH_ALERTS)
                    markers["home_low_notified"] = True
            elif soc >= float(self.setting("home_soc_reset")):
                markers.pop("home_low_since", None)
                markers.pop("home_low_notified", None)
        else:
            markers.pop("home_low_since", None)
            markers.pop("home_low_notified", None)

    async def _evaluate_charge_start(self, now) -> None:
        markers = self.data.setdefault("markers", {})
        charging = self._state("battery_charging")?.state == "on"
        if not charging:
            markers.pop("charge_started_at", None)
            markers.pop("charge_start_notified", None)
            markers.pop("charge_power_samples", None)
            return
        started = dt_util.parse_datetime(markers.get("charge_started_at", ""))
        if not started:
            markers["charge_started_at"] = now.isoformat()
            self._charge_power_sample(now)
            return
        self._charge_power_sample(now)
        if markers.get("charge_start_notified") or now - started < self._minutes(self.setting("charge_start_delay_minutes")):
            return
        end = self._fresh_charge_end(now) or self._charge_end_fallback(now)
        soc = self._number(self._state("battery"))
        charge_type = self._state("battery_charging_type")
        await self._async_notify(
            text(self.hass, "charge_started_title"),
            text(self.hass, "charge_started_message").format(
                soc="—" if soc is None else f"{soc:.0f}",
                end="—" if end is None else end.strftime("%H:%M"),
                type="—" if charge_type is None else charge_type.state,
            ),
            "charge_started", SWITCH_CHARGE_REPORTS,
        )
        markers["charge_start_notified"] = True

    async def _send_trip(self, data: dict[str, Any]) -> None:
        await self._async_notify(
            text(self.hass, "trip_complete_title"),
            text(self.hass, "trip_complete_message").format(
                distance=self._fmt(data.get("distance_km"), 1), duration=self._format_seconds(data.get("duration_seconds")),
                speed=self._fmt(data.get("average_speed_kmh"), 1), soc=self._fmt(data.get("soc_end"), 0),
                energy=self._fmt(data.get("energy_kwh"), 2), consumption=self._fmt(data.get("consumption_kwh_100km"), 1),
            ),
            "trip_complete", SWITCH_TRIP_REPORTS,
        )

    async def _send_charge(self, data: dict[str, Any]) -> None:
        await self._async_notify(
            text(self.hass, "charge_complete_title"),
            text(self.hass, "charge_complete_message").format(
                duration=self._format_seconds(data.get("charging_duration_seconds")), soc=self._fmt(data.get("soc_end"), 0),
                energy=self._fmt(data.get("energy_kwh"), 2), average=self._fmt(data.get("average_power_kw"), 1),
                maximum=self._fmt(data.get("maximum_power_kw"), 1), type=data.get("charge_type") or "—",
            ),
            "charge_complete", SWITCH_CHARGE_REPORTS,
        )

    async def _async_notify(self, title: str, message: str, notification_type: str, required_category: str | None) -> None:
        if not self.is_enabled(SWITCH_NOTIFICATIONS):
            return
        if required_category and not self.is_enabled(required_category):
            return
        sent = False
        for recipient in self.recipients:
            if not self.is_enabled(self.recipient_switch_key(recipient)):
                continue
            domain, _, service = recipient.partition(".")
            if domain != "notify" or not service:
                continue
            try:
                await self.hass.services.async_call("notify", service, {"title": title, "message": message}, blocking=True)
                sent = True
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("Could not send e-C3 notification via %s: %s", recipient, err)
        if sent:
            self.data["last_notification"] = {
                "type": notification_type, "title": title, "message": message, "time": dt_util.now().isoformat()
            }

    async def _async_wakeup(self, reason: str) -> bool:
        entity_id = self._entity("wakeup")
        if not entity_id:
            return False
        try:
            await self.hass.services.async_call("button", "press", {"entity_id": entity_id}, blocking=True)
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("Could not wake e-C3 vehicle: %s", err)
            return False
        now = dt_util.now()
        today = now.date().isoformat()
        if self.data.get("wakeup_counter_date") != today:
            self.data["wakeup_counter_date"] = today
            self.data["wakeup_count_today"] = 0
        self.data["wakeup_count_today"] = int(self.data.get("wakeup_count_today", 0)) + 1
        self.data["last_wakeup"] = {"time": now.isoformat(), "reason": reason}
        return True

    @staticmethod
    def _fmt(value: Any, decimals: int) -> str:
        try:
            return f"{float(value):.{decimals}f}"
        except (TypeError, ValueError):
            return "—"

    @staticmethod
    def _format_seconds(value: Any) -> str:
        try:
            total = max(0, int(float(value)))
        except (TypeError, ValueError):
            return "—"
        hours, remainder = divmod(total, 3600)
        minutes = remainder // 60
        return f"{hours:d}:{minutes:02d} h" if hours else f"{minutes:d} min"

    @staticmethod
    def _format_duration(value: timedelta) -> str:
        total = max(0, int(value.total_seconds()))
        hours, remainder = divmod(total, 3600)
        minutes = remainder // 60
        return f"{hours:d} h {minutes:02d} min" if hours else f"{minutes:d} min"

    async def _save(self) -> None:
        await self._store.async_save(self.data)
