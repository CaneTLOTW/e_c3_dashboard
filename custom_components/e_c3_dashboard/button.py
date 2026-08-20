"""Safe package-owned buttons for manual wake-up and notification testing."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([
        Ec3ActionButton(coordinator, entry, "manual_wakeup", "Wake vehicle now", "mdi:car-key"),
        Ec3ActionButton(coordinator, entry, "test_notification", "Test notification", "mdi:message-alert-outline"),
        Ec3ActionButton(coordinator, entry, "sync_server_history", "Sync server history", "mdi:database-sync"),
    ])
    await coordinator.notifications.async_refresh_entities()


class Ec3ActionButton(ButtonEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, coordinator, entry: ConfigEntry, key: str, name: str, icon: str) -> None:
        self.coordinator = coordinator
        self.entry = entry
        self.key = key
        self._attr_name = name
        self._attr_icon = icon
        self._attr_unique_id = f"{entry.entry_id}_{key}"

    async def async_press(self) -> None:
        if self.key == "manual_wakeup":
            await self.coordinator.notifications.async_manual_wakeup()
        elif self.key == "sync_server_history":
            await self.coordinator.server_history.async_full_sync()
        else:
            await self.coordinator.notifications.async_test_notification()

    @property
    def device_info(self) -> DeviceInfo:
        vehicle_name = self.coordinator.data.get("vehicle_name") or "Stellantis"
        return DeviceInfo(
            identifiers={(DOMAIN, self.entry.entry_id)},
            name=f"{vehicle_name} dashboard",
            manufacturer="e-C3 Dashboard",
            model="Local dashboard companion",
        )
