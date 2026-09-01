"""Stable VIN-based identity for package-owned Home Assistant entities."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.util import slugify

from .const import CONF_VEHICLE_DEVICE_ID, DOMAIN, UPSTREAM_DOMAIN

_LOGGER = logging.getLogger(__name__)


def vehicle_vin(hass: HomeAssistant, entry: ConfigEntry) -> str | None:
    """Return the VIN from the selected upstream Stellantis device identifier."""
    device_id = entry.data.get(CONF_VEHICLE_DEVICE_ID)
    device = dr.async_get(hass).async_get(device_id) if device_id else None
    if device is None:
        return None

    for identifier in device.identifiers:
        if len(identifier) >= 2 and identifier[0] == UPSTREAM_DOMAIN:
            vin = str(identifier[1]).strip()
            if vin:
                return vin
    return None


def vehicle_entity_unique_id(
    hass: HomeAssistant, entry: ConfigEntry, technical_key: str
) -> str:
    """Build the package entity unique ID using the upstream VIN when available."""
    prefix = vehicle_vin(hass, entry) or entry.entry_id
    return f"{prefix}_{technical_key}"


def apply_vehicle_entity_identity(
    entity: Any,
    hass: HomeAssistant,
    entry: ConfigEntry,
    entity_domain: str,
    technical_key: str,
) -> None:
    """Apply one language-neutral VIN + technical-key identity to a new entity.

    Setting ``entity_id`` before platform registration is Home Assistant's
    integration-side suggestion for the initial object id. Existing registry
    entries still win after migration, while fresh installs never derive the
    entity id from a translated display name.
    """
    unique_id = vehicle_entity_unique_id(hass, entry, technical_key)
    entity._attr_unique_id = unique_id
    entity.entity_id = f"{entity_domain}.{slugify(unique_id)}"


def registry_technical_key(
    registry_entry: er.RegistryEntry, entry: ConfigEntry, vin: str | None
) -> str | None:
    """Return the technical suffix from current or legacy package unique IDs."""
    unique_id = str(registry_entry.unique_id or "")
    if vin and unique_id.startswith(f"{vin}_"):
        return unique_id[len(vin) + 1 :]

    legacy_prefix = f"{entry.entry_id}_"
    if unique_id.startswith(legacy_prefix):
        return unique_id[len(legacy_prefix) :]
    return None


def async_migrate_package_entity_ids(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Migrate package-owned registry rows to VIN + technical-key identities.

    This touches only entities owned by this integration and this config entry.
    Upstream Stellantis entities are never modified.
    """
    vin = vehicle_vin(hass, entry)
    if not vin:
        _LOGGER.warning(
            "Cannot migrate e-C3 Dashboard entity identities because the selected "
            "Stellantis device exposes no VIN identifier"
        )
        return

    registry = er.async_get(hass)
    for registry_entry in er.async_entries_for_config_entry(registry, entry.entry_id):
        if registry_entry.platform != DOMAIN:
            continue
        technical_key = registry_technical_key(registry_entry, entry, vin)
        if not technical_key:
            continue

        desired_unique_id = f"{vin}_{technical_key}"
        desired_entity_id = (
            f"{registry_entry.domain}.{slugify(desired_unique_id)}"
        )
        if (
            registry_entry.unique_id == desired_unique_id
            and registry_entry.entity_id == desired_entity_id
        ):
            continue

        existing = registry.async_get(desired_entity_id)
        if existing is not None and existing.entity_id != registry_entry.entity_id:
            _LOGGER.warning(
                "Keeping existing entity id %s while migrating unique id to %s "
                "because %s is already registered",
                registry_entry.entity_id,
                desired_unique_id,
                desired_entity_id,
            )
            registry.async_update_entity(
                registry_entry.entity_id,
                new_unique_id=desired_unique_id,
            )
            continue

        registry.async_update_entity(
            registry_entry.entity_id,
            new_unique_id=desired_unique_id,
            new_entity_id=desired_entity_id,
        )
        _LOGGER.info(
            "Migrated e-C3 Dashboard entity %s to %s (%s)",
            registry_entry.entity_id,
            desired_entity_id,
            desired_unique_id,
        )
