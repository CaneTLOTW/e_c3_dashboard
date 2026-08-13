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
        """Run the same low-frequency checks as the reference dashboard."""
        await self._reset_daily_wakeup_counter()
        await self._evaluate_range()
        await self._evaluate_home_charge_reminder()
        await self._evaluate_service_battery()
        await self._evaluate_availability()
        await self._evaluate_charge_start()
        await self._evaluate_scheduled_wakeup()

    async def _async_trip_notification(self, trip: dict[str, Any]) -> None:
        if not self.is_enabled(SWITCH_TRIP_REPORTS):
            return
        duration = self._duration(int(trip.get("duration_seconds") or 0))
        title = text(self.hass, "trip_title")
        message = text(
            self.hass,
            "trip_message",
            distance=self._number(trip.get("distance_km"), 1),
            duration=duration,
            average_speed=self._number(trip.get("average_speed"), 1),
            soc_start=self._number(trip.get("soc_start"), 0),
            soc_end=self._number(trip.get("soc_end"), 0),
            energy=self._number(trip.get("energy_kwh"), 2),
            consumption=self._number(trip.get("energy_per_100_km"), 2),
        )
        await self._async_notify(
            title,
            message,
            "trip_completed",
            SWITCH_TRIP_REPORTS,
        )

    async def _async_charge_notification(self, charge: dict[str, Any]) -> None:
        if not self.is_enabled(SWITCH_CHARGE_REPORTS):
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
        if value < _RANGE_WARNING_KM and not self.data["markers"].get(marker):
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
        elif value > _RANGE_RESET_KM and self.data["markers"].get(marker):
            self.data["markers"][marker] = False
            await self._save()

    async def _evaluate_home_charge_reminder(self) -> None:
        soc = self._state_number("battery")
        needed = (
            self._is_home()
            and self._is_off("engine")
            and self._is_off("battery_charging")
            and soc is not None
            and soc < _HOME_SOC_WARNING
        )
        candidate = self._parse_time(self.data["markers"].get("home_low_soc_since"))
        if needed and candidate is None:
            self.data["markers"]["home_low_soc_since"] = dt_util.utcnow().isoformat()
            await self._save()
            return
        if not needed:
            changed = bool(candidate) or self.data["markers"].get("home_charge_reported")
            self.data["markers"].pop("home_low_soc_since", None)
            if soc is not None and soc > _HOME_SOC_RESET:
                self.data["markers"]["home_charge_reported"] = False
            if changed:
                await self._save()
            return
        if (
            candidate
            and dt_util.utcnow() - candidate >= _HOME_DELAY
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
        if value < _SERVICE_BATTERY_WARNING and not self.data["markers"].get(marker):
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
        elif value > _SERVICE_BATTERY_RESET and self.data["markers"].get(marker):
            self.data["markers"][marker] = False
            await self._save()

    async def _evaluate_availability(self) -> None:
        now = dt_util.utcnow()
        fresh = self._latest_upstream_update()
        if fresh is not None:
            self.data["markers"]["last_fresh_data"] = fresh.isoformat()
        last = self._parse_time(self.data["markers"].get("last_fresh_data"))
        if last is None:
            return
        stale_for = now - last
        limit = _STALE_HOME if self._is_home() and self._is_off("engine") else _STALE_AWAY
        outage = self._parse_time(self.data["markers"].get("outage_since"))
        if stale_for < timedelta(minutes=30):
            if outage:
                if self.data["markers"].get("outage_reported"):
                    await self._async_notify(
                        text(self.hass, "availability_restored_title"),
                        text(
                            self.hass,
                            "availability_restored_message",
                            minutes=round((now - outage).total_seconds() / 60),
                            soc=self._number(self._state_number("battery"), 0),
                            range=self._number(self._state_number("autonomy", "range"), 0),
                        ),
                        "availability_restored",
                        SWITCH_ALERTS,
                    )
                for key in ("outage_since", "outage_reported", "probe_at"):
                    self.data["markers"].pop(key, None)
                await self._save()
            return
        if stale_for < limit:
            return
        if outage is None:
            self.data["markers"]["outage_since"] = now.isoformat()
            outage = now
            if self.is_enabled(SWITCH_WAKEUP_PROBE):
                await self._async_wakeup(
                    text(self.hass, "availability_probe")
                )
                self.data["markers"]["probe_at"] = now.isoformat()
            await self._save()
            return
        probe_at = self._parse_time(self.data["markers"].get("probe_at"))
        if not self.data["markers"].get("outage_reported") and (
            not self.is_enabled(SWITCH_WAKEUP_PROBE)
            or (probe_at is not None and now - probe_at >= _PROBE_WAIT)
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
        active = self.metrics.data.get("active_charge")
        if not self._is_on("battery_charging") or not isinstance(active, dict):
            self.data["markers"].pop("charge_start_reported", None)
            return
        start = self._parse_time(active.get("start_time"))
        if (
            start is None
            or dt_util.utcnow() - start < _CHARGE_START_DELAY
            or self.data["markers"].get("charge_start_reported")
        ):
            return
        soc = self._state_number("battery")
        capacity = self._as_float(active.get("capacity_kwh")) or 43.4
        power = self._as_float(self.metrics.current_charge_power())
        target = 80.0
        remaining = ((target - soc) * capacity / 100 / power) if soc is not None and power and target > soc else None
        if remaining is None or remaining <= 0:
            return
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
        if self.is_enabled(SWITCH_WAKEUP_CHARGING) and self._is_on("battery_charging"):
            if last is None or now - last >= timedelta(minutes=5):
                await self._async_wakeup(
                    text(self.hass, "wakeup_charging")
                )
            return
        if (
            self.is_enabled(SWITCH_WAKEUP_HOURLY)
            and self._is_off("engine")
            and self._is_off("battery_charging")
            and not self._parse_time(self.data["markers"].get("outage_since"))
            and (last is None or now - last >= timedelta(hours=1))
        ):
            await self._async_wakeup(
                text(self.hass, "wakeup_hourly")
            )

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

    async def _async_notify(
        self, title: str, message: str, notification_type: str, required_category: str | None
    ) -> bool:
        if not self.is_enabled(SWITCH_NOTIFICATIONS):
            return False
        if required_category and not self.is_enabled(required_category):
            return False
        recipients = [
            recipient
            for recipient in self.recipients
            if self.is_enabled(self.recipient_switch_key(recipient))
        ]
        if not recipients:
            return False
        try:
            await self.hass.services.async_call(
                "notify",
                "send_message",
                {"title": title, "message": message},
                target={"entity_id": recipients},
                blocking=False,
            )
        except Exception:
            _LOGGER.warning("Could not send e-C3 Dashboard notification", exc_info=True)
            return False
        self.data["last_notification"] = {
            "type": notification_type,
            "title": title,
            "message": message,
            "recipients": recipients,
            "time": dt_util.utcnow().isoformat(),
        }
        await self._save()
        return True

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
        return bool(state and (state.state == "home" or "zone.home" in (state.attributes.get("in_zones") or [])))

    def _latest_upstream_update(self):
        latest = None
        for entity_id in self.mapping.values():
            state = self.hass.states.get(entity_id)
            if state is None:
                continue
            value = (
                state.attributes.get("last_updated")
                or state.attributes.get("Last updated")
                or state.attributes.get("Zuletzt aktualisiert")
            )
            stamp = self._parse_time(value)
            if stamp is None:
                continue
            if latest is None or stamp > latest:
                latest = stamp
        return latest

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
        return formatted.replace(".", ",") if language_for(self.hass) == "de" else formatted

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
