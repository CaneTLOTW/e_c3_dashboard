"""Canonical e-C3 trip and charge history.

Server trips provide historical completeness.  Locally observed charge sessions
provide the accurate on/off boundaries and SOC samples that the trip API does
not expose.  This module combines both without ever turning a parking window
into a charging duration.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import logging
import math
from typing import Any

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder import history as recorder_history
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    CONF_VEHICLE_SLUG,
    DEFAULT_OPTIONS,
    DOMAIN,
    OPTION_HISTORY_HOURS,
    UPSTREAM_DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

# Keep the Home Assistant Store major version stable.  The on-disk v1 data
# predates this canonical schema, but `_migrate_data` performs the compatible
# in-data migration.  Bumping Store's major version without its explicit HA
# migration callback makes Home Assistant reject the existing file before our
# safe migration can run.
_STORE_VERSION = 1
_FALLBACK_CAPACITY_KWH = 43.4
_MIN_TRIP_DISTANCE_KM = 1.0
_MATCH_TOLERANCE = timedelta(minutes=10)


def _number(value: Any) -> float | None:
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def _parse_time(value: Any) -> datetime | None:
    return dt_util.parse_datetime(str(value)) if value else None


def _duration_seconds(value: Any, start: Any = None, end: Any = None) -> int | None:
    seconds = _number(value)
    if seconds is not None:
        return max(0, round(seconds))
    start_time, end_time = _parse_time(start), _parse_time(end)
    if start_time and end_time:
        return max(0, round((end_time - start_time).total_seconds()))
    return None


def _energy_entry(values: Any) -> dict[str, Any] | None:
    if not isinstance(values, list):
        return None
    return next(
        (item for item in values if isinstance(item, dict) and item.get("type") == "Electric"),
        None,
    )


def _position(value: Any) -> tuple[float, float] | None:
    if not isinstance(value, dict):
        return None
    geometry = value.get("geometry") if isinstance(value.get("geometry"), dict) else value
    coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        return None
    longitude, latitude = _number(coordinates[0]), _number(coordinates[1])
    if longitude is None or latitude is None:
        return None
    return longitude, latitude


def _position_distance_km(left: Any, right: Any) -> float | None:
    first, second = _position(left), _position(right)
    if not first or not second:
        return None
    # Sufficient for a plausibility decision.  It is deliberately not used for
    # navigation or for changing the backend's raw positions.
    return round(math.hypot((first[0] - second[0]) * 85, (first[1] - second[1]) * 111), 3)


def _trip_soc(trip: dict[str, Any], key: str) -> float | None:
    electric = _energy_entry(trip.get(key))
    return _number(electric.get("level")) if electric else None


def _capacity(value: Any) -> float:
    capacity = _number(value)
    return round(capacity, 2) if capacity is not None and capacity > 0 else _FALLBACK_CAPACITY_KWH


def _charge_type(value: Any, average_power_kw: Any = None) -> str:
    """Normalize AC/DC and use average load as a fallback.

    The upstream ``battery_charging_type`` entity can report ``NO`` even
    while a Recorder/live charging session is being captured.  When that
    happens, an observed average battery charging load is the best available
    fallback requested by the dashboard contract: values above 22 kW are DC,
    values up to and including 22 kW are AC.  A pure SOC-window reconstruction
    normally has no valid charging load and therefore remains Unknown.
    """
    normalized = str(value or "").strip().lower()
    if normalized in {"ac", "slow", "normal", "standard"}:
        return "AC"
    if normalized in {"dc", "fast", "quick", "rapid"}:
        return "DC"
    average_power = _number(average_power_kw)
    if average_power is not None and average_power >= 0:
        return "DC" if average_power > 22 else "AC"
    return "Unknown"


def _is_real_trip(trip: dict[str, Any]) -> bool:
    distance = _number(trip.get("distance_km", trip.get("distance")))
    return distance is not None and distance > 0


def _trip_sort_key(trip: dict[str, Any]) -> str:
    return str(trip.get("start_time") or trip.get("startedAt") or trip.get("id") or "")


def _time_in_window(start: Any, end: Any, window_start: Any, window_end: Any) -> bool:
    start_time, end_time = _parse_time(start), _parse_time(end)
    begin, finish = _parse_time(window_start), _parse_time(window_end)
    if not all((start_time, end_time, begin, finish)):
        return False
    return start_time >= begin - _MATCH_TOLERANCE and end_time <= finish + _MATCH_TOLERANCE


def _soc_matches(left: Any, right: Any, tolerance: float = 3.0) -> bool:
    left_number, right_number = _number(left), _number(right)
    return left_number is None or right_number is None or abs(left_number - right_number) <= tolerance


def normalize_trip(raw: dict[str, Any], capacity_kwh: Any = None) -> dict[str, Any]:
    """Normalise one raw Stellantis trip without discarding unknown fields."""
    start, end = raw.get("startedAt"), raw.get("stoppedAt")
    duration = _duration_seconds(raw.get("duration"), start, end)
    distance = _number(raw.get("distance"))
    start_mileage = _number(raw.get("startMileage"))
    end_mileage = start_mileage + distance if start_mileage is not None and distance is not None else None
    start_soc, end_soc = _trip_soc(raw, "startEnergies"), _trip_soc(raw, "endEnergies")
    capacity = _capacity(capacity_kwh)

    electric_consumption = _energy_entry(raw.get("energyConsumptions"))
    measured_energy = _number(electric_consumption.get("consumption")) if electric_consumption else None
    energy_kwh = round(measured_energy / 1000, 3) if measured_energy and measured_energy > 0 else None
    energy_estimated = energy_kwh is None
    energy_source = "stellantis_trip.energy_consumptions" if energy_kwh is not None else "derived_from_trip_soc"

    no_reliable_soc_energy = (
        distance is None
        or distance <= _MIN_TRIP_DISTANCE_KM
        or start_soc is None
        or end_soc is None
        or end_soc >= start_soc
    )
    if energy_kwh is None and not no_reliable_soc_energy:
        energy_kwh = round((start_soc - end_soc) * capacity / 100, 3)
    if energy_kwh is None:
        energy_source = "not_reliable_short_or_no_soc_change"

    kinetic = raw.get("kinetic") if isinstance(raw.get("kinetic"), dict) else {}
    raw_avg_speed = _number(kinetic.get("avgSpeed", kinetic.get("averageSpeed")))
    # The verified e-C3 API emits avgSpeed in m/s.  Treat outliers as absent
    # and fall back to distance/duration instead of displaying a wrong unit.
    api_speed_kmh = raw_avg_speed * 3.6 if raw_avg_speed is not None else None
    fallback_speed_kmh = (
        distance / (duration / 3600)
        if distance is not None and duration and duration > 0
        else None
    )
    average_speed_kmh = api_speed_kmh if api_speed_kmh is not None and 0 <= api_speed_kmh <= 300 else fallback_speed_kmh

    return {
        "id": raw.get("id"),
        "server_id": raw.get("id"),
        "status": "complete",
        "source": "stellantis_trips",
        "sources": ["stellantis_trips"],
        "confidence": "high" if raw.get("done") is True else "medium",
        "start_time": start,
        "end_time": end,
        "duration_seconds": duration,
        "distance_km": distance,
        "start_mileage_km": start_mileage,
        "end_mileage_km": round(end_mileage, 3) if end_mileage is not None else None,
        # Backwards-compatible aliases for existing cards.
        "start_mileage": start_mileage,
        "end_mileage": round(end_mileage, 3) if end_mileage is not None else None,
        "soc_start": start_soc,
        "soc_end": end_soc,
        "capacity_kwh": capacity,
        "energy_kwh": energy_kwh,
        "energy_estimated": energy_estimated,
        "energy_source": energy_source,
        "consumption_kwh_100km": (
            round(energy_kwh / distance * 100, 2)
            if energy_kwh is not None and distance and distance > 0
            else None
        ),
        "energy_per_100_km": (
            round(energy_kwh / distance * 100, 2)
            if energy_kwh is not None and distance and distance > 0
            else None
        ),
        "consumption_estimated": energy_estimated,
        "average_speed_kmh": round(average_speed_kmh, 1) if average_speed_kmh is not None else None,
        "average_speed": round(average_speed_kmh, 1) if average_speed_kmh is not None else None,
        "raw_start_position": raw.get("startPosition"),
        "raw_stop_position": raw.get("stopPosition"),
        "display_start_position": raw.get("startPosition"),
        "display_end_position": raw.get("stopPosition"),
        "position_source": "raw_stop" if _position(raw.get("stopPosition")) else None,
        "created_at": raw.get("createdAt"),
        "updated_at": raw.get("updatedAt"),
        "raw_server": dict(raw),
    }


def derive_trip_display_positions(trips: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep raw positions intact and derive a more plausible display target."""
    real_trips = [trip for trip in sorted(trips, key=_trip_sort_key) if _is_real_trip(trip)]
    following_start: dict[str, Any] = {}
    for previous, following in zip(real_trips, real_trips[1:]):
        if previous.get("id"):
            following_start[str(previous["id"])] = following.get("raw_start_position")

    for trip in trips:
        start, stop = trip.get("raw_start_position"), trip.get("raw_stop_position")
        distance = _number(trip.get("distance_km"))
        stop_distance = _position_distance_km(start, stop)
        next_start = following_start.get(str(trip.get("id")))
        if distance and distance > _MIN_TRIP_DISTANCE_KM and stop_distance is not None and stop_distance <= 0.3 and _position(next_start):
            trip["display_end_position"] = next_start
            trip["position_source"] = "next_real_trip_start"
        elif _position(stop):
            trip["display_end_position"] = stop
            trip["position_source"] = "raw_stop"
        else:
            trip["display_end_position"] = None
            trip["position_source"] = None
    return trips


