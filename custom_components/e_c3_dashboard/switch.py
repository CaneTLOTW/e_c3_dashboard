"""Opt-in controls for e-C3 Dashboard notifications and wake-up paths."""

from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity_identity import apply_vehicle_entity_identity
from .notifications import (
    BASE_SWITCHES,
    SWITCH_ALERTS,
    SWITCH_CHARGE_REPORTS,
    SWITCH_NOTIFICATIONS,
    SWITCH_TRIP_REPORTS,
    SWITCH_WAKEUP_CHARGING,
    SWITCH_WAKEUP_HOURLY,
    SWITCH_WAKEUP_PROBE,
)

_BASE_DETAILS = {
    SWITCH_NOTIFICATIONS: "mdi:bell-ring-outline",
    SWITCH_TRIP_REPORTS: "mdi:car-info",
    SWITCH_CHARGE_REPORTS: "mdi:ev-station",
    SWITCH_ALERTS: "mdi:alert-outline",
    SWITCH_WAKEUP_HOURLY: "mdi:car-clock",
    SWITCH_WAKEUP_CHARGING: "mdi:battery-sync-outline",
    SWITCH_WAKEUP_PROBE: "mdi:access-point-check",
}


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Add disabled-by-default package controls."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    manager = coordinator.notifications
    entities = [
        Ec3NotificationSwitch(coordinator, entry, key, _BASE_DETAILS[key])
        for key in BASE_SWITCHES
    ]
    entities.extend(
        Ec3NotificationSwitch(
            coordinator,
            entry,
            manager.recipient_switch_key(recipient),
            "mdi:account-bell-outline",
            recipient=recipient.removeprefix("notify."),
        )
        for recipient in manager.recipients
    )
    for entity in entities:
        manager.register_entity(entity)
    async_add_entities(entities)
    await manager.async_refresh_entities()


class Ec3NotificationSwitch(SwitchEntity):
    """One persisted explicit-consent switch."""

    # Entity translations are the canonical control names. ``has_entity_name``
    # must stay enabled so Home Assistant applies the translation key instead of
    # collapsing an unnamed entity to the dashboard device name.
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(
        self,
        coordinator,
        entry: ConfigEntry,
        key: str,
        icon: str,
        *,
        recipient: str | None = None,
    ) -> None:
        self.coordinator = coordinator
        self.entry = entry
        self.manager = coordinator.notifications
        self.key = key
        self._attr_translation_key = "notify_recipient" if recipient else key
        if recipient:
            self._attr_translation_placeholders = {"recipient": recipient}
        self._attr_icon = icon
        apply_vehicle_entity_identity(self, coordinator.hass, entry, "switch", key)

    @property
    def is_on(self) -> bool:
        return self.manager.is_enabled(self.key)

    async def async_turn_on(self, **kwargs) -> None:
        await self.manager.async_set_enabled(self.key, True)

    async def async_turn_off(self, **kwargs) -> None:
        await self.manager.async_set_enabled(self.key, False)

    @property
    def device_info(self) -> DeviceInfo:
        vehicle_name = self.coordinator.data.get("vehicle_name") or "Stellantis"
        return DeviceInfo(
            identifiers={(DOMAIN, self.entry.entry_id)},
            name=f"{vehicle_name} dashboard",
            manufacturer="e-C3 Dashboard",
            model="Local dashboard companion",
        )
