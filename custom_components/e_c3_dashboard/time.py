"""Package-owned notification quiet-hour settings."""
from __future__ import annotations

from datetime import time
from homeassistant.components.time import TimeEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.device_registry import DeviceInfo

from .const import DOMAIN


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = [NotificationQuietTime(coordinator, entry, key, name, icon) for key, name, icon in (("quiet_start", "Quiet hours start", "mdi:weather-night"), ("quiet_end", "Quiet hours end", "mdi:weather-sunny"))]
    for entity in entities:
        coordinator.notifications.register_entity(entity)
    async_add_entities(entities)
    await coordinator.notifications.async_refresh_entities()


class NotificationQuietTime(TimeEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, coordinator, entry, key: str, name: str, icon: str) -> None:
        self.coordinator, self.entry, self.key = coordinator, entry, key
        self._attr_name, self._attr_icon = name, icon
        self._attr_unique_id = f"{entry.entry_id}_notification_setting_{key}"

    @property
    def native_value(self) -> time | None:
        try:
            return time.fromisoformat(str(self.coordinator.notifications.setting(self.key)))
        except ValueError:
            return None

    async def async_set_value(self, value: time) -> None:
        await self.coordinator.notifications.async_set_setting(self.key, value.isoformat())

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(identifiers={(DOMAIN, self.entry.entry_id)}, name=f"{self.coordinator.data.get('vehicle_name') or 'Stellantis'} dashboard", manufacturer="e-C3 Dashboard", model="Local dashboard companion")
