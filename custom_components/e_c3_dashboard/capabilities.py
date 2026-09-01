"""Vehicle powertrain and capability helpers.

The upstream Stellantis integration exposes a stable ``type`` sensor whose
native state is one of electric/hybrid/thermic/hydrogen.  Entity presence is
kept as a fallback so an temporarily unavailable type sensor does not turn a
known vehicle into an unsupported one.
"""

from __future__ import annotations

from typing import Any, Iterable

from homeassistant.core import HomeAssistant

POWERTRAIN_ELECTRIC = "electric"
POWERTRAIN_HYBRID = "hybrid"
POWERTRAIN_THERMIC = "thermic"
POWERTRAIN_HYDROGEN = "hydrogen"
POWERTRAIN_UNKNOWN = "unknown"

KNOWN_POWERTRAINS = {
    POWERTRAIN_ELECTRIC,
    POWERTRAIN_HYBRID,
    POWERTRAIN_THERMIC,
    POWERTRAIN_HYDROGEN,
}


def normalize_powertrain(value: Any) -> str:
    """Normalize the upstream type sensor without translating its state."""
    normalized = str(value or "").strip().lower()
    return normalized if normalized in KNOWN_POWERTRAINS else POWERTRAIN_UNKNOWN


def powertrain_from_mapping(
    hass: HomeAssistant, entity_mapping: dict[str, str]
) -> str:
    """Resolve powertrain from the upstream type sensor, then entity shape."""
    type_entity = entity_mapping.get("type")
    if type_entity:
        state = hass.states.get(type_entity)
        powertrain = normalize_powertrain(state.state if state is not None else None)
        if powertrain != POWERTRAIN_UNKNOWN:
            return powertrain

    has_electric = bool(entity_mapping.get("battery") or entity_mapping.get("autonomy"))
    has_fuel = bool(entity_mapping.get("fuel") or entity_mapping.get("fuel_autonomy"))
    if has_electric and has_fuel:
        return POWERTRAIN_HYBRID
    if has_electric:
        return POWERTRAIN_ELECTRIC
    if has_fuel:
        return POWERTRAIN_THERMIC
    return POWERTRAIN_UNKNOWN


def capability_map(powertrain: str, entity_mapping: dict[str, str]) -> dict[str, bool]:
    """Return one canonical capability contract for backend and frontend."""
    powertrain = normalize_powertrain(powertrain)
    electric = powertrain in {POWERTRAIN_ELECTRIC, POWERTRAIN_HYBRID}
    fuel = powertrain in {POWERTRAIN_THERMIC, POWERTRAIN_HYBRID}

    # For an unavailable/older type state, entity presence may safely enable a
    # capability, but it may never invent a charge feature that is not mapped.
    if powertrain == POWERTRAIN_UNKNOWN:
        electric = bool(entity_mapping.get("battery") or entity_mapping.get("autonomy"))
        fuel = bool(entity_mapping.get("fuel") or entity_mapping.get("fuel_autonomy"))

    charging = electric and bool(entity_mapping.get("battery_charging"))
    return {
        "electric_energy": electric,
        "fuel": fuel,
        "charging": charging,
        "battery_capacity": electric,
        "battery_health": electric and bool(
            entity_mapping.get("battery_health_capacity")
            or entity_mapping.get("battery_health_resistance")
        ),
        "electric_range": electric and bool(entity_mapping.get("autonomy")),
        "fuel_range": fuel and bool(entity_mapping.get("fuel_autonomy")),
        "charge_history": charging and bool(entity_mapping.get("battery")),
        "electric_trip_metrics": electric and bool(entity_mapping.get("battery")),
        "fuel_metrics": fuel,
    }


def mapping_from_registry_entries(entries: Iterable[Any]) -> dict[str, str]:
    """Build the minimal translation-key mapping needed by config/options flow."""
    mapping: dict[str, str] = {}
    for registry_entry in entries:
        key = getattr(registry_entry, "translation_key", None)
        entity_id = getattr(registry_entry, "entity_id", None)
        if key and entity_id:
            mapping.setdefault(key, entity_id)
    return mapping
