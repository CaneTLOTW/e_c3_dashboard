"""Status sensor exposed by the e-C3 Dashboard config entry."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create one diagnostics entity for the selected vehicle."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([Ec3DashboardStatusSensor(coordinator, entry)])


class Ec3DashboardStatusSensor(
    CoordinatorEntity, SensorEntity
):
    """Expose setup, mapping and module diagnostics to the dashboard strategy."""

    _attr_has_entity_name = True
    _attr_name = "Dashboard status"
    _attr_icon = "mdi:car-cog"
    _attr_should_poll = False

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_status"

    @property
    def native_value(self) -> str:
        """Return a compact readiness value."""
        return self.coordinator.data["status"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose only non-sensitive mapping data."""
        return {
            "integration_domain": DOMAIN,
            "entry_id": self._entry.entry_id,
            "vehicle_slug": self.coordinator.data["vehicle_slug"],
            "vehicle_tracker": self.coordinator.data["vehicle_tracker"],
            "upstream_entity_count": self.coordinator.data[
                "upstream_entity_count"
            ],
            "modules": self.coordinator.data["modules"],
            "upstream_compatibility": self.coordinator.data["upstream_compatibility"],
        }

    @property
    def device_info(self) -> DeviceInfo:
        """Group project-owned entities under a local dashboard device."""
        vehicle_name = self.coordinator.data.get("vehicle_name") or "Stellantis"
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.entry_id)},
            name=f"{vehicle_name} dashboard",
            manufacturer="e-C3 Dashboard",
            model="Local dashboard companion",
        )
