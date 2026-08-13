"""Restart-safe local driving metrics for one selected Stellantis device."""

from __future__ import annotations

from datetime import timedelta
import logging
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    CONF_VEHICLE_SLUG,
    DOMAIN,
    METRIC_CURRENT_TRIP_ENERGY,
    METRIC_DISTANCE_SINCE_CHARGE,
    METRIC_LAST_TRIP,
    METRIC_TRAILING_CONSUMPTION,
)

_LOGGER = logging.getLogger(__name__)
_FALLBACK_CAPACITY_KWH = 43.4
_FINALIZE_DELAY = timedelta(minutes=5)
_RETRY_DELAY = timedelta(minutes=2)
_WINDOW_KM = 500.0
_STORE_VERSION = 1


class VehicleMetricsManager:
    """Derive local results without issuing any request to Stellantis."""

    def __init__(self, hass: HomeAssistant, entry, entity_mapping: dict[str, str]):
        self.hass = hass
        self.entry = entry
        self.mapping = entity_mapping
        slug = entry.data[CONF_VEHICLE_SLUG]
        self._store = Store(hass, _STORE_VERSION, f"{DOMAIN}_{slug}_metrics")
        self.data: dict[str, Any] = {
            "trips": [],
            "active_trip": None,
            "charge_odometer_km": None,
            "charge_end_time": None,
            "last_trip": None,
            "updated_at": None,
        }
        self._entities: list[Any] = []
        self._unsub: list[callable] = []
        self._cancel_finalize: callable | None = None

    async def async_initialize(self) -> None:
        """Restore state and subscribe to upstream state changes."""
        stored = await self._store.async_load()
        if isinstance(stored, dict):
            self.data.update(stored)
        self._normalise_trips()

        watched = [
            self.mapping.get("engine"),
            self.mapping.get("battery_charging"),
        ]
        watched = [entity_id for entity_id in watched if entity_id]
        if watched:
            self._unsub.append(
                async_track_state_change_event(self.hass, watched, self._handle_state)
            )

        # Restore a delayed completion after a Core restart. It is deliberately
        # not finalised immediately: Stellantis often publishes mileage only
        # several minutes after ignition-off.
        if self.data.get("active_trip") and self._is_off("engine"):
            self._schedule_finalize(_RETRY_DELAY)
        elif self._is_on("engine") and not self.data.get("active_trip"):
            await self.async_start_trip()

    async def async_shutdown(self) -> None:
        """Unsubscribe without changing any upstream state."""
        if self._cancel_finalize:
            self._cancel_finalize()
            self._cancel_finalize = None
        for unsubscribe in self._unsub:
            unsubscribe()
        self._unsub.clear()

    def register_entity(self, entity: Any) -> None:
        self._entities.append(entity)

    @callback
    def _handle_state(self, event: Event) -> None:
        entity_id = event.data["entity_id"]
        old_state = event.data.get("old_state")
        new_state = event.data.get("new_state")
        if new_state is None:
            return
        if entity_id == self.mapping.get("engine"):
            if new_state.state == "on":
                self.hass.async_create_task(self.async_start_trip())
            elif new_state.state == "off" and old_state is not None and old_state.state == "on":
                self._schedule_finalize(_FINALIZE_DELAY)
        elif entity_id == self.mapping.get("battery_charging"):
            if new_state.state == "off" and old_state is not None and old_state.state == "on":
                self.hass.async_create_task(self.async_record_charge_end())

    async def async_start_trip(self) -> None:
        """Persist an ignition-on reference once per journey."""
        if self.data.get("active_trip"):
            return
        mileage = self._number("mileage")
        if mileage is None:
            _LOGGER.debug("Not starting local e-C3 trip: mileage is unavailable")
            return
        self.data["active_trip"] = {
            "start_time": dt_util.utcnow().isoformat(),
            "start_mileage": mileage,
            "start_soc": self._number("battery"),
            "capacity_kwh": self._capacity(),
        }
        await self._save_and_refresh()

    def _schedule_finalize(self, delay: timedelta) -> None:
        if not self.data.get("active_trip"):
            return
        if self._cancel_finalize:
            self._cancel_finalize()
        self._cancel_finalize = async_call_later(
            self.hass, delay, self._async_finish_trip_callback
        )

    @callback
    def _async_finish_trip_callback(self, _now) -> None:
        self._cancel_finalize = None
        self.hass.async_create_task(self.async_finish_trip())

    async def async_finish_trip(self) -> None:
        """Finish after the upstream post-drive update has had time to arrive."""
        if self._is_on("engine"):
            return
        active = self.data.get("active_trip")
        if not isinstance(active, dict):
            return
        end_mileage = self._number("mileage")
        end_soc = self._number("battery")
        start_mileage = self._as_float(active.get("start_mileage"))
        if end_mileage is None or start_mileage is None or end_mileage <= start_mileage:
            # Keep the candidate alive; delayed mileage is normal for this API.
            self._schedule_finalize(_RETRY_DELAY)
            return

        start_time = dt_util.parse_datetime(str(active.get("start_time") or ""))
        if start_time is None:
            start_time = dt_util.utcnow()
        end_time = dt_util.utcnow()
        duration_seconds = max(1, int((end_time - start_time).total_seconds()))
        distance_km = round(end_mileage - start_mileage, 3)
        if distance_km > 1000 or duration_seconds > 24 * 3600:
            _LOGGER.warning("Discarding implausible local e-C3 trip candidate")
            self.data["active_trip"] = None
            await self._save_and_refresh()
            return

        capacity = self._as_float(active.get("capacity_kwh")) or _FALLBACK_CAPACITY_KWH
        start_soc = self._as_float(active.get("start_soc"))
        energy_kwh = (
            round(max(0, start_soc - end_soc) * capacity / 100, 3)
            if start_soc is not None and end_soc is not None
            else None
        )
        consumption = (
            round(energy_kwh / distance_km * 100, 2)
            if energy_kwh is not None and distance_km > 0
            else None
        )
        trip = {
            "id": end_time.isoformat(),
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "duration_seconds": duration_seconds,
            "duration": self._duration_text(duration_seconds),
            "distance_km": distance_km,
            "start_mileage": round(start_mileage, 3),
            "end_mileage": round(end_mileage, 3),
            "average_speed": round(distance_km / (duration_seconds / 3600), 1),
            "soc_start": start_soc,
            "soc_end": end_soc,
            "capacity_kwh": round(capacity, 2),
            "energy_kwh": energy_kwh,
            "energy_per_100_km": consumption,
            "estimated": True,
        }
        self.data["trips"] = [
            item for item in self.data.get("trips", []) if item.get("id") != trip["id"]
        ] + [trip]
        self.data["last_trip"] = trip
        self.data["active_trip"] = None
        self._normalise_trips()
        await self._save_and_refresh()

    async def async_record_charge_end(self) -> None:
        """Remember the odometer at a confirmed charging stop."""
        mileage = self._number("mileage")
        if mileage is None:
            return
        self.data["charge_odometer_km"] = round(mileage, 3)
        self.data["charge_end_time"] = dt_util.utcnow().isoformat()
        await self._save_and_refresh()

    def current_trip_energy(self) -> float | None:
        active = self.data.get("active_trip")
        if not isinstance(active, dict):
            return None
        start_soc = self._as_float(active.get("start_soc"))
        current_soc = self._number("battery")
        capacity = self._as_float(active.get("capacity_kwh")) or _FALLBACK_CAPACITY_KWH
        if start_soc is None or current_soc is None:
            return None
        return round(max(0, start_soc - current_soc) * capacity / 100, 3)

    def trailing_consumption(self) -> dict[str, Any]:
        remaining = _WINDOW_KM
        distance = 0.0
        energy = 0.0
        count = 0
        for trip in reversed(self.data.get("trips", [])):
            trip_distance = self._as_float(trip.get("distance_km"))
            trip_energy = self._as_float(trip.get("energy_kwh"))
            if trip_distance is None or trip_energy is None or trip_distance <= 0:
                continue
            used_distance = min(remaining, trip_distance)
            distance += used_distance
            energy += trip_energy * used_distance / trip_distance
            count += 1
            remaining -= used_distance
            if remaining <= 0:
                break
        return {
            "value": round(energy / distance * 100, 2) if distance > 0 else None,
            "distance_km": round(distance, 2),
            "energy_kwh": round(energy, 3),
            "trip_count": count,
            "complete": distance >= _WINDOW_KM,
        }

    def distance_since_charge(self) -> float | None:
        baseline = self._as_float(self.data.get("charge_odometer_km"))
        mileage = self._number("mileage")
        if baseline is None or mileage is None:
            return None
        return round(max(0, mileage - baseline), 2)

    async def _save_and_refresh(self) -> None:
        self.data["updated_at"] = dt_util.utcnow().isoformat()
        await self._store.async_save(self.data)
        for entity in self._entities:
            entity.async_write_ha_state()

    def _normalise_trips(self) -> None:
        trips = [item for item in self.data.get("trips", []) if isinstance(item, dict)]
        trips.sort(key=lambda item: str(item.get("end_time") or item.get("id") or ""))
        # Store a modest buffer beyond the trailing window. Recorder retains
        # result-sensor history separately for the configured retention period.
        self.data["trips"] = trips[-250:]

    def _number(self, mapping_key: str) -> float | None:
        entity_id = self.mapping.get(mapping_key)
        state = self.hass.states.get(entity_id) if entity_id else None
        return self._as_float(state.state if state else None)

    def _capacity(self) -> float:
        return self._number("battery_capacity") or _FALLBACK_CAPACITY_KWH

    def _is_on(self, mapping_key: str) -> bool:
        entity_id = self.mapping.get(mapping_key)
        return bool(entity_id and self.hass.states.is_state(entity_id, "on"))

    def _is_off(self, mapping_key: str) -> bool:
        entity_id = self.mapping.get(mapping_key)
        return bool(entity_id and self.hass.states.is_state(entity_id, "off"))

    @staticmethod
    def _as_float(value: Any) -> float | None:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _duration_text(seconds: int) -> str:
        hours, remainder = divmod(seconds, 3600)
        return f"{hours}:{remainder // 60:02d} h"


METRIC_INFO = {
    METRIC_TRAILING_CONSUMPTION: "trailing_consumption",
    METRIC_DISTANCE_SINCE_CHARGE: "distance_since_charge",
    METRIC_CURRENT_TRIP_ENERGY: "current_trip_energy",
    METRIC_LAST_TRIP: "last_trip",
}
