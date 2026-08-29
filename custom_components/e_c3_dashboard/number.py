"""Package-owned notification thresholds and delays."""
from __future__ import annotations

from homeassistant.components.number import NumberEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.device_registry import DeviceInfo

from .const import DOMAIN
from .notifications import SETTING_META


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = [NotificationSettingNumber(coordinator, entry, key) for key in SETTING_META]
    for entity in entities:
        coordinator.notifications.register_entity(entity)
    async_add_entities(entities)
    await coordinator.notifications.async_refresh_entities()


class NotificationSettingNumber(NumberEntity):
    # Translated settings should be presented as their own concise names; the
    # package device remains available for grouping, but its vehicle/VIN-like
    # name must not be prepended to every control.
    _attr_has_entity_name = False
    _attr_should_poll = False

    def __init__(self, coordinator, entry, key: str) -> None:
        self.coordinator, self.entry, self.key = coordinator, entry, key
        _name, icon, minimum, maximum, step = SETTING_META[key]
        self._attr_translation_key = key
        self._attr_icon = icon
        self._attr_native_min_value, self._attr_native_max_value = minimum, maximum
        self._attr_native_step = step
        self._attr_native_unit_of_measurement = "min" if "minutes" in key else ("h" if "hours" in key else ("%" if "soc" in key or "battery" in key else "km"))
        self._attr_unique_id = f"{entry.entry_id}_notification_setting_{key}"

    @property
    def native_value(self):
        return float(self.coordinator.notifications.setting(self.key))

    async def async_set_native_value(self, value: float) -> None:
        await self.coordinator.notifications.async_set_setting(self.key, float(value))

    @property
    def extra_state_attributes(self):
        return {
            "integration_domain": DOMAIN,
            "entry_id": self.entry.entry_id,
            "notification_setting_key": self.key,
        }

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(identifiers={(DOMAIN, self.entry.entry_id)}, name=f"{self.coordinator.data.get('vehicle_name') or 'Stellantis'} dashboard", manufacturer="e-C3 Dashboard", model="Local dashboard companion")
