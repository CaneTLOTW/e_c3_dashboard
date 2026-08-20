"""Entity-registry based mapping for one upstream Stellantis vehicle."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .compatibility import async_check_upstream_compatibility
from .const import (
    CONF_VEHICLE_DEVICE_ID,
    DEFAULT_OPTIONS,
    DOMAIN,
    OPTION_HISTORY_HOURS,
    UPSTREAM_DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


# ``translation_key`` belongs to the upstream integration's entity contract.
# It remains stable when a user renames an entity or changes the VIN prefix in
# the entity ID, which makes it the only safe primary key for a portable UI.
_REQUIRED_ENTITY_KEYS = {"vehicle", "battery", "mileage"}


class Ec3DashboardCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Discover only entities that belong to the selected Stellantis device."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            logger=_LOGGER,
            name=f"{DOMAIN}_{entry.entry_id}",
            update_interval=None,
        )
        self.entry = entry
        self.server_history = None

    async def _async_update_data(self) -> dict[str, Any]:
        """Build a safe, VIN-independent snapshot from the entity registry."""
        device_registry = dr.async_get(self.hass)
        entity_registry = er.async_get(self.hass)
        device = device_registry.async_get(
            self.entry.data[CONF_VEHICLE_DEVICE_ID]
        )

        upstream_entry_ids = {
            config_entry.entry_id
            for config_entry in self.hass.config_entries.async_entries(UPSTREAM_DOMAIN)
        }
        entries = (
            er.async_entries_for_device(
                entity_registry, self.entry.data[CONF_VEHICLE_DEVICE_ID]
            )
            if device is not None
            else []
        )
        upstream_entities = [
            registry_entry
            for registry_entry in entries
            if registry_entry.config_entry_id in upstream_entry_ids
        ]
        entity_mapping: dict[str, str] = {}
        for registry_entry in upstream_entities:
            key = registry_entry.translation_key
            if not key:
                continue
            # A few upstream capabilities deliberately share one translation
            # key across domains (notably charge-limit number + switch).
            # Preserve the domain-qualified address for the strategy instead
            # of relying on entity registry iteration order.
            entity_mapping[f"{key}_{registry_entry.domain}"] = registry_entry.entity_id
            entity_mapping.setdefault(key, registry_entry.entity_id)
        tracker = entity_mapping.get("vehicle") or next(
            (
                registry_entry.entity_id
                for registry_entry in upstream_entities
                if registry_entry.entity_id.startswith("device_tracker.")
            ),
            None,
        )
        missing_required = sorted(
            key for key in _REQUIRED_ENTITY_KEYS if key not in entity_mapping
        )

        compatibility = await async_check_upstream_compatibility(self.hass)
        # Keep the public module contract deliberately closed.  Older beta
        # entries may contain now-removed migration options, but those must
        # never reintroduce references to installation-specific helpers.
        options = {
            key: self.entry.options.get(key, default)
            for key, default in DEFAULT_OPTIONS.items()
        }
        status = (
            "incompatible"
            if not compatibility["version_supported"]
            else "ready"
            if device is not None and tracker is not None and not missing_required
            else "incomplete"
        )

        return {
            "status": status,
            "vehicle_name": (
                device.name_by_user or device.name if device is not None else None
            ),
            "vehicle_device_id": self.entry.data[CONF_VEHICLE_DEVICE_ID],
            "vehicle_slug": self.entry.data["vehicle_slug"],
            "vehicle_tracker": tracker,
            "entity_mapping": entity_mapping,
            "missing_required": missing_required,
            "upstream_entities": sorted(
                registry_entry.entity_id for registry_entry in upstream_entities
            ),
            "upstream_entity_count": len(upstream_entities),
            "modules": options,
            "history_window_hours": options[OPTION_HISTORY_HOURS],
            "upstream_compatibility": compatibility,
        }