def reconstruct_charge_windows(trips: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Create fallback charge events only from adjacent real server trips."""
    real_trips = [trip for trip in sorted(trips, key=_trip_sort_key) if _is_real_trip(trip)]
    charges: list[dict[str, Any]] = []
    for previous, following in zip(real_trips, real_trips[1:]):
        soc_start, soc_end = _number(previous.get("soc_end")), _number(following.get("soc_start"))
        window_start, window_end = previous.get("end_time"), following.get("start_time")
        if (
            soc_start is None
            or soc_end is None
            or soc_end <= soc_start
            or not window_start
            or not window_end
            or not previous.get("id")
            or not following.get("id")
        ):
            continue
        delta_soc = round(soc_end - soc_start, 1)
        capacity = _capacity(following.get("capacity_kwh") or previous.get("capacity_kwh"))
        energy = round(delta_soc * capacity / 100, 3)
        charge_id = f"charge:{previous['id']}:{following['id']}"
        charges.append(
            {
                "id": charge_id,
                "server_id": charge_id,
                "status": "complete",
                "quality": "reconstructed",
                "source": "stellantis_trip_soc",
                "sources": ["stellantis_trips"],
                "previous_trip_id": previous["id"],
                "next_trip_id": following["id"],
                "parking_mileage_km": previous.get("end_mileage_km"),
                "window_start": window_start,
                "window_end": window_end,
                "standstill_duration_seconds": _duration_seconds(None, window_start, window_end),
                "start_time": None,
                "end_time": None,
                "charging_duration_seconds": None,
                "soc_start": soc_start,
                "soc_end": soc_end,
                "delta_soc": delta_soc,
                "capacity_kwh": capacity,
                "energy_kwh": energy,
                "battery_energy_added_kwh": energy,
                "energy_estimated": True,
                "energy_source": "soc_delta_between_real_trips",
                "average_power_kw": None,
                "average_power_estimated": True,
                "maximum_power_kw": None,
                "charge_type": "Unknown",
                "location": following.get("raw_start_position"),
                "location_source": "next_trip_start" if _position(following.get("raw_start_position")) else None,
                "has_charge_curve": False,
                "samples": [],
                "confidence": "medium" if delta_soc > 1 else "low",
                "estimated": True,
            }
        )
    return charges


def normalize_observed_charge(
    local: dict[str, Any], source: str = "ha_live"
) -> dict[str, Any] | None:
    """Map the restart-safe local session to the canonical charge contract."""
    start, end = local.get("start_time"), local.get("end_time")
    if not start or not end:
        return None
    capacity = _capacity(local.get("capacity_kwh"))
    samples = [sample for sample in local.get("samples", []) if isinstance(sample, dict)]
    local_id = str(local.get("id") or start)
    average_power = _number(local.get("average_power_kw"))
    return {
        # Match the stable browser selection ID created by charge-history-core.
        "id": f"charge-{start}",
        "raw_live_id": local_id,
        "status": "complete",
        "quality": "observed",
        "source": source,
        "sources": [source],
        "window_start": start,
        "window_end": end,
        "standstill_duration_seconds": _duration_seconds(local.get("duration_seconds"), start, end),
        "start_time": start,
        "end_time": end,
        "charging_duration_seconds": _duration_seconds(local.get("duration_seconds"), start, end),
        "soc_start": _number(local.get("soc_start")),
        "soc_end": _number(local.get("soc_end")),
        "capacity_kwh": capacity,
        "start_mileage_km": _number(local.get("start_mileage")),
        "energy_kwh": _number(local.get("energy_kwh")),
        "battery_energy_added_kwh": _number(local.get("energy_kwh")),
        "energy_estimated": True,
        "energy_source": "local_live_soc_delta",
        "average_power_kw": average_power,
        "average_power_estimated": True,
        "maximum_power_kw": _number(local.get("maximum_power_kw")),
        "charge_type": _charge_type(local.get("charge_type"), average_power),
        # A live session may have captured the current tracker location.  It
        # remains optional: a missing tracker must never make a charge match
        # fail.
        "location": local.get("location"),
        "location_source": local.get("location_source"),
        "previous_trip_id": None,
        "next_trip_id": None,
        "has_charge_curve": len(samples) >= 2,
        "samples": samples,
        "sample_count": int(_number(local.get("sample_count")) or len(samples)),
        "source_timestamp_count": int(_number(local.get("source_timestamp_count")) or 0),
        "ha_fallback_timestamp_count": int(_number(local.get("ha_fallback_timestamp_count")) or 0),
        "minimum_power_kw": _number(local.get("minimum_power_kw")),
        "median_power_kw": _number(local.get("median_power_kw")),
        "maximum_power_kw_estimated": bool(local.get("maximum_power_kw_estimated", True)),
        "power_estimated": bool(local.get("power_estimated", True)),
        "power_source": local.get("power_source"),
        "confidence": "high",
        "estimated": True,
    }


def merge_charges(
    charge_windows: list[dict[str, Any]], observed_charges: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Merge observed sessions into server windows, including split charging.

    A server parking window can contain multiple real charging sessions.  A
    single observed session must not be required to explain the complete
    window SOC delta; the observed sessions together may cover it.
    """
    merged: list[dict[str, Any]] = []
    claimed_observed: set[int] = set()
    suppressed_windows: set[int] = set()

    def match_score(observed: dict[str, Any], window: dict[str, Any]) -> tuple[float, float, float]:
        observed_start, observed_end = _parse_time(observed.get("start_time")), _parse_time(observed.get("end_time"))
        window_start, window_end = _parse_time(window.get("window_start")), _parse_time(window.get("window_end"))
        overlap = 0.0
        if observed_start and observed_end and window_start and window_end:
            overlap = max(0.0, (min(observed_end, window_end) - max(observed_start, window_start)).total_seconds())
        observed_duration = max(1.0, (observed_end - observed_start).total_seconds()) if observed_start and observed_end else 1.0
        overlap_penalty = 1 - min(1.0, overlap / observed_duration)
        mileage = _number(observed.get("start_mileage_km"))
        parking_mileage = _number(window.get("parking_mileage_km"))
        mileage_penalty = abs(mileage - parking_mileage) if mileage is not None and parking_mileage is not None else 0.5
        location_distance = _position_distance_km(observed.get("location"), window.get("location"))
        location_penalty = location_distance if location_distance is not None else 0.5
        return overlap_penalty, mileage_penalty, location_penalty

    def enrich(observed: dict[str, Any], window: dict[str, Any], *, split: dict[str, Any] | None = None) -> dict[str, Any]:
        score = match_score(observed, window)
        enriched = dict(window)
        enriched.update(observed)
        enriched.update(
            {
                "window_start": window["window_start"],
                "window_end": window["window_end"],
                "standstill_duration_seconds": window.get("standstill_duration_seconds"),
                "previous_trip_id": window.get("previous_trip_id"),
                "next_trip_id": window.get("next_trip_id"),
                "location": window.get("location"),
                "location_source": window.get("location_source"),
                "match_metadata": {
                    "time_overlap_ratio": round(1 - score[0], 3),
                    "start_mileage_delta_km": (
                        round(abs(_number(observed.get("start_mileage_km")) - _number(window.get("parking_mileage_km"))), 3)
                        if _number(observed.get("start_mileage_km")) is not None and _number(window.get("parking_mileage_km")) is not None
                        else None
                    ),
                    "location_distance_km": _position_distance_km(observed.get("location"), window.get("location")),
                    **({"split_session_coverage": split} if split else {}),
                },
                "sources": list(dict.fromkeys([
                    *(observed.get("sources") or [observed.get("source")]),
                    "stellantis_trips",
                ])),
                "quality": "observed",
                "source": observed.get("source") or "ha_live",
                "confidence": "high",
            }
        )
        return enriched

    def positive_delta(observed: dict[str, Any]) -> float | None:
        start, end = _number(observed.get("soc_start")), _number(observed.get("soc_end"))
        return round(end - start, 1) if start is not None and end is not None and end > start else None

    # First resolve split observed sessions as a group.  This suppresses only
    # the reconstructed fallback; the observed sessions remain separate rows.
    for window in charge_windows:
        candidates = [
            (index, observed)
            for index, observed in enumerate(observed_charges)
            if index not in claimed_observed
            and _time_in_window(
                observed.get("start_time"), observed.get("end_time"),
                window.get("window_start"), window.get("window_end"),
            )
        ]
        positive = [(index, observed, positive_delta(observed)) for index, observed in candidates]
        positive = [(index, observed, delta) for index, observed, delta in positive if delta is not None]
        window_start_soc = _number(window.get("soc_start"))
        window_end_soc = _number(window.get("soc_end"))
        target_delta = (
            round(window_end_soc - window_start_soc, 1)
            if window_start_soc is not None and window_end_soc is not None and window_end_soc > window_start_soc
            else None
        )
        if len(positive) < 2 or target_delta is None:
            continue
        covered_start = min(_number(observed.get("soc_start")) for _, observed, _ in positive)
        covered_end = max(_number(observed.get("soc_end")) for _, observed, _ in positive)
        total_delta = round(sum(delta for _, _, delta in positive), 1)
        tolerance = max(2.0, min(4.0, float(len(positive))))
        if (
            covered_start is None
            or covered_end is None
            or covered_start > window_start_soc + tolerance
            or covered_end < window_end_soc - tolerance
            or abs(total_delta - target_delta) > tolerance
        ):
            continue
        coverage = {
            "observed_session_count": len(positive),
            "window_soc_delta": target_delta,
            "covered_soc_start": covered_start,
            "covered_soc_end": covered_end,
            "observed_soc_delta_sum": total_delta,
            "soc_tolerance": tolerance,
        }
        suppressed_windows.add(id(window))
        for index, observed, _ in positive:
            claimed_observed.add(index)
            merged.append(enrich(observed, window, split=coverage))

    remaining_windows = [window for window in charge_windows if id(window) not in suppressed_windows]
    for index, observed in enumerate(observed_charges):
        if index in claimed_observed:
            continue
        matches = [
            window
            for window in remaining_windows
            if _time_in_window(
                observed.get("start_time"),
                observed.get("end_time"),
                window.get("window_start"),
                window.get("window_end"),
            )
            and _soc_matches(observed.get("soc_start"), window.get("soc_start"))
            and _soc_matches(observed.get("soc_end"), window.get("soc_end"))
        ]
        if matches:
            matched = min(matches, key=lambda window: match_score(observed, window))
            remaining_windows.remove(matched)
            merged.append(enrich(observed, matched))
        else:
            merged.append(observed)
    merged.extend(remaining_windows)
    return sorted(
        merged,
        key=lambda charge: str(
            charge.get("start_time") or charge.get("window_start") or charge.get("id") or ""
        ),
    )


class ServerHistoryManager:
    """Maintain raw server data and the single canonical dashboard history."""

    def __init__(self, hass, entry, entity_mapping, metrics=None):
        self.hass = hass
        self.entry = entry
        self.entity_mapping = entity_mapping
        self.metrics = metrics
        slug = entry.data[CONF_VEHICLE_SLUG]
        self._store = Store(hass, _STORE_VERSION, f"{DOMAIN}_{slug}_server_history")
        self.data: dict[str, Any] = self._empty_data()
        self._entities: list[Any] = []
        self._client = None
        self._vehicle = None
        self._latest_recorder_capacity_samples: list[dict[str, Any]] = []

    @staticmethod
    def _empty_data() -> dict[str, Any]:
        return {
            "server_trips_raw": [],
            "recorder_observed_charges": [],
            "recorder_capacity_samples": [],
            "legacy_live_snapshot": None,
            "canonical_trips": [],
            "canonical_charges": [],
            # Kept for entities/cards from versions before the canonical store.
            "trips": [],
            "charges": [],
            "vehicle_info": {},
            "migration_metadata": {"schema": 2, "migrated_at": None},
            "sync_metadata": {"last_sync": None, "sync_mode": None},
            "updated_at": None,
            "last_sync": None,
            "sync_mode": None,
            "error": None,
            "telemetry": {"available": False},
        }

    def register_entity(self, entity) -> None:
        self._entities.append(entity)

    def _migrate_data(self, stored: dict[str, Any]) -> None:
        """Read v1 data without losing its raw fields, then rebuild v2 aliases."""
        if isinstance(stored.get("server_trips_raw"), list):
            self.data.update(stored)
            return
        legacy_trips = [item for item in stored.get("trips", []) if isinstance(item, dict)]
        raw_trips = [
            item.get("raw_server") if isinstance(item.get("raw_server"), dict) else {
                key: value
                for key, value in item.items()
                if key
                not in {
                    "server_id", "source", "sources", "estimated", "confidence", "start_time",
                    "end_time", "duration_seconds", "distance_km", "start_mileage", "end_mileage",
                    "soc_start", "soc_end", "capacity_kwh", "energy_kwh", "energy_source",
                    "energy_estimated", "energy_per_100_km", "average_speed", "avg_consumption_raw",
                }
            }
            for item in legacy_trips
        ]
        self.data.update(self._empty_data())
        self.data["server_trips_raw"] = [item for item in raw_trips if item.get("id")]
        self.data["vehicle_info"] = stored.get("vehicle_info", {})
        self.data["telemetry"] = stored.get("telemetry", {"available": False})
        self.data["migration_metadata"] = {
            "schema": 2,
            "migrated_at": dt_util.utcnow().isoformat(),
            "from_schema": 1,
        }

    def _capacity_for_trip(self, raw: dict[str, Any]) -> float:
        historic = self._historical_capacity(raw.get("startedAt"))
        if historic is not None:
            return historic
        # A matching local live trip may have captured the event capacity.
        for trip in getattr(self.metrics, "data", {}).get("trips", []) if self.metrics else []:
            if not isinstance(trip, dict):
                continue
            if (
                abs((_number(trip.get("start_mileage")) or -1) - (_number(raw.get("startMileage")) or -2)) <= 0.1
                and _number(trip.get("capacity_kwh")) is not None
            ):
                return _capacity(trip.get("capacity_kwh"))
        capacity_entity = self.entity_mapping.get("battery_capacity")
        current = self.hass.states.get(capacity_entity) if capacity_entity else None
        if current and _number(current.state) is not None:
            return _capacity(current.state)
        return _capacity(None)

    def _historical_capacity(self, timestamp: Any) -> float | None:
        event_time = _parse_time(timestamp)
        if event_time is None:
            return None
        candidates = []
        for sample in self.data.get("recorder_capacity_samples", []):
            if not isinstance(sample, dict):
                continue
            sample_time = _parse_time(sample.get("time"))
            capacity = _number(sample.get("capacity_kwh"))
            if sample_time and capacity is not None and capacity > 0 and sample_time <= event_time:
                candidates.append((sample_time, capacity))
        return _capacity(max(candidates, key=lambda item: item[0])[1]) if candidates else None

    def _rebuild_canonical(self) -> None:
        trips = [
            normalize_trip(raw, self._capacity_for_trip(raw))
            for raw in self.data.get("server_trips_raw", [])
            if isinstance(raw, dict) and raw.get("id")
        ]
        by_id = {trip["id"]: trip for trip in trips if trip.get("id")}
        all_trips = derive_trip_display_positions(
            sorted(by_id.values(), key=_trip_sort_key)
        )
        self._annotate_legacy_trip_matches(all_trips)
        observed_by_id: dict[str, dict[str, Any]] = {}

        def add_observed(normalized: dict[str, Any], *, prefer_new: bool) -> None:
            """Keep one observed session for the same physical charge.

            Recorder and the restart-safe local Store can differ by a few
            microseconds at the on/off edges.  Match only an extremely close
            start plus compatible SOC here, so two genuinely separate charge
            sessions are not collapsed.
            """
            start = _parse_time(normalized.get("start_time"))
            existing_key = next(
                (
                    key
                    for key, existing in observed_by_id.items()
                    if key == normalized["id"]
                    or (
                        start
                        and (existing_start := _parse_time(existing.get("start_time")))
                        and abs((start - existing_start).total_seconds()) <= 90
                        and _soc_matches(normalized.get("soc_start"), existing.get("soc_start"), 1)
                        and _soc_matches(normalized.get("soc_end"), existing.get("soc_end"), 2)
                    )
                ),
                None,
            )
            if existing_key is None:
                observed_by_id[normalized["id"]] = normalized
                return
            existing = observed_by_id.pop(existing_key)
            preferred, supplementary = (normalized, existing) if prefer_new else (existing, normalized)
            if not preferred.get("has_charge_curve") and supplementary.get("has_charge_curve"):
                preferred["samples"] = supplementary.get("samples", [])
                preferred["has_charge_curve"] = True
                preferred["sample_count"] = len(preferred["samples"])
                for field in (
                    "source_timestamp_count",
                    "ha_fallback_timestamp_count",
                    "minimum_power_kw",
                    "median_power_kw",
                    "maximum_power_kw",
                    "maximum_power_kw_estimated",
                    "power_estimated",
                    "power_source",
                ):
                    if supplementary.get(field) is not None:
                        preferred[field] = supplementary[field]
            preferred["sources"] = list(dict.fromkeys([
                *(preferred.get("sources") or []),
                *(supplementary.get("sources") or []),
            ]))
            observed_by_id[preferred["id"]] = preferred

        for recorder_charge in self.data.get("recorder_observed_charges", []):
            if normalized := normalize_observed_charge(recorder_charge, "ha_recorder"):
                add_observed(normalized, prefer_new=False)
        # Persisted live results are preferred over a Recorder reconstruction
        # at the same start time because their on/off boundaries are captured
        # directly by the integration.
        for local_charge in getattr(self.metrics, "data", {}).get("charges", []) if self.metrics else []:
            if isinstance(local_charge, dict) and (normalized := normalize_observed_charge(local_charge)):
                add_observed(normalized, prefer_new=True)
        windows = reconstruct_charge_windows(all_trips)
        canonical_charges = merge_charges(windows, list(observed_by_id.values()))
        self.data["canonical_trips"] = all_trips
        self.data["canonical_charges"] = canonical_charges
        self.data["trips"] = [trip for trip in all_trips if _is_real_trip(trip)]
        self.data["charges"] = canonical_charges

    def _annotate_legacy_trip_matches(self, server_trips: list[dict[str, Any]]) -> None:
        """Attach comparison metadata without making local rows canonical."""
        legacy = self.data.get("legacy_live_snapshot") or {}
        local_trips = [row for row in legacy.get("trips", []) if isinstance(row, dict)]
        for server_trip in server_trips:
            if not _is_real_trip(server_trip):
                continue
            start_time = _parse_time(server_trip.get("start_time"))
            start_mileage = _number(server_trip.get("start_mileage"))
            distance = _number(server_trip.get("distance_km"))
            candidates: list[tuple[float, dict[str, Any]]] = []
            for local_trip in local_trips:
                local_start = _parse_time(local_trip.get("start_time"))
                local_mileage = _number(local_trip.get("start_mileage"))
                local_distance = _number(local_trip.get("distance_km"))
                mileage_delta = abs(start_mileage - local_mileage) if start_mileage is not None and local_mileage is not None else None
                time_delta = abs((start_time - local_start).total_seconds()) if start_time and local_start else None
                distance_delta = abs(distance - local_distance) if distance is not None and local_distance is not None else None
                if not ((mileage_delta is not None and mileage_delta <= 0.2) or (time_delta is not None and time_delta <= 15 * 60)):
                    continue
                if distance_delta is not None and distance_delta > 2:
                    continue
                candidates.append(((mileage_delta or 1) * 100 + (time_delta or 15 * 60) / 60, local_trip))
            if not candidates:
                continue
            _, matched = min(candidates, key=lambda item: item[0])
            server_trip["legacy_live_match"] = {
                "local_id": matched.get("id"),
                "distance_delta_km": round((distance or 0) - (_number(matched.get("distance_km")) or 0), 3),
                "soc_start_delta": (
                    round(((_number(server_trip.get("soc_start")) or 0) - (_number(matched.get("soc_start")) or 0)), 1)
                    if _number(server_trip.get("soc_start")) is not None and _number(matched.get("soc_start")) is not None
                    else None
                ),
                "soc_end_delta": (
                    round(((_number(server_trip.get("soc_end")) or 0) - (_number(matched.get("soc_end")) or 0)), 1)
                    if _number(server_trip.get("soc_end")) is not None and _number(matched.get("soc_end")) is not None
                    else None
                ),
            }

    async def async_full_sync(self) -> None:
        """Explicitly refresh all server pages without deleting local history."""
        self.data["server_trips_raw"] = []
        self.data["canonical_trips"] = []
        self.data["canonical_charges"] = []
        self.data["trips"] = []
        self.data["charges"] = []
        self.data["sync_metadata"] = {"last_sync": None, "sync_mode": None}
        await self._store.async_save(self.data)
        await self.async_initialize()

    async def async_initialize(self, _retry: int = 0) -> None:
        stored = await self._store.async_load()
        if isinstance(stored, dict):
            self._migrate_data(stored)
        if self.data.get("legacy_live_snapshot") is None and self.metrics:
            # Preserve the pre-migration local results in the new store as a
            # restore/comparison artifact. The original metrics Store remains
            # untouched and is still the authoritative rollback source.
            self.data["legacy_live_snapshot"] = {
                "captured_at": dt_util.utcnow().isoformat(),
                "trips": [item for item in self.metrics.data.get("trips", []) if isinstance(item, dict)],
                "charges": [item for item in self.metrics.data.get("charges", []) if isinstance(item, dict)],
                "last_trip": self.metrics.data.get("last_trip"),
                "last_charge": self.metrics.data.get("last_charge"),
            }
            self.data["migration_metadata"] = {
                **self.data.get("migration_metadata", {}),
                "legacy_snapshot_captured_at": self.data["legacy_live_snapshot"]["captured_at"],
                "legacy_trip_count": len(self.data["legacy_live_snapshot"]["trips"]),
                "legacy_charge_count": len(self.data["legacy_live_snapshot"]["charges"]),
            }
        self._client, self._vehicle = self._resolve_upstream()
        if not self._client or not self._vehicle:
            self.data["error"] = "upstream_vehicle_unavailable"
            await self._store.async_save(self.data)
            if _retry < 3:
                self.hass.async_create_task(self._retry_initialize(_retry + 1))
            return

        self.data["vehicle_info"] = self._public_vehicle_info(self._vehicle)
        self._latest_recorder_capacity_samples = list(self.data.get("recorder_capacity_samples", []))
        self.data["recorder_observed_charges"] = await self._async_recorder_charges()
        self.data["recorder_capacity_samples"] = self._latest_recorder_capacity_samples
        latest = max(
            (item.get("startedAt") for item in self.data.get("server_trips_raw", []) if item.get("startedAt")),
            default=None,
        )
        since = None
        parsed = _parse_time(latest)
        if parsed:
            since = (parsed - timedelta(hours=2)).isoformat()

        try:
            result = await self._client.get_vehicle_trips_history(self._vehicle, since=since)
            incoming = [
                item for item in result.get("trips", [])
                if isinstance(item, dict) and item.get("id")
            ]
            raw_by_id = {
                item.get("id"): item
                for item in self.data.get("server_trips_raw", [])
                if isinstance(item, dict) and item.get("id")
            }
            raw_by_id.update({item["id"]: item for item in incoming})
            self.data["server_trips_raw"] = sorted(raw_by_id.values(), key=_trip_sort_key)
            self._rebuild_canonical()
            now = dt_util.utcnow().isoformat()
            mode = "incremental" if since else "full"
            self.data.update(
                {
                    "updated_at": now,
                    "last_sync": now,
                    "sync_mode": mode,
                    "sync_metadata": {"last_sync": now, "sync_mode": mode},
                    "error": None,
                }
            )
            await self._store.async_save(self.data)
        except Exception as err:  # Existing canonical data survives API failure.
            self.data["error"] = str(err)
            _LOGGER.warning("Server trip history unavailable: %s", err)
            await self._store.async_save(self.data)

        for entity in self._entities:
            entity.async_write_ha_state()

    async def _retry_initialize(self, retry: int) -> None:
        import asyncio

        await asyncio.sleep(5)
        await self.async_initialize(retry)

    @staticmethod
    def _state_value(state: Any) -> Any:
        return state.state if hasattr(state, "state") else state.get("state")

    @staticmethod
    def _state_time(state: Any) -> datetime | None:
        value = state.last_updated if hasattr(state, "last_updated") else state.get("last_updated")
        return value if isinstance(value, datetime) else _parse_time(value)

    @classmethod
    def _state_rows(cls, states: list[Any]) -> list[tuple[datetime, Any]]:
        rows = [(timestamp, cls._state_value(state)) for state in states if (timestamp := cls._state_time(state))]
        return sorted(rows, key=lambda item: item[0])

    @staticmethod
    def _number_at(rows: list[tuple[datetime, Any]], timestamp: datetime) -> float | None:
        value = next((value for time, value in reversed(rows) if time <= timestamp and _number(value) is not None), None)
        return _number(value)

    @staticmethod
    def _text_at(rows: list[tuple[datetime, Any]], timestamp: datetime) -> str | None:
        value = next((value for time, value in reversed(rows) if time <= timestamp and str(value).strip()), None)
        return str(value) if value is not None else None

    async def _async_recorder_charges(self) -> list[dict[str, Any]]:
        """Rebuild observed historical sessions from local Recorder states.

        This is a local read; it neither polls Stellantis nor invents values
        when a Recorder boundary is missing.  Stored live sessions still win
        during canonical merging.
        """
        charging_entity = self.entity_mapping.get("battery_charging")
        soc_entity = self.entity_mapping.get("battery")
        if not charging_entity or not soc_entity:
            self._latest_recorder_capacity_samples = self.data.get("recorder_capacity_samples", [])
            return self.data.get("recorder_observed_charges", [])
        entity_ids = [charging_entity, soc_entity]
        for key in ("battery_capacity", "battery_charging_type"):
            if entity_id := self.entity_mapping.get(key):
                entity_ids.append(entity_id)
        try:
            hours = int(self.entry.options.get(OPTION_HISTORY_HOURS, DEFAULT_OPTIONS[OPTION_HISTORY_HOURS]))
            start = dt_util.utcnow() - timedelta(hours=max(24, min(hours, 24 * 90)))
            history = await get_instance(self.hass).async_add_executor_job(
                recorder_history.get_significant_states,
                self.hass,
                start,
                dt_util.utcnow(),
                entity_ids,
                None,
                True,
                False,
            )
        except Exception as err:  # Recorder is optional; retain last good cache.
            _LOGGER.debug("Could not read e-C3 Recorder charge history: %s", err)
            self._latest_recorder_capacity_samples = self.data.get("recorder_capacity_samples", [])
            return self.data.get("recorder_observed_charges", [])

        charging = self._state_rows(history.get(charging_entity, []))
        soc = self._state_rows(history.get(soc_entity, []))
        capacity = self._state_rows(history.get(self.entity_mapping.get("battery_capacity"), []))
        self._latest_recorder_capacity_samples = [
            {"time": timestamp.isoformat(), "capacity_kwh": value}
            for timestamp, value in capacity
            if _number(value) is not None and _number(value) > 0
        ]
        modes = self._state_rows(history.get(self.entity_mapping.get("battery_charging_type"), []))
        intervals: list[tuple[datetime, datetime]] = []
        active_start: datetime | None = None
        seen_state = False
        for timestamp, value in charging:
            state = str(value).lower()
            if state == "on":
                if active_start is None:
                    # Do not claim a full session that was already active at
                    # the start of the queried Recorder range.
                    active_start = timestamp if seen_state else None
                seen_state = True
            elif state == "off":
                if active_start and timestamp > active_start:
                    intervals.append((active_start, timestamp))
                active_start = None
                seen_state = True

        merged_intervals: list[list[datetime]] = []
        for begin, finish in intervals:
            if merged_intervals and begin - merged_intervals[-1][1] <= timedelta(minutes=3):
                merged_intervals[-1][1] = finish
            else:
                merged_intervals.append([begin, finish])

        sessions: list[dict[str, Any]] = []
        for begin, finish in merged_intervals:
            start_soc, end_soc = self._number_at(soc, begin), self._number_at(soc, finish)
            if start_soc is None or end_soc is None:
                continue
            session_capacity = _capacity(self._number_at(capacity, begin))
            duration = max(1, round((finish - begin).total_seconds()))
            energy = round(max(0, end_soc - start_soc) * session_capacity / 100, 3)
            samples = [
                {
                    "source_time": timestamp.isoformat(),
                    "received_at": timestamp.isoformat(),
                    "timestamp_source": "home_assistant_recorder",
                    "time": timestamp.isoformat(),
                    "soc": value,
                    "capacity_kwh": session_capacity,
                    "residual_kwh": None,
                    "charging_rate_kmh": None,
                    "derived_power_kw": None,
                    "power_source": None,
                }
                for timestamp, value in soc
                if begin <= timestamp <= finish and _number(value) is not None
            ]
            average_power = round(energy / (duration / 3600), 2)
            sessions.append(
                {
                    "id": f"recorder:{begin.isoformat()}",
                    "start_time": begin.isoformat(),
                    "end_time": finish.isoformat(),
                    "duration_seconds": duration,
                    "soc_start": start_soc,
                    "soc_end": end_soc,
                    "capacity_kwh": session_capacity,
                    "energy_kwh": energy,
                    "average_power_kw": average_power,
                    "maximum_power_kw": None,
                    "charge_type": _charge_type(self._text_at(modes, begin), average_power),
                    "samples": samples,
                    "estimated": True,
                }
            )
        return sessions

    def _resolve_upstream(self):
        device_id = self.entry.data.get("vehicle_device_id")
        from homeassistant.helpers import device_registry as dr

        device = dr.async_get(self.hass).async_get(device_id)
        if device is None:
            return None, None
        for identifier in device.identifiers:
            if not isinstance(identifier, tuple) or identifier[0] != UPSTREAM_DOMAIN:
                continue
            vin = identifier[1]
            for client in self.hass.data.get(UPSTREAM_DOMAIN, {}).values():
                for vehicle in getattr(client, "vehicles", ()):
                    if vehicle.get("vin") == vin:
                        return client, vehicle
                coordinator = client.async_get_coordinator_by_vin(vin)
                if coordinator is not None:
                    return client, coordinator.vehicle_info
        return None, None

    @staticmethod
    def _public_vehicle_info(vehicle: dict[str, Any]) -> dict[str, Any]:
        return {
            "vehicle_id": vehicle.get("vehicle_id") or vehicle.get("id"),
            "vin": vehicle.get("vin"),
            "brand": vehicle.get("brand"),
            "motorization": vehicle.get("motorization"),
            "pictures": vehicle.get("pictures", []),
            "links": vehicle.get("_links", {}),
        }
