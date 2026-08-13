"""Restart-safe local driving metrics for one selected Stellantis device."""

from __future__ import annotations

from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder import history as recorder_history
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    CONF_VEHICLE_SLUG,
    DEFAULT_OPTIONS,
    DOMAIN,
    METRIC_CURRENT_CHARGE_POWER,
    METRIC_CURRENT_TRIP_ENERGY,
    METRIC_DISTANCE_SINCE_CHARGE,
    METRIC_LAST_CHARGE,
    METRIC_LAST_TRIP,
    METRIC_TRAILING_CONSUMPTION,
    OPTION_HISTORY_HOURS,
)

_LOGGER = logging.getLogger(__name__)
_FALLBACK_CAPACITY_KWH = 43.4
_FINALIZE_DELAY = timedelta(minutes=5)
_CHARGE_FINALIZE_DELAY = timedelta(minutes=2)
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
            "charges": [],
            "active_trip": None,
            "active_charge": None,
            "charge_odometer_km": None,
            "charge_end_time": None,
            "charge_baseline_source": None,
            "last_trip": None,
            "last_charge": None,
            "current_charge_power_kw": None,
            "updated_at": None,
        }
        self._entities: list[Any] = []
        self._unsub: list[callable] = []
        self._cancel_trip_finalize: callable | None = None
        self._cancel_charge_finalize: callable | None = None

    async def async_initialize(self) -> None:
        """Restore state and subscribe to upstream state changes."""
        stored = await self._store.async_load()
        if isinstance(stored, dict):
            self.data.update(stored)
        self._normalise_trips()
        self._normalise_charges()

        watched = [
            self.mapping.get("engine"),
            self.mapping.get("battery_charging"),
            self.mapping.get("battery"),
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
        if self.data.get("active_charge") and self._is_off("battery_charging"):
            self._schedule_charge_finalize(_RETRY_DELAY)
        elif self._is_on("battery_charging") and not self.data.get("active_charge"):
            await self.async_start_charge()

        # A fresh installation must not wait for the next journey or charge.
        # Reconcile only from Recorder data that the upstream integration has
        # already persisted; this never triggers a Stellantis request.
        if not self.data.get("trips") or not self.data.get("charge_odometer_km"):
            self.hass.async_create_task(self._async_seed_from_recorder())

    async def async_shutdown(self) -> None:
        """Unsubscribe without changing any upstream state."""
        if self._cancel_trip_finalize:
            self._cancel_trip_finalize()
            self._cancel_trip_finalize = None
        if self._cancel_charge_finalize:
            self._cancel_charge_finalize()
            self._cancel_charge_finalize = None
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
            if new_state.state == "on" and (old_state is None or old_state.state != "on"):
                self.hass.async_create_task(self.async_start_charge())
            elif new_state.state == "off" and old_state is not None and old_state.state == "on":
                self._schedule_charge_finalize(_CHARGE_FINALIZE_DELAY)
        elif entity_id == self.mapping.get("battery") and self._is_on("battery_charging"):
            self.hass.async_create_task(self.async_track_charge_sample())

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
        if self._cancel_trip_finalize:
            self._cancel_trip_finalize()
        self._cancel_trip_finalize = async_call_later(
            self.hass, delay, self._async_finish_trip_callback
        )

    @callback
    def _async_finish_trip_callback(self, _now) -> None:
        self._cancel_trip_finalize = None
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
        self.hass.bus.async_fire(f"{DOMAIN}_trip_completed", trip)

    async def async_start_charge(self) -> None:
        """Persist a charging baseline without making an API request."""
        if self.data.get("active_charge"):
            return
        now = dt_util.utcnow()
        soc = self._number("battery")
        self.data["active_charge"] = {
            "start_time": now.isoformat(),
            "start_soc": soc,
            "start_mileage": self._number("mileage"),
            "capacity_kwh": self._capacity(),
            "charge_type": self._state("battery_charging_type") or "Unknown",
            "samples": ([{"time": now.isoformat(), "soc": soc}] if soc is not None else []),
        }
        self.data["current_charge_power_kw"] = None
        await self._save_and_refresh()

    async def async_track_charge_sample(self) -> None:
        """Derive a coarse battery-side kW value from subsequent SOC updates."""
        active = self.data.get("active_charge")
        soc = self._number("battery")
        if not isinstance(active, dict) or soc is None or not self._is_on("battery_charging"):
            return
        now = dt_util.utcnow()
        samples = [item for item in active.get("samples", []) if isinstance(item, dict)]
        previous = samples[-1] if samples else None
        previous_soc = self._as_float(previous.get("soc")) if previous else None
        previous_time = dt_util.parse_datetime(str(previous.get("time") or "")) if previous else None
        if previous_soc is not None and previous_time is not None and soc > previous_soc:
            seconds = (now - previous_time).total_seconds()
            capacity = self._as_float(active.get("capacity_kwh")) or _FALLBACK_CAPACITY_KWH
            power = (soc - previous_soc) * capacity / 100 * 3600 / seconds if seconds > 30 else None
            if power is not None and 0 < power <= 250:
                self.data["current_charge_power_kw"] = round(power, 2)
                samples.append({"time": now.isoformat(), "soc": soc, "power_kw": round(power, 2)})
            else:
                samples.append({"time": now.isoformat(), "soc": soc})
        elif previous_soc != soc:
            samples.append({"time": now.isoformat(), "soc": soc})
        else:
            return
        active["samples"] = samples[-180:]
        await self._save_and_refresh()

    def _schedule_charge_finalize(self, delay: timedelta) -> None:
        if not self.data.get("active_charge"):
            return
        if self._cancel_charge_finalize:
            self._cancel_charge_finalize()
        self._cancel_charge_finalize = async_call_later(
            self.hass, delay, self._async_finish_charge_callback
        )

    @callback
    def _async_finish_charge_callback(self, _now) -> None:
        self._cancel_charge_finalize = None
        self.hass.async_create_task(self.async_finish_charge())

    async def async_finish_charge(self) -> None:
        """Record one local, restart-safe result after an ended charge."""
        if self._is_on("battery_charging"):
            return
        active = self.data.get("active_charge")
        if not isinstance(active, dict):
            return
        start_time = dt_util.parse_datetime(str(active.get("start_time") or "")) or dt_util.utcnow()
        end_time = dt_util.utcnow()
        duration_seconds = max(1, int((end_time - start_time).total_seconds()))
        if duration_seconds > 48 * 3600:
            _LOGGER.warning("Discarding implausible local e-C3 charge candidate")
            self.data["active_charge"] = None
            self.data["current_charge_power_kw"] = None
            await self._save_and_refresh()
            return
        capacity = self._as_float(active.get("capacity_kwh")) or _FALLBACK_CAPACITY_KWH
        start_soc = self._as_float(active.get("start_soc"))
        end_soc = self._number("battery")
        energy_kwh = (
            round(max(0, end_soc - start_soc) * capacity / 100, 3)
            if start_soc is not None and end_soc is not None
            else None
        )
        samples = [item for item in active.get("samples", []) if isinstance(item, dict)]
        powers = [self._as_float(item.get("power_kw")) for item in samples]
        powers = [power for power in powers if power is not None]
        average_power = round(energy_kwh * 3600 / duration_seconds, 2) if energy_kwh is not None else None
        charge = {
            "id": end_time.isoformat(),
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "duration_seconds": duration_seconds,
            "duration": self._duration_text(duration_seconds),
            "soc_start": start_soc,
            "soc_end": end_soc,
            "capacity_kwh": round(capacity, 2),
            "energy_kwh": energy_kwh,
            "average_power_kw": average_power,
            "maximum_power_kw": round(max(powers), 2) if powers else average_power,
            "charge_type": active.get("charge_type") or "Unknown",
            "estimated": True,
        }
        self.data["charges"] = [
            item for item in self.data.get("charges", []) if item.get("id") != charge["id"]
        ] + [charge]
        self.data["last_charge"] = charge
        self.data["active_charge"] = None
        self.data["current_charge_power_kw"] = None
        mileage = self._number("mileage")
        if mileage is not None:
            self.data["charge_odometer_km"] = round(mileage, 3)
            self.data["charge_end_time"] = end_time.isoformat()
            self.data["charge_baseline_source"] = "locally_observed_charge"
        self._normalise_charges()
        await self._save_and_refresh()
        self.hass.bus.async_fire(f"{DOMAIN}_charge_completed", charge)

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

    def current_charge_power(self) -> float | None:
        return self._as_float(self.data.get("current_charge_power_kw"))

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

    async def _async_seed_from_recorder(self) -> None:
        """Backfill safe local baselines from already-recorded upstream data.

        The Stellantis integration retains a timestamp for the latest charge
        and a completed-trip row.  Their meaning is useful after a restart or
        package installation, but it is intentionally kept separate from the
        richer sessions observed live by this package.
        """
        if self._is_on("battery_charging"):
            return
        end = dt_util.utcnow()
        start = end - timedelta(hours=self._history_hours())

        if not self.data.get("trips"):
            await self._async_seed_trips(start, end)
        await self._async_seed_charge_baseline(start, end)

    async def _async_seed_charge_baseline(self, start, end) -> None:
        """Recover the latest charge boundary from upstream plus Recorder."""
        last_charge_entity = self.mapping.get("last_charge")
        last_charge_state = self.hass.states.get(last_charge_entity) if last_charge_entity else None
        charge_end = dt_util.parse_datetime(last_charge_state.state) if last_charge_state else None
        if charge_end is None or charge_end < start or charge_end > end + timedelta(minutes=5):
            return

        stored_end = dt_util.parse_datetime(str(self.data.get("charge_end_time") or ""))
        if (
            self._as_float(self.data.get("charge_odometer_km")) is not None
            and stored_end is not None
            and stored_end >= charge_end
        ):
            return

        mileage_entity = self.mapping.get("mileage")
        if not mileage_entity:
            return
        try:
            # Include the state at the query boundary: mileage often changes
            # only after a later drive, while the last known value at charge
            # completion is exactly the desired baseline.
            mileage_history = await self._async_get_history(
                mileage_entity,
                charge_end - timedelta(minutes=2),
                charge_end + timedelta(minutes=15),
            )
        except Exception as err:  # Recorder remains optional for live use.
            _LOGGER.debug("Could not seed e-C3 charge baseline from Recorder: %s", err)
            return

        before_end = []
        for state in mileage_history:
            state_time = self._history_timestamp(state)
            if state_time is not None and state_time <= charge_end:
                before_end.append(state)
        candidates = before_end or mileage_history[:1]
        if not candidates:
            return
        odometer = self._as_float(self._history_value(candidates[-1]))
        if odometer is None or odometer < 0:
            return

        self.data["charge_odometer_km"] = round(odometer, 3)
        self.data["charge_end_time"] = charge_end.isoformat()
        self.data["charge_baseline_source"] = "upstream_last_charge_recorder"
        await self._save_and_refresh()
        _LOGGER.info("Seeded e-C3 charge baseline at %.3f km", odometer)

    async def _async_seed_trips(self, start, end) -> None:
        """Import usable historic upstream trip rows for the 500-km window."""
        trip_entity = self.mapping.get("last_trip")
        soc_entity = self.mapping.get("battery")
        if not trip_entity or not soc_entity:
            return
        try:
            trip_history = await self._async_get_history(trip_entity, start, end)
            soc_history = await self._async_get_history(soc_entity, start, end)
        except Exception as err:  # Recorder is not required after live data exists.
            _LOGGER.debug("Could not seed e-C3 trip metrics from Recorder: %s", err)
            return

        imported: list[dict[str, Any]] = []
        for state in trip_history:
            trip = self._trip_from_upstream_history(state, soc_history)
            if trip is not None:
                imported.append(trip)
        if not imported:
            return

        existing_ids = {str(item.get("id")) for item in self.data.get("trips", [])}
        self.data["trips"].extend(
            trip for trip in imported if str(trip.get("id")) not in existing_ids
        )
        self._normalise_trips()
        await self._save_and_refresh()
        _LOGGER.info("Seeded e-C3 500-km window with %s historic trips", len(imported))

    async def _async_get_history(self, entity_id: str, start, end) -> list[Any]:
        """Read a bounded Recorder history without blocking the event loop."""
        history = await get_instance(self.hass).async_add_executor_job(
            recorder_history.get_significant_states,
            self.hass,
            start,
            end,
            [entity_id],
        )
        return history.get(entity_id, [])

    def _trip_from_upstream_history(
        self, state: Any, soc_history: list[Any]
    ) -> dict[str, Any] | None:
        """Turn one upstream completed-trip row into a conservative estimate."""
        distance = self._as_float(self._history_value(state))
        attributes = self._history_attributes(state)
        end_time = self._history_timestamp(state)
        duration_seconds = self._duration_seconds(attributes.get("duration"))
        start_mileage = self._as_float(attributes.get("start_mileage"))
        if (
            distance is None
            or distance <= 0
            or distance > 1000
            or end_time is None
            or duration_seconds is None
            or duration_seconds <= 0
            or duration_seconds > 24 * 3600
            or start_mileage is None
        ):
            return None

        start_time = end_time - timedelta(seconds=duration_seconds)
        start_soc = self._history_number_at(soc_history, start_time)
        end_soc = self._history_number_at(soc_history, end_time)
        if start_soc is None or end_soc is None or start_soc < end_soc:
            return None
        capacity = self._capacity()
        energy = round((start_soc - end_soc) * capacity / 100, 3)
        if energy < 0 or energy > capacity:
            return None
        return {
            "id": f"upstream-history:{end_time.isoformat()}",
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "duration_seconds": duration_seconds,
            "duration": self._duration_text(duration_seconds),
            "distance_km": round(distance, 3),
            "start_mileage": round(start_mileage, 3),
            "end_mileage": round(start_mileage + distance, 3),
            "average_speed": self._as_float(attributes.get("avg_speed")),
            "soc_start": start_soc,
            "soc_end": end_soc,
            "capacity_kwh": round(capacity, 2),
            "energy_kwh": energy,
            "energy_per_100_km": round(energy / distance * 100, 2),
            "estimated": True,
            "source": "upstream_history",
        }

    def _history_hours(self) -> int:
        try:
            configured = int(
                self.entry.options.get(
                    OPTION_HISTORY_HOURS, DEFAULT_OPTIONS[OPTION_HISTORY_HOURS]
                )
            )
        except (TypeError, ValueError):
            configured = DEFAULT_OPTIONS[OPTION_HISTORY_HOURS]
        return max(24, min(configured, 24 * 90))

    @staticmethod
    def _history_value(state: Any) -> Any:
        return state.state if hasattr(state, "state") else state.get("state")

    @staticmethod
    def _history_attributes(state: Any) -> dict[str, Any]:
        attributes = state.attributes if hasattr(state, "attributes") else state.get("attributes")
        return attributes if isinstance(attributes, dict) else {}

    @staticmethod
    def _history_timestamp(state: Any) -> datetime | None:
        value = state.last_updated if hasattr(state, "last_updated") else state.get("last_updated")
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            return dt_util.parse_datetime(value)
        return None

    def _history_number_at(self, states: list[Any], timestamp) -> float | None:
        value = None
        for state in states:
            updated = self._history_timestamp(state)
            if updated is None or updated > timestamp:
                break
            candidate = self._as_float(self._history_value(state))
            if candidate is not None:
                value = candidate
        return value

    @staticmethod
    def _duration_seconds(value: Any) -> int | None:
        try:
            hours, minutes, seconds = (int(part) for part in str(value).split(":"))
        except (TypeError, ValueError):
            return None
        if min(hours, minutes, seconds) < 0 or minutes >= 60 or seconds >= 60:
            return None
        return hours * 3600 + minutes * 60 + seconds

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

    def _normalise_charges(self) -> None:
        charges = [item for item in self.data.get("charges", []) if isinstance(item, dict)]
        charges.sort(key=lambda item: str(item.get("end_time") or item.get("id") or ""))
        self.data["charges"] = charges[-250:]

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

    def _state(self, mapping_key: str) -> str | None:
        entity_id = self.mapping.get(mapping_key)
        state = self.hass.states.get(entity_id) if entity_id else None
        if state is None or state.state in {"unknown", "unavailable", "none", ""}:
            return None
        return state.state

    @staticmethod
    def _as_float(value: Any) -> float | None:
        try:
            if isinstance(value, str):
                # Native Stellantis result attributes include values such as
                # "558.0 km" and "41.62 km/h".  Their numeric prefix is the
                # documented value; live sensor states remain plain numbers.
                value = value.replace(",", ".").strip().split(maxsplit=1)[0]
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
    METRIC_CURRENT_CHARGE_POWER: "current_charge_power",
    METRIC_LAST_CHARGE: "last_charge",
}
