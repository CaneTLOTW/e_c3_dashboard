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
# The notification-store schema remains backwards-compatible: new settings and
# markers are populated with setdefault during initialization. Keep the Store
# major version at 1 so existing 0.5.45 data loads without requiring a Home
# Assistant Store migration callback.
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

SETTING_DEFAULTS = {
    "range_warning_km": 25.0,
    "range_reset_km": 30.0,
    "home_soc_warning": 30.0,
    "home_soc_reset": 35.0,
    "home_delay_minutes": 20.0,
    "service_battery_warning": 50.0,
    "service_battery_reset": 55.0,
    "stale_home_hours": 3.0,
    "stale_away_hours": 2.0,
    "probe_wait_minutes": 15.0,
    "charge_start_delay_minutes": 10.0,
    "quiet_start": "22:00:00",
    "quiet_end": "07:00:00",
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

_MAX_RECENT_CHARGE_POWER_KW = 350.0
_MAX_RECENT_CHARGE_SAMPLE_AGE = timedelta(minutes=30)
_CHARGE_END_START_TOLERANCE = timedelta(minutes=5)


class VehicleNotificationManager:
    """Own optional notification state without creating user helpers.

    Every switch and recipient is deliberately opt-in. This is a package
    boundary: a HACS installation must not contact a user, nor wake a vehicle,
    until the user has selected a Notify service and enabled the relevant
    package switches.
    """

    def __init__(self, hass: HomeAssistant, entry, mapping: dict[str, str], metrics) -> None:
        self.hass = hass
        self.entry = entry
        self.mapping = mapping
        self.metrics = metrics
        self.capabilities = dict(getattr(metrics, "capabilities", {}) or {})
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
        """Return only recipients explicitly selected by the user.

        Older entries may not yet have the selection option. In that case keep
        only recipients whose legacy package switch had already been explicitly
        enabled. Merely discovering a notify service never opts it in.
        """
        services = self.hass.services.async_services().get("notify", {})
        discovered = sorted(
            f"notify.{service_name}"
            for service_name in services
            if service_name not in {"notify", "send_message"}
        )
        configured = self.entry.options.get(OPTION_NOTIFICATION_RECIPIENTS)
        if configured is None:
            switches = self.data.get("switches", {})
            return [
                recipient
                for recipient in discovered
                if switches.get(self.recipient_switch_key(recipient)) is True
            ]
        return [recipient for recipient in configured if recipient in discovered]

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
        return {
            "settings": dict(self.data.get("settings", {})),
            "heartbeat": markers.get("last_heartbeat"),
            "heartbeat_source": markers.get("heartbeat_source"),
            "outage_since": markers.get("outage_since"),
            "outage_reported": bool(markers.get("outage_reported")),
            "probe_at": markers.get("probe_at"),
            "last_notification": {
                key: last.get(key) for key in ("type", "title", "message", "time")
            },
        }

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

    @callback
    def _handle_trip(self, event: Event) -> None:
        self.hass.async_create_task(self._async_trip_notification(event.data))

    @callback
    def _handle_charge(self, event: Event) -> None:
        self.hass.async_create_task(self._async_charge_notification(event.data))

    @callback
    def _tick(self, _now) -> None:
        self.hass.async_create_task(self._evaluate())

    async def _evaluate(self) -> None:
        """Run only checks supported by this vehicle's capability contract."""
        await self._reset_daily_wakeup_counter()
        if self.capabilities.get("electric_energy", False):
            await self._evaluate_range()
            await self._evaluate_home_charge_reminder()
        await self._evaluate_service_battery()
        await self._evaluate_availability()
        if self.capabilities.get("charging", False):
            await self._evaluate_charge_start()
        await self._evaluate_scheduled_wakeup()

    async def _async_trip_notification(self, trip: dict[str, Any]) -> None:
        if not self.is_enabled(SWITCH_TRIP_REPORTS):
            return
        duration = self._duration(int(trip.get("duration_seconds") or 0))
        title = text(self.hass, "trip_title")
        common = {
            "distance": self._number(trip.get("distance_km"), 1),
            "duration": duration,
            "average_speed": self._number(trip.get("average_speed"), 1),
        }
        electric_values = (
            trip.get("soc_start"),
            trip.get("soc_end"),
            trip.get("energy_kwh"),
            trip.get("energy_per_100_km"),
        )
        has_electric_trip_data = (
            self.capabilities.get("electric_trip_metrics", False)
            and all(self._as_float(value) is not None for value in electric_values)
        )
        if has_electric_trip_data:
            message = text(
                self.hass,
                "trip_message_electric",
                **common,
                soc_start=self._number(trip.get("soc_start"), 0),
                soc_end=self._number(trip.get("soc_end"), 0),
                energy=self._number(trip.get("energy_kwh"), 2),
                consumption=self._number(trip.get("energy_per_100_km"), 2),
            )
        else:
            message = text(self.hass, "trip_message", **common)
        await self._async_notify(
            title,
            message,
            "trip_completed",
            SWITCH_TRIP_REPORTS,
        )

    async def _async_charge_notification(self, charge: dict[str, Any]) -> None:
        if (
            not self.capabilities.get("charging", False)
            or not self.is_enabled(SWITCH_CHARGE_REPORTS)
        ):
            return
        title = text(self.hass, "charge_completed_title")
        message = text(
            self.hass,
            "charge_completed_message",
            duration=self._duration(int(charge.get("duration_seconds") or 0)),
            soc_start=self._number(charge.get("soc_start"), 0),
            soc_end=self._number(charge.get("soc_end"), 0),
            energy=self._number(charge.get("energy_kwh"), 2),
            average_power=self._number(charge.get("average_power_kw"), 2),
            maximum_power=self._number(charge.get("maximum_power_kw"), 2),
            charge_type=charge.get("charge_type") or text(self.hass, "unknown"),
        )
        await self._async_notify(
            title,
            message,
            "charge_completed",
            SWITCH_CHARGE_REPORTS,
        )

    async def _evaluate_range(self) -> None:
        value = self._state_number("autonomy", "range")
        if value is None:
            return
        marker = "range_reported"
        if value < self.setting("range_warning_km") and not self.data["markers"].get(marker):
            sent = await self._async_notify(
                text(self.hass, "range_low_title"),
                text(
                    self.hass,
                    "range_low_message",
                    range=self._number(value, 0),
                    soc=self._number(self._state_number("battery"), 0),
                ),
                "range_low",
                SWITCH_ALERTS,
            )
            if sent:
                self.data["markers"][marker] = True
                await self._save()
        elif value > self.setting("range_reset_km") and self.data["markers"].get(marker):
            self.data["markers"][marker] = False
            await self._save()

    async def _evaluate_home_charge_reminder(self) -> None:
        soc = self._state_number("battery")
        needed = (
            self._is_home()
            and self._is_off("engine")
            and self._is_off("battery_charging")
            and soc is not None
            and soc < self.setting("home_soc_warning")
        )
        candidate = self._parse_time(self.data["markers"].get("home_low_soc_since"))
        if needed and candidate is None:
            self.data["markers"]["home_low_soc_since"] = dt_util.utcnow().isoformat()
            await self._save()
            return
        if not needed:
            changed = bool(candidate) or self.data["markers"].get("home_charge_reported")
            self.data["markers"].pop("home_low_soc_since", None)
            if soc is not None and soc > self.setting("home_soc_reset"):
                self.data["markers"]["home_charge_reported"] = False
            if changed:
                await self._save()
            return
        if (
            candidate
            and dt_util.utcnow() - candidate
            >= timedelta(minutes=float(self.setting("home_delay_minutes")))
            and not self.data["markers"].get("home_charge_reported")
        ):
            sent = await self._async_notify(
                text(self.hass, "charge_recommended_title"),
                text(
                    self.hass,
                    "charge_recommended_message",
                    soc=self._number(soc, 0),
                    range=self._number(self._state_number("autonomy", "range"), 0),
                ),
                "charge_reminder",
                SWITCH_ALERTS,
            )
            if sent:
                self.data["markers"]["home_charge_reported"] = True
                await self._save()

    async def _evaluate_service_battery(self) -> None:
        value = self._state_number("service_battery")
        if value is None:
            return
        marker = "service_battery_reported"
        if value < self.setting("service_battery_warning") and not self.data["markers"].get(marker):
            sent = await self._async_notify(
                text(self.hass, "service_battery_low_title"),
                text(
                    self.hass,
                    "service_battery_low_message",
                    level=self._number(value, 0),
                ),
                "service_battery_low",
                SWITCH_ALERTS,
            )
            if sent:
                self.data["markers"][marker] = True
                await self._save()
        elif value > self.setting("service_battery_reset") and self.data["markers"].get(marker):
            self.data["markers"][marker] = False
            await self._save()

    async def _evaluate_availability(self) -> None:
        now = dt_util.utcnow()
        fresh, source = self._heartbeat()
        if fresh is not None:
            self.data["markers"]["last_fresh_data"] = fresh.isoformat()
            self.data["markers"]["last_heartbeat"] = fresh.isoformat()
            self.data["markers"]["heartbeat_source"] = source
        last = self._parse_time(self.data["markers"].get("last_fresh_data"))
        if last is None:
            return
        stale_for = now - last
        limit = (
            timedelta(hours=float(self.setting("stale_home_hours")))
            if self._is_home() and self._is_off("engine")
            else timedelta(hours=float(self.setting("stale_away_hours")))
        )
        outage = self._parse_time(self.data["markers"].get("outage_since"))
        if outage and fresh is not None:
            outage_heartbeat = self._parse_time(self.data["markers"].get("outage_heartbeat"))
            if outage_heartbeat is None or fresh > outage_heartbeat:
                if self.data["markers"].get("outage_reported"):
                    minutes = round((now - outage).total_seconds() / 60)
                    soc = self._state_number("battery")
                    electric_range = self._state_number("autonomy", "range")
                    if (
                        self.capabilities.get("electric_energy", False)
                        and soc is not None
                        and electric_range is not None
                    ):
                        restored_message = text(
                            self.hass,
                            "availability_restored_message_electric",
                            minutes=minutes,
                            soc=self._number(soc, 0),
                            range=self._number(electric_range, 0),
                        )
                    else:
                        restored_message = text(
                            self.hass,
                            "availability_restored_message",
                            minutes=minutes,
                        )
                    await self._async_notify(
                        text(self.hass, "availability_restored_title"),
                        restored_message,
                        "availability_restored",
                        SWITCH_ALERTS,
                    )
                for key in (
                    "outage_since",
                    "outage_reported",
                    "probe_at",
                    "outage_heartbeat",
                    "quiet_notification_pending",
                ):
                    self.data["markers"].pop(key, None)
                await self._save()
            return
        if stale_for < limit:
            return
        if outage is None:
            self.data["markers"]["outage_since"] = now.isoformat()
            self.data["markers"]["outage_heartbeat"] = last.isoformat()
            outage = now
            if self.is_enabled(SWITCH_WAKEUP_PROBE):
                await self._async_wakeup(text(self.hass, "availability_probe"))
                self.data["markers"]["probe_at"] = now.isoformat()
            await self._save()
            return
        probe_at = self._parse_time(self.data["markers"].get("probe_at"))
        if not self.data["markers"].get("outage_reported") and (
            not self.is_enabled(SWITCH_WAKEUP_PROBE)
            or (
                probe_at is not None
                and now - probe_at
                >= timedelta(minutes=float(self.setting("probe_wait_minutes")))
            )
        ):
            sent = await self._async_notify(
                text(self.hass, "availability_outage_title"),
                text(
                    self.hass,
                    "availability_outage_message",
                    hours=self._number(stale_for.total_seconds() / 3600, 2),
                ),
                "availability_outage",
                SWITCH_ALERTS,
            )
            if sent:
                self.data["markers"]["outage_reported"] = True
                await self._save()

    async def _evaluate_charge_start(self) -> None:
        if not self.capabilities.get("charging", False):
            return
        active = self.metrics.data.get("active_charge")
        if not self._is_on("battery_charging") or not isinstance(active, dict):
            self.data["markers"].pop("charge_start_reported", None)
            return
        start = self._parse_time(active.get("start_time"))
        if (
            start is None
            or dt_util.utcnow() - start
            < timedelta(minutes=float(self.setting("charge_start_delay_minutes")))
            or self.data["markers"].get("charge_start_reported")
        ):
            return
        soc = self._state_number("battery")
        capacity = self._as_float(active.get("capacity_kwh"))
        if capacity is None:
            capacity, _source = self.metrics.battery_capacity()
        power = self._recent_charge_power(active)
        target = self._charge_target()
        upstream_end = self._upstream_charge_end(start)
        direct_finish = upstream_end is not None and upstream_end > dt_util.utcnow()
        if direct_finish:
            finish = upstream_end
            remaining = (finish - dt_util.utcnow()).total_seconds() / 3600
        else:
            remaining = (
                (target - soc) * capacity / 100 / power
                if soc is not None and capacity is not None and power and target > soc
                else None
            )
        if remaining is None or remaining <= 0:
            return
        if not direct_finish:
            finish = dt_util.utcnow() + timedelta(hours=remaining)
        end = self._format_charge_end(finish)
        sent = await self._async_notify(
            text(self.hass, "charge_started_title"),
            text(
                self.hass,
                "charge_started_message",
                start_soc=self._number(active.get("start_soc"), 0),
                soc=self._number(soc, 0),
                duration=self._duration(round(remaining * 3600)),
                end=end,
                charge_type=active.get("charge_type") or text(self.hass, "unknown"),
            ),
            "charge_started",
            SWITCH_CHARGE_REPORTS,
        )
        if sent:
            self.data["markers"]["charge_start_reported"] = True
            await self._save()

    async def _evaluate_scheduled_wakeup(self) -> None:
        now = dt_util.utcnow()
        last = self._parse_time(self.data.get("last_wakeup"))
        supports_charging = self.capabilities.get("charging", False)
        if (
            supports_charging
            and self.is_enabled(SWITCH_WAKEUP_CHARGING)
            and self._is_on("battery_charging")
        ):
            if last is None or now - last >= timedelta(minutes=5):
                await self._async_wakeup(text(self.hass, "wakeup_charging"))
            return
        charging_inactive = not supports_charging or self._is_off("battery_charging")
        if (
            self.is_enabled(SWITCH_WAKEUP_HOURLY)
            and self._is_off("engine")
            and charging_inactive
            and not self._parse_time(self.data["markers"].get("outage_since"))
            and (last is None or now - last >= timedelta(hours=1))
        ):
            await self._async_wakeup(text(self.hass, "wakeup_hourly"))

    async def _async_wakeup(self, message: str) -> bool:
        wakeup = self._entity("wakeup")
        if not wakeup or self.hass.states.get(wakeup) is None:
            return False
        try:
            await self.hass.services.async_call(
                "button", "press", {"entity_id": wakeup}, blocking=True
            )
        except Exception:  # upstream command availability must not break checks
            _LOGGER.debug("e-C3 wake-up request failed", exc_info=True)
            return False
        self.data["last_wakeup"] = dt_util.utcnow().isoformat()
        self.data["wakeup_count_today"] = int(self.data.get("wakeup_count_today") or 0) + 1
        await self._save()
        await self.hass.services.async_call(
            "logbook",
            "log",
            {"name": "e-C3 Dashboard Wake-up", "message": message, "domain": DOMAIN},
            blocking=False,
        )
        return True

    def _enabled_recipients(self) -> list[str]:
        return [
            recipient
            for recipient in self.recipients
            if self.is_enabled(self.recipient_switch_key(recipient))
        ]

    async def _async_notify(
        self,
        title: str,
        message: str,
        notification_type: str,
        required_category: str | None,
    ) -> bool:
        # Eligibility is evaluated before quiet-hour deferral. An installation
        # with notifications/categories/recipients disabled must not accumulate
        # a pending warning merely because the vehicle is stale overnight.
        if not self.is_enabled(SWITCH_NOTIFICATIONS):
            return False
        if required_category and not self.is_enabled(required_category):
            return False
        recipients = self._enabled_recipients()
        if not recipients:
            return False
        if notification_type == "availability_outage" and self._in_quiet_hours():
            self.data["markers"]["quiet_notification_pending"] = True
            await self._save()
            return False

        sent_recipients: list[str] = []
        for recipient in recipients:
            service_name = recipient.removeprefix("notify.")
            try:
                # Recipients are discovered from the notify service registry,
                # therefore invoke the selected service directly. A failure of
                # one destination must not prevent the other selected targets.
                await self.hass.services.async_call(
                    "notify",
                    service_name,
                    {"title": title, "message": message},
                    blocking=False,
                )
            except Exception:
                _LOGGER.warning(
                    "Could not send e-C3 Dashboard notification via %s",
                    recipient,
                    exc_info=True,
                )
                continue
            sent_recipients.append(recipient)

        if not sent_recipients:
            return False
        if notification_type == "availability_outage":
            self.data["markers"].pop("quiet_notification_pending", None)
        self.data["last_notification"] = {
            "type": notification_type,
            "title": title,
            "message": message,
            "recipients": sent_recipients,
            "time": dt_util.utcnow().isoformat(),
        }
        await self._save()
        return True

    def _in_quiet_hours(self) -> bool:
        now = dt_util.as_local(dt_util.utcnow()).time()
        start = self._time_value(self.setting("quiet_start"))
        end = self._time_value(self.setting("quiet_end"))
        if start is None or end is None or start == end:
            return False
        return now >= start or now < end if start > end else start <= now < end

    @staticmethod
    def _time_value(value: Any):
        try:
            from datetime import time as time_type

            return time_type.fromisoformat(str(value))
        except (TypeError, ValueError):
            return None

    async def _reset_daily_wakeup_counter(self) -> None:
        today = dt_util.as_local(dt_util.utcnow()).date().isoformat()
        if self.data.get("wakeup_counter_date") != today:
            self.data["wakeup_counter_date"] = today
            self.data["wakeup_count_today"] = 0
            await self._save()

    async def _save(self) -> None:
        await self._store.async_save(self.data)
        for entity in self._entities:
            entity.async_write_ha_state()

    def _entity(self, *keys: str) -> str | None:
        return next((self.mapping.get(key) for key in keys if self.mapping.get(key)), None)

    def _state_number(self, *keys: str) -> float | None:
        entity_id = self._entity(*keys)
        state = self.hass.states.get(entity_id) if entity_id else None
        return self._as_float(state.state if state else None)

    def _is_on(self, key: str) -> bool:
        entity_id = self._entity(key)
        return bool(entity_id and self.hass.states.is_state(entity_id, "on"))

    def _is_off(self, key: str) -> bool:
        entity_id = self._entity(key)
        return bool(entity_id and self.hass.states.is_state(entity_id, "off"))

    def _is_home(self) -> bool:
        tracker = self._entity("vehicle")
        state = self.hass.states.get(tracker) if tracker else None
        return bool(
            state
            and (
                state.state == "home"
                or "zone.home" in (state.attributes.get("in_zones") or [])
            )
        )

    def _heartbeat(self):
        """Use a proven changing payload, rather than a static mapped entity."""
        for key in ("temperature", "vehicle"):
            entity_id = self._entity(key)
            state = self.hass.states.get(entity_id) if entity_id else None
            if state is None or state.state in {"unknown", "unavailable"}:
                continue
            source_value = state.attributes.get("Last updated") or state.attributes.get(
                "last_updated"
            )
            stamp = self._parse_time(source_value) or self._parse_time(state.last_updated)
            if stamp is not None:
                return stamp, "source_attribute" if source_value else "ha_last_updated"
        return None, None

    def _charge_target(self) -> float:
        switch = self._entity("battery_charging_limit_switch")
        if switch and self.hass.states.is_state(switch, "on"):
            value = self._state_number("battery_charging_limit_number")
            if value is not None and 0 < value <= 100:
                return value
        return 100.0

    def _upstream_charge_end(self, active_start=None):
        """Return an end estimate only when it belongs to this charge episode."""
        entity_id = self._entity("battery_charging_end")
        state = self.hass.states.get(entity_id) if entity_id else None
        if state is None or state.state in {"unknown", "unavailable", "none", ""}:
            return None
        end = self._parse_time(state.state)
        if end is None:
            return None
        if active_start is not None:
            updated = self._parse_time(state.last_updated)
            if updated is None or updated < active_start - _CHARGE_END_START_TOLERANCE:
                return None
        return end

    def _recent_charge_power(self, active: dict[str, Any]) -> float | None:
        """Use the latest one or two recent, positive and plausible samples."""
        samples = active.get("samples") or active.get("power_samples") or []
        values: list[float] = []
        now = dt_util.utcnow()
        if isinstance(samples, list):
            for sample in reversed(samples):
                if isinstance(sample, dict):
                    value = self._as_float(
                        sample.get("derived_power_kw", sample.get("power_kw"))
                    )
                    sample_time = self._parse_time(
                        sample.get("source_time")
                        or sample.get("time")
                        or sample.get("received_at")
                    )
                else:
                    value = self._as_float(sample)
                    sample_time = None
                if value is None or value <= 0 or value > _MAX_RECENT_CHARGE_POWER_KW:
                    continue
                if (
                    sample_time is not None
                    and now - sample_time > _MAX_RECENT_CHARGE_SAMPLE_AGE
                ):
                    continue
                values.append(value)
                if len(values) == 2:
                    break
        if values:
            return sum(values) / len(values)
        value = self._as_float(self.metrics.current_charge_power())
        return (
            value
            if value is not None and 0 < value <= _MAX_RECENT_CHARGE_POWER_KW
            else None
        )

    @staticmethod
    def _parse_time(value: Any):
        if not value:
            return None
        if hasattr(value, "tzinfo"):
            return value
        return dt_util.parse_datetime(str(value))

    @staticmethod
    def _as_float(value: Any) -> float | None:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _number(self, value: Any, precision: int) -> str:
        numeric = self._as_float(value)
        if numeric is None:
            return "—"
        formatted = f"{numeric:.{precision}f}"
        return formatted if language_for(self.hass) == "en" else formatted.replace(".", ",")

    @staticmethod
    def _duration(seconds: int) -> str:
        hours, remainder = divmod(max(0, seconds), 3600)
        return f"{hours}:{remainder // 60:02d} h"

    def _format_charge_end(self, value) -> str:
        local = dt_util.as_local(value)
        now = dt_util.now()
        if local.date() == now.date():
            return text(self.hass, "today_at", time=f"{local:%H:%M}")
        if local.date() == (now + timedelta(days=1)).date():
            return text(self.hass, "tomorrow_at", time=f"{local:%H:%M}")
        return (
            f"{local:%d.%m. %H:%M}"
            if language_for(self.hass) == "de"
            else f"{local:%Y-%m-%d %H:%M}"
        )
