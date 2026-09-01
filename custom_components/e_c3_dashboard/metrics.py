"""Restart-safe local driving metrics for one selected Stellantis device."""

from __future__ import annotations

from datetime import datetime, timedelta
import logging
from statistics import median
from typing import Any

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder import history as recorder_history
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    CONF_BATTERY_CAPACITY_KWH,
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
_FINALIZE_DELAY = timedelta(minutes=5)
_CHARGE_FINALIZE_DELAY = timedelta(minutes=2)
_RETRY_DELAY = timedelta(minutes=2)
_WINDOW_KM = 500.0
_STORE_VERSION = 1
_MAX_CHARGE_SAMPLES = 720


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
            "pending_trips": [],
            "active_charge": None,
            "charge_odometer_km": None,
            "charge_end_time": None,
            "charge_baseline_source": None,
            "last_trip": None,
            "last_charge": None,
            "current_charge_power_kw": None,
            "last_valid_battery_capacity_kwh": None,
            "updated_at": None,
        }
        self._entities: list[Any] = []
        self._unsub: list[callable] = []
        self._cancel_trip_finalize: callable | None = None
        self._cancel_charge_finalize: callable | None = None
        self.server_history = None

    def canonical_trips(self) -> list[dict[str, Any]]:
        """Return validated server trips, falling back to local rows."""
        rows = getattr(self.server_history, "data", {}).get("trips", []) if self.server_history else []
        return rows if rows else self.data.get("trips", [])

    def canonical_charges(self) -> list[dict[str, Any]]:
        """Return server-derived charges, falling back to local rows."""
        rows = getattr(self.server_history, "data", {}).get("charges", []) if self.server_history else []
        return rows if rows else self.data.get("charges", [])

    def canonical_last_trip(self) -> dict[str, Any] | None:
        rows = self.canonical_trips()
        return rows[-1] if rows else self.data.get("last_trip")

    def canonical_last_charge(self) -> dict[str, Any] | None:
        rows = self.canonical_charges()
        return rows[-1] if rows else self.data.get("last_charge")

    async def async_initialize(self) -> None:
        """Restore state and subscribe to upstream state changes."""
        stored = await self._store.async_load()
        if isinstance(stored, dict):
            self.data.update(stored)
        if not isinstance(self.data.get("pending_trips"), list):
            self.data["pending_trips"] = []
        # v0.4.11 briefly imported historical Last trip states. They are not
        # a stable session stream: Recorder also persists restored values and
        # therefore cannot distinguish repeated equal-distance journeys. Drop
        # only those rows and retain all sessions observed by this package.
        legacy_trip_imports = [
            item
            for item in self.data.get("trips", [])
            if isinstance(item, dict) and item.get("source") == "upstream_history"
        ]
        if legacy_trip_imports:
            self.data["trips"] = [
                item
                for item in self.data.get("trips", [])
                if not isinstance(item, dict) or item.get("source") != "upstream_history"
            ]
            await self._save_and_refresh()
        self._normalise_trips()
        self._normalise_charges()
        await self._async_capture_capacity()

        watched = [
            self.mapping.get("engine"),
            self.mapping.get("battery_charging"),
            self.mapping.get("battery"),
            self.mapping.get("battery_capacity"),
            self.mapping.get("mileage"),
            self.mapping.get("last_trip"),
        ]
        watched = [entity_id for entity_id in watched if entity_id]
        if watched:
            self._unsub.append(
                async_track_state_change_event(self.hass, watched, self._handle_state)
            )

        # Restore delayed drive completion after a Core restart. An ended drive
        # is kept separate from a later newly active drive.
        if self.data.get("active_trip") and self._is_off("engine"):
            await self._async_queue_active_trip_for_finalization()
        elif self._is_on("engine") and not self.data.get("active_trip"):
            await self.async_start_trip()
        if self.data.get("pending_trips"):
            self._schedule_finalize(_RETRY_DELAY)
        if self.data.get("active_charge") and self._is_off("battery_charging"):
            # After a restart there is no pending final SOC update to wait
            # for when the upstream sensor is already stably off. Finalize
            # immediately so a persisted active session cannot keep its last
            # derived power visible indefinitely.
            await self.async_finish_charge()
        elif self._is_on("battery_charging") and not self.data.get("active_charge"):
            await self.async_start_charge()

        # A fresh installation must not wait for the next journey or charge.
        # Reconcile only from Recorder data that the upstream integration has
        # already persisted; this never triggers a Stellantis request.
        if not self.data.get("charge_odometer_km"):
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
                self.hass.async_create_task(self._async_queue_active_trip_for_finalization())
        elif entity_id == self.mapping.get("battery_charging"):
            if new_state.state == "on" and (old_state is None or old_state.state != "on"):
                self.hass.async_create_task(self.async_start_charge())
            elif new_state.state == "off" and self.data.get("active_charge"):
                # The upstream binary sensor can recover from unavailable
                # directly to off after a restart.  Do not require the old
                # state to be on, otherwise the active session and its last
                # derived power remain stuck in the Store indefinitely.
                self._schedule_charge_finalize(_CHARGE_FINALIZE_DELAY)
        elif entity_id == self.mapping.get("battery") and self._is_on("battery_charging"):
            self.hass.async_create_task(self.async_track_charge_sample())
        elif entity_id == self.mapping.get("battery_capacity"):
            self.hass.async_create_task(self._async_capture_capacity())
        elif entity_id == self.mapping.get("mileage"):
            self.hass.async_create_task(self.async_capture_pending_trip_mileage(new_state.state))
        elif entity_id == self.mapping.get("last_trip"):
            self.hass.async_create_task(self.async_reconcile_pending_trip(new_state))

    async def async_start_trip(self) -> None:
        """Persist an ignition-on reference once per journey."""
        if self.data.get("active_trip"):
            return
        mileage = self._number("mileage")
        if mileage is None:
            _LOGGER.debug("Not starting local e-C3 trip: mileage is unavailable")
            return
        capacity, capacity_source = self.battery_capacity()
        self.data["active_trip"] = {
            "start_time": dt_util.utcnow().isoformat(),
            "start_mileage": mileage,
            "start_soc": self._number("battery"),
            "capacity_kwh": capacity,
            "capacity_source": capacity_source,
        }
        await self._save_and_refresh()

    async def _async_queue_active_trip_for_finalization(self) -> None:
        """Keep an ended drive separate while waiting for its odometer value."""
        active = self.data.get("active_trip")
        if not isinstance(active, dict):
            return

        now = dt_util.utcnow()
        start_mileage = self._as_float(active.get("start_mileage"))
        mileage = self._number("mileage")
        active["end_time"] = now.isoformat()
        active["end_soc"] = self._number("battery")
        active["end_mileage"] = (
            mileage
            if mileage is not None and start_mileage is not None and mileage > start_mileage
            else None
        )
        self.data["pending_trips"] = [
            item for item in self.data.get("pending_trips", []) if isinstance(item, dict)
        ] + [active]
        self.data["active_trip"] = None
        await self._save_and_refresh()
        await self.async_finish_trip()
        if self.data.get("pending_trips"):
            self._schedule_finalize(_FINALIZE_DELAY)

    def _schedule_finalize(self, delay: timedelta) -> None:
        if not self.data.get("pending_trips"):
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
        """Finalise each ended drive only with its captured endpoint."""
        pending = [
            item for item in self.data.get("pending_trips", []) if isinstance(item, dict)
        ]
        if not pending:
            return

        remaining: list[dict[str, Any]] = []
        completed: list[dict[str, Any]] = []
        now = dt_util.utcnow()
        for candidate in pending:
            start_mileage = self._as_float(candidate.get("start_mileage"))
            end_mileage = self._as_float(candidate.get("end_mileage"))
            start_time = dt_util.parse_datetime(str(candidate.get("start_time") or "")) or now
            end_time = dt_util.parse_datetime(str(candidate.get("end_time") or "")) or now
            if end_mileage is None or start_mileage is None or end_mileage <= start_mileage:
                if now - end_time > timedelta(hours=24):
                    _LOGGER.warning("Discarding unresolved local e-C3 trip candidate after 24 hours")
                else:
                    remaining.append(candidate)
                continue

            duration_seconds = max(1, int((end_time - start_time).total_seconds()))
            distance_km = round(end_mileage - start_mileage, 3)
            if distance_km > 1000 or duration_seconds > 24 * 3600:
                _LOGGER.warning("Discarding implausible local e-C3 trip candidate")
                continue

            capacity = self._as_float(candidate.get("capacity_kwh"))
            start_soc = self._as_float(candidate.get("start_soc"))
            end_soc = self._as_float(candidate.get("end_soc"))
            energy_kwh = (
                round(max(0, start_soc - end_soc) * capacity / 100, 3)
                if capacity is not None and start_soc is not None and end_soc is not None
                else None
            )
            consumption = (
                round(energy_kwh / distance_km * 100, 2)
                if energy_kwh is not None and distance_km > 0
                else None
            )
            completed.append({
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
                "capacity_kwh": round(capacity, 2) if capacity is not None else None,
                "capacity_source": candidate.get("capacity_source"),
                "energy_kwh": energy_kwh,
                "energy_per_100_km": consumption,
                "estimated": energy_kwh is not None,
            })

        self.data["pending_trips"] = remaining
        for trip in completed:
            self.data["trips"] = [
                item for item in self.data.get("trips", []) if item.get("id") != trip["id"]
            ] + [trip]
            self.data["last_trip"] = trip
        self._normalise_trips()
        await self._save_and_refresh()
        for trip in completed:
            self.hass.bus.async_fire(f"{DOMAIN}_trip_completed", trip)
        if remaining:
            self._schedule_finalize(_RETRY_DELAY)

    async def async_capture_pending_trip_mileage(self, state: str) -> None:
        """Assign an odometer update only to the most recent ended drive."""
        if self._is_on("engine"):
            return
        mileage = self._as_float(state)
        pending = [
            item for item in self.data.get("pending_trips", []) if isinstance(item, dict)
        ]
        if mileage is None or not pending:
            return
        candidate = pending[-1]
        start_mileage = self._as_float(candidate.get("start_mileage"))
        if start_mileage is None or mileage <= start_mileage:
            return
        candidate["end_mileage"] = mileage
        self.data["pending_trips"] = pending
        await self.async_finish_trip()

    async def async_reconcile_pending_trip(self, state: Any) -> None:
        """Use an upstream Last trip row to safely resolve delayed mileage."""
        attributes = getattr(state, "attributes", {}) or {}
        start_mileage = self._as_float(attributes.get("start_mileage"))
        distance = self._as_float(getattr(state, "state", None))
        if start_mileage is None or distance is None or distance <= 0:
            return
        for candidate in self.data.get("pending_trips", []):
            if not isinstance(candidate, dict):
                continue
            candidate_start = self._as_float(candidate.get("start_mileage"))
            if candidate_start is None or abs(candidate_start - start_mileage) > 0.1:
                continue
            candidate["end_mileage"] = round(start_mileage + distance, 3)
            await self.async_finish_trip()
            return

    async def async_start_charge(self) -> None:
        """Persist a charging baseline without making an API request."""
        if self.data.get("active_charge"):
            return
        now = dt_util.utcnow()
        first_sample = self._charge_sample()
        soc = first_sample.get("soc")
        location = self._current_position()
        self.data["active_charge"] = {
            "start_time": now.isoformat(),
            "start_soc": soc,
            "start_mileage": self._number("mileage"),
            "capacity_kwh": first_sample["capacity_kwh"],
            "capacity_source": first_sample.get("capacity_source"),
            "charge_type": first_sample.get("charge_type") or "Unknown",
            "location": location,
            "location_source": "live_tracker" if location else None,
            "samples": ([first_sample] if soc is not None else []),
        }
        self.data["current_charge_power_kw"] = None
        await self._save_and_refresh()

    async def async_track_charge_sample(self) -> None:
        """Persist a raw charge sample and derive only defensible power."""
        active = self.data.get("active_charge")
        sample = self._charge_sample()
        soc = sample.get("soc")
        if not isinstance(active, dict) or soc is None or not self._is_on("battery_charging"):
            return
        samples = [item for item in active.get("samples", []) if isinstance(item, dict)]
        previous = samples[-1] if samples else None
        previous_soc = self._as_float(previous.get("soc")) if previous else None
        previous_time = self._sample_time(previous) if previous else None
        current_time = self._sample_time(sample)
        previous_residual = self._as_float(previous.get("residual_kwh")) if previous else None
        residual = self._as_float(sample.get("residual_kwh"))
        seconds = (current_time - previous_time).total_seconds() if previous_time and current_time else None
        power = None
        power_source = None
        if seconds is not None and seconds > 0 and previous_residual is not None and residual is not None:
            power = (residual - previous_residual) * 3600 / seconds
            power_source = "residual_energy_delta"
        elif seconds is not None and seconds > 30 and previous_soc is not None and soc > previous_soc:
            capacity = self._as_float(sample.get("capacity_kwh")) or self._as_float(active.get("capacity_kwh"))
            if capacity is not None:
                power = (soc - previous_soc) * capacity / 100 * 3600 / seconds
                power_source = "soc_delta"
        if power is not None and 0 < power <= 250:
            sample["derived_power_kw"] = round(power, 2)
            sample["power_source"] = power_source
            self.data["current_charge_power_kw"] = sample["derived_power_kw"]
        # Preserve repeated whole-percent SOC reports as raw timeline points;
        # they simply have no derived power. Suppress only an actual duplicate
        # of the same upstream timestamp (for example a HA attribute refresh).
        if previous and previous.get("source_time") == sample.get("source_time"):
            return
        samples.append(sample)
        active["samples"] = samples[-_MAX_CHARGE_SAMPLES:]
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
        capacity = self._as_float(active.get("capacity_kwh"))
        start_soc = self._as_float(active.get("start_soc"))
        end_soc = self._number("battery")
        samples = [item for item in active.get("samples", []) if isinstance(item, dict)]
        start_residual = self._as_float(samples[0].get("residual_kwh")) if samples else None
        end_residual = self._number("battery_residual")
        residual_energy = (
            round(max(0, end_residual - start_residual), 3)
            if start_residual is not None and end_residual is not None
            else None
        )
        soc_energy = (
            round(max(0, end_soc - start_soc) * capacity / 100, 3)
            if capacity is not None and start_soc is not None and end_soc is not None
            else None
        )
        if residual_energy is not None:
            energy_kwh = residual_energy
            energy_source = "residual_energy_delta"
        elif soc_energy is not None:
            energy_kwh = soc_energy
            energy_source = "soc_delta"
        else:
            energy_kwh = None
            energy_source = None
        powers = [self._as_float(item.get("derived_power_kw", item.get("power_kw"))) for item in samples]
        powers = [power for power in powers if power is not None]
        average_power = round(energy_kwh * 3600 / duration_seconds, 2) if energy_kwh is not None else None
        power_sources = {item.get("power_source") for item in samples if item.get("power_source")}
        timestamp_sources = [item.get("timestamp_source") for item in samples]
        charge = {
            "id": end_time.isoformat(),
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "duration_seconds": duration_seconds,
            "duration": self._duration_text(duration_seconds),
            "soc_start": start_soc,
            "soc_end": end_soc,
            "capacity_kwh": round(capacity, 2) if capacity is not None else None,
            "capacity_source": active.get("capacity_source"),
            "energy_kwh": energy_kwh,
            "energy_source": energy_source,
            "average_power_kw": average_power,
            "maximum_power_kw": round(max(powers), 2) if powers else average_power,
            "minimum_power_kw": round(min(powers), 2) if powers else average_power,
            "median_power_kw": round(median(powers), 2) if powers else average_power,
            "maximum_power_kw_estimated": True,
            "power_estimated": energy_kwh is not None,
            "power_source": next(iter(power_sources)) if len(power_sources) == 1 else "mixed" if power_sources else None,
            "charge_type": active.get("charge_type") or "Unknown",
            "location": active.get("location"),
            "location_source": active.get("location_source"),
            # Persist the observed SOC timeline as well.  The points remain
            # coarse (whole-percent SOC), but they are the only source for a
            # restart-safe, battery-side curve when Recorder later expires.
            "samples": samples,
            "sample_count": len(samples),
            "source_timestamp_count": timestamp_sources.count("stellantis"),
            "ha_fallback_timestamp_count": timestamp_sources.count("home_assistant"),
            "estimated": energy_kwh is not None,
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
        capacity = self._as_float(active.get("capacity_kwh"))
        if start_soc is None or current_soc is None or capacity is None:
            return None
        return round(max(0, start_soc - current_soc) * capacity / 100, 3)

    def current_charge_power(self) -> float | None:
        return self._as_float(self.data.get("current_charge_power_kw"))

    def trailing_consumption(self) -> dict[str, Any]:
        remaining = _WINDOW_KM
        distance = 0.0
        energy = 0.0
        count = 0
        # Use the canonical server history when it is available.  The local
        # Store is a live-session fallback only; mixing it into this metric
        # caused stale/duplicate rows to affect the 500-km result.
        for trip in reversed(self.canonical_trips()):
            if trip.get("valid_for_statistics") is False:
                continue
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

    def battery_capacity(self) -> tuple[float | None, str | None]:
        """Return capacity and provenance without inventing a vehicle default."""
        current = self._number("battery_capacity")
        if current is not None and current > 0:
            return round(current, 3), "api"

        stored = self._as_float(self.data.get("last_valid_battery_capacity_kwh"))
        if stored is not None and stored > 0:
            return round(stored, 3), "last_api"

        configured = self._as_float(self.entry.data.get(CONF_BATTERY_CAPACITY_KWH))
        if configured is not None and configured > 0:
            return round(configured, 3), "configured"

        return None, None

    async def _async_capture_capacity(self) -> None:
        """Persist only a valid upstream/API capacity for later temporary gaps."""
        current = self._number("battery_capacity")
        if current is None or current <= 0:
            return
        current = round(current, 3)
        if self._as_float(self.data.get("last_valid_battery_capacity_kwh")) == current:
            return
        self.data["last_valid_battery_capacity_kwh"] = current
        await self._save_and_refresh()

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
                significant_changes_only=False,
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

    async def _async_get_history(
        self, entity_id: str, start, end, *, significant_changes_only: bool = True
    ) -> list[Any]:
        """Read a bounded Recorder history without blocking the event loop."""
        history = await get_instance(self.hass).async_add_executor_job(
            recorder_history.get_significant_states,
            self.hass,
            start,
            end,
            [entity_id],
            None,
            True,
            significant_changes_only,
        )
        return history.get(entity_id, [])

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
    def _history_timestamp(state: Any) -> datetime | None:
        value = state.last_updated if hasattr(state, "last_updated") else state.get("last_updated")
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            return dt_util.parse_datetime(value)
        return None

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

    def _charge_sample(self) -> dict[str, Any]:
        """Capture the best available timestamp and unmodified upstream values."""
        received_at = dt_util.utcnow()
        battery_entity = self.mapping.get("battery")
        state = self.hass.states.get(battery_entity) if battery_entity else None
        attributes = getattr(state, "attributes", {}) or {}
        source_time = self._parse_sample_timestamp(attributes.get("Last updated"))
        timestamp_source = "stellantis" if source_time else None
        if source_time is None and state is not None:
            source_time = getattr(state, "last_updated", None)
            timestamp_source = "home_assistant" if source_time else None
        if source_time is None:
            source_time = received_at
            timestamp_source = "received_at"
        capacity, capacity_source = self.battery_capacity()
        return {
            "source_time": source_time.isoformat(),
            "received_at": received_at.isoformat(),
            "timestamp_source": timestamp_source,
            # Compatibility bridge for older stores/tools that used `time`.
            "time": source_time.isoformat(),
            "soc": self._as_float(state.state if state else None),
            "capacity_kwh": capacity,
            "capacity_source": capacity_source,
            "residual_kwh": self._number("battery_residual"),
            "charging_rate_kmh": self._number("battery_charging_rate"),
            "charge_type": self._state("battery_charging_type") or "Unknown",
            "derived_power_kw": None,
            "power_source": None,
        }

    @staticmethod
    def _parse_sample_timestamp(value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return value
        if value is None:
            return None
        return dt_util.parse_datetime(str(value))

    def _sample_time(self, sample: dict[str, Any]) -> datetime | None:
        return self._parse_sample_timestamp(sample.get("source_time") or sample.get("time"))

    def _capacity(self) -> float | None:
        """Compatibility helper for existing callers; never invent a default."""
        return self.battery_capacity()[0]

    def _current_position(self) -> dict[str, Any] | None:
        """Capture a live tracker point when the selected device exposes it.

        This is optional enrichment for matching a live charge to a later
        server parking window.  It is deliberately stored as coordinates only
        and never reverse-geocoded here.
        """
        entity_id = self.mapping.get("vehicle")
        state = self.hass.states.get(entity_id) if entity_id else None
        attributes = getattr(state, "attributes", {}) or {}
        try:
            latitude = float(attributes.get("latitude"))
            longitude = float(attributes.get("longitude"))
        except (TypeError, ValueError):
            return None
        return {"geometry": {"coordinates": [longitude, latitude]}}

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
