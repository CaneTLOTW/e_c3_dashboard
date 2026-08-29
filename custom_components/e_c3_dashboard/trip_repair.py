"""Pure helpers for conservative canonical trip odometer repair.

The Stellantis trip endpoint occasionally returns a zero/stale start odometer
while the accompanying distance field looks like an absolute end odometer.
Raw server rows remain untouched; this module only repairs the canonical copy
when continuity can be demonstrated from adjacent/local evidence.
"""

from __future__ import annotations

from datetime import datetime
import math
from typing import Any

_ODOMETER_TOLERANCE_KM = 0.2
_LOCAL_START_TOLERANCE_KM = 1.0
_LOCAL_TIME_TOLERANCE_SECONDS = 20 * 60
_MAX_TRIP_DISTANCE_KM = 1000.0
_MAX_TRIP_DURATION_SECONDS = 24 * 60 * 60
_MAX_TRIP_SPEED_KMH = 300.0

_REPAIRABLE_SOURCE_FLAGS = {
    "missing_or_non_positive_distance",
    "distance_outlier",
    "odometer_distance_mismatch",
    "speed_outlier",
    "derived_speed_outlier",
    "zero_start_odometer_sentinel",
}
_BLOCKING_FLAGS = {
    "missing_or_non_positive_distance",
    "distance_outlier",
    "duration_outlier",
    "odometer_distance_mismatch",
    "speed_outlier",
    "derived_speed_outlier",
    "zero_start_odometer_sentinel",
}


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _time(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _trip_sort_key(trip: dict[str, Any]) -> tuple[str, str]:
    """Sort the already ISO-normalized timestamps without mixing tz awareness."""
    return (
        str(trip.get("start_time") or trip.get("startedAt") or ""),
        str(trip.get("id") or trip.get("server_id") or ""),
    )


def _local_match(
    trip: dict[str, Any],
    local_trips: list[dict[str, Any]],
    previous_end: float,
) -> dict[str, Any] | None:
    server_start = _time(trip.get("start_time"))
    server_end = _time(trip.get("end_time"))
    candidates: list[tuple[float, dict[str, Any]]] = []
    for local in local_trips:
        local_start_mileage = _number(local.get("start_mileage"))
        local_end_mileage = _number(local.get("end_mileage"))
        if (
            local_start_mileage is None
            or local_end_mileage is None
            or local_end_mileage <= local_start_mileage
            or abs(local_start_mileage - previous_end) > _LOCAL_START_TOLERANCE_KM
        ):
            continue
        local_start = _time(local.get("start_time"))
        local_end = _time(local.get("end_time"))
        deltas: list[float] = []
        for left, right in ((server_start, local_start), (server_end, local_end)):
            if left is None or right is None:
                continue
            try:
                deltas.append(abs((left - right).total_seconds()))
            except TypeError:
                # A malformed naive timestamp must not make canonical rebuild
                # fail; mileage continuity can still provide corroboration.
                continue
        if deltas and min(deltas) > _LOCAL_TIME_TOLERANCE_SECONDS:
            continue
        score = (min(deltas) if deltas else _LOCAL_TIME_TOLERANCE_SECONDS) + (
            abs(local_start_mileage - previous_end) * 60
        )
        candidates.append((score, local))
    return min(candidates, key=lambda item: item[0])[1] if candidates else None


def _next_start_mileage(
    ordered: list[dict[str, Any]], index: int, previous_end: float
) -> float | None:
    for following in ordered[index + 1 :]:
        start = _number(following.get("start_mileage"))
        if start is None or start <= 0:
            continue
        return start if start >= previous_end - _ODOMETER_TOLERANCE_KM else None
    return None


def _plausible_repair(distance: float, duration_seconds: float | None) -> tuple[bool, float | None]:
    if distance <= 0 or distance > _MAX_TRIP_DISTANCE_KM:
        return False, None
    if duration_seconds is not None and (
        duration_seconds <= 0 or duration_seconds > _MAX_TRIP_DURATION_SECONDS
    ):
        return False, None
    speed = (
        distance / (duration_seconds / 3600)
        if duration_seconds is not None and duration_seconds > 0
        else None
    )
    if speed is not None and speed > _MAX_TRIP_SPEED_KMH:
        return False, speed
    return True, speed


def repair_trip_odometer_continuity(
    trips: list[dict[str, Any]], local_trips: list[dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    """Repair only canonical rows whose odometer regresses behind the prior trip.

    Evidence priority for the repaired end odometer is:
    1. a same-window locally observed trip whose start matches the prior end;
    2. the next positive server start odometer;
    3. for the explicit zero-start sentinel pattern only, the normalized source
       end (which is start + distance and therefore equals the suspicious raw
       distance when start is zero).

    If none of those produce a positive, speed-plausible distance, the row is
    left untouched and remains invalid. Raw server payloads are never mutated.
    """
    ordered = sorted(trips, key=_trip_sort_key)
    local_rows = [row for row in (local_trips or []) if isinstance(row, dict)]
    previous_end: float | None = None

    for index, trip in enumerate(ordered):
        start = _number(trip.get("start_mileage"))
        end = _number(trip.get("end_mileage"))

        if previous_end is None:
            if end is not None and end > 0:
                previous_end = end
            continue

        regression = start is None or start < previous_end - _ODOMETER_TOLERANCE_KM
        if not regression:
            if end is not None and end >= previous_end - _ODOMETER_TOLERANCE_KM:
                previous_end = max(previous_end, end)
            continue

        local = _local_match(trip, local_rows, previous_end)
        candidate_end: float | None = None
        repair_source: str | None = None
        if local is not None:
            candidate_end = _number(local.get("end_mileage"))
            repair_source = "local_trip_match"
        if candidate_end is None:
            candidate_end = _next_start_mileage(ordered, index, previous_end)
            repair_source = "next_server_start" if candidate_end is not None else None
        if (
            candidate_end is None
            and start == 0
            and end is not None
            and end >= previous_end - _ODOMETER_TOLERANCE_KM
        ):
            candidate_end = end
            repair_source = "zero_start_source_end"

        if candidate_end is None:
            continue
        candidate_distance = round(candidate_end - previous_end, 3)
        duration = _number(trip.get("duration_seconds"))
        plausible, derived_speed = _plausible_repair(candidate_distance, duration)
        if not plausible:
            continue

        original_flags = list(trip.get("quality_flags") or [])
        original_start = start
        original_end = end
        original_distance = _number(trip.get("distance_km"))
        raw_speed = _number(trip.get("raw_average_speed_kmh"))
        source_speed_usable = raw_speed is not None and 0 <= raw_speed <= _MAX_TRIP_SPEED_KMH
        repaired_speed = raw_speed if source_speed_usable else derived_speed

        trip["source_start_mileage_km"] = original_start
        trip["source_end_mileage_km"] = original_end
        trip["source_distance_km"] = original_distance
        trip["source_quality_flags"] = original_flags
        trip["start_mileage_km"] = round(previous_end, 3)
        trip["start_mileage"] = round(previous_end, 3)
        trip["end_mileage_km"] = round(candidate_end, 3)
        trip["end_mileage"] = round(candidate_end, 3)
        trip["distance_km"] = candidate_distance
        trip["average_speed_kmh"] = round(repaired_speed, 1) if repaired_speed is not None else None
        trip["average_speed"] = round(repaired_speed, 1) if repaired_speed is not None else None
        trip["speed_source"] = "stellantis_mps" if source_speed_usable else "odometer_continuity_fallback"

        energy = _number(trip.get("energy_kwh"))
        consumption = round(energy / candidate_distance * 100, 2) if energy is not None else None
        trip["consumption_kwh_100km"] = consumption
        trip["energy_per_100_km"] = consumption

        retained_flags = [flag for flag in original_flags if flag not in _REPAIRABLE_SOURCE_FLAGS]
        if "odometer_continuity_repaired" not in retained_flags:
            retained_flags.append("odometer_continuity_repaired")
        trip["quality_flags"] = retained_flags
        trip["valid_for_statistics"] = not any(flag in _BLOCKING_FLAGS for flag in retained_flags)
        trip["repair_metadata"] = {
            "applied": True,
            "reason": "odometer_regression",
            "source": repair_source,
            "previous_end_mileage_km": round(previous_end, 3),
            "repaired_end_mileage_km": round(candidate_end, 3),
            "repaired_distance_km": candidate_distance,
        }
        if repair_source == "local_trip_match":
            trip["confidence"] = "high"
        else:
            trip["confidence"] = "medium"
        previous_end = candidate_end

    return ordered
