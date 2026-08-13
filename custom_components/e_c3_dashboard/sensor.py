"""Status sensor exposed by the e-C3 Dashboard config entry."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfEnergy, UnitOfLength, UnitOfPower
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    METRIC_CURRENT_CHARGE_POWER,
    METRIC_CURRENT_TRIP_ENERGY,
    METRIC_DISTANCE_SINCE_CHARGE,
    METRIC_LAST_CHARGE,
    METRIC_LAST_TRIP,
    METRIC_TRAILING_CONSUMPTION,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create one diagnostics entity for the selected vehicle."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    status = Ec3DashboardStatusSensor(coordinator, entry)
    coordinator.notifications.register_entity(status)
    entities = [
        status,
        Ec3TrailingConsumptionSensor(coordinator, entry),
        Ec3DistanceSinceChargeSensor(coordinator, entry),
        Ec3CurrentTripEnergySensor(coordinator, entry),
        Ec3LastTripResultSensor(coordinator, entry),
        Ec3CurrentChargePowerSensor(coordinator, entry),
        Ec3LastChargeResultSensor(coordinator, entry),
    ]
    for entity in entities[1:]:
        coordinator.metrics.register_entity(entity)
    async_add_entities(entities)

    # The strategy reads metric entity IDs from the status entity.  Entity
    # registration occurs asynchronously, so publish once more on the next
    # event-loop turn after the complete platform set is registered.
    @callback
    def _publish_metric_mapping(_now) -> None:
        status.async_write_ha_state()

    async_call_later(hass, 0, _publish_metric_mapping)


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
        metric_entities = {
            registry_entry.unique_id.removeprefix(f"{self._entry.entry_id}_"): registry_entry.entity_id
            for registry_entry in er.async_entries_for_config_entry(
                er.async_get(self.coordinator.hass), self._entry.entry_id
            )
            if registry_entry.domain == "sensor"
            and registry_entry.platform == DOMAIN
            and registry_entry.unique_id != f"{self._entry.entry_id}_status"
        }
        control_entities = {
            registry_entry.unique_id.removeprefix(f"{self._entry.entry_id}_"): registry_entry.entity_id
            for registry_entry in er.async_entries_for_config_entry(
                er.async_get(self.coordinator.hass), self._entry.entry_id
            )
            if registry_entry.domain in {"switch", "button"}
            and registry_entry.platform == DOMAIN
        }
        return {
            "integration_domain": DOMAIN,
            "entry_id": self._entry.entry_id,
            "vehicle_slug": self.coordinator.data["vehicle_slug"],
            "vehicle_tracker": self.coordinator.data["vehicle_tracker"],
            "entity_mapping": self.coordinator.data["entity_mapping"],
            "metric_entities": metric_entities,
            "control_entities": control_entities,
            "notification_status": self.coordinator.notifications.data.get(
                "last_notification"
            ),
            "wakeup_status": {
                "last_wakeup": self.coordinator.notifications.data.get("last_wakeup"),
                "today": self.coordinator.notifications.data.get("wakeup_count_today", 0),
            },
            "missing_required": self.coordinator.data["missing_required"],
            "upstream_entity_count": self.coordinator.data[
                "upstream_entity_count"
            ],
            "modules": self.coordinator.data["modules"],
            "history_window_hours": self.coordinator.data["history_window_hours"],
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


class Ec3MetricSensor(SensorEntity):
    """Base class for local metrics belonging to one dashboard entry."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, coordinator, entry: ConfigEntry, metric_key: str) -> None:
        self.coordinator = coordinator
        self.metrics = coordinator.metrics
        self.entry = entry
        self.metric_key = metric_key
        self._attr_unique_id = f"{entry.entry_id}_{metric_key}"

    @property
    def device_info(self) -> DeviceInfo:
        vehicle_name = self.coordinator.data.get("vehicle_name") or "Stellantis"
        return DeviceInfo(
            identifiers={(DOMAIN, self.entry.entry_id)},
            name=f"{vehicle_name} dashboard",
            manufacturer="e-C3 Dashboard",
            model="Local dashboard companion",
        )

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            "integration_domain": DOMAIN,
            "entry_id": self.entry.entry_id,
            "metric_key": self.metric_key,
            "updated_at": self.metrics.data.get("updated_at"),
            "estimated": True,
        }


class Ec3TrailingConsumptionSensor(Ec3MetricSensor):
    _attr_name = "Trailing consumption (500 km)"
    _attr_icon = "mdi:car-electric"
    _attr_native_unit_of_measurement = f"{UnitOfEnergy.KILO_WATT_HOUR}/100 {UnitOfLength.KILOMETERS}"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, METRIC_TRAILING_CONSUMPTION)

    @property
    def native_value(self) -> float | None:
        return self.metrics.trailing_consumption()["value"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = super().extra_state_attributes
        data.update(self.metrics.trailing_consumption())
        data["source"] = "local completed trips"
        return data


class Ec3DistanceSinceChargeSensor(Ec3MetricSensor):
    _attr_name = "Distance since last charge"
    _attr_icon = "mdi:map-marker-distance"
    _attr_native_unit_of_measurement = UnitOfLength.KILOMETERS
    _attr_device_class = SensorDeviceClass.DISTANCE
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, METRIC_DISTANCE_SINCE_CHARGE)

    @property
    def native_value(self) -> float | None:
        return self.metrics.distance_since_charge()

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = super().extra_state_attributes
        data.update(
            {
                "charge_odometer_km": self.metrics.data.get("charge_odometer_km"),
                "charge_end_time": self.metrics.data.get("charge_end_time"),
                "source": "local completed charge",
            }
        )
        return data


class Ec3CurrentTripEnergySensor(Ec3MetricSensor):
    _attr_name = "Current trip energy"
    _attr_icon = "mdi:battery-minus"
    _attr_native_unit_of_measurement = UnitOfEnergy.KILO_WATT_HOUR
    _attr_device_class = SensorDeviceClass.ENERGY
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, METRIC_CURRENT_TRIP_ENERGY)

    @property
    def available(self) -> bool:
        return self.metrics.data.get("active_trip") is not None

    @property
    def native_value(self) -> float | None:
        return self.metrics.current_trip_energy()


class Ec3CurrentChargePowerSensor(Ec3MetricSensor):
    """Battery-side instantaneous estimate from successive SOC reports."""

    _attr_name = "Current charge power"
    _attr_icon = "mdi:flash"
    _attr_native_unit_of_measurement = UnitOfPower.KILO_WATT
    _attr_device_class = SensorDeviceClass.POWER
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, METRIC_CURRENT_CHARGE_POWER)

    @property
    def available(self) -> bool:
        return self.metrics.data.get("active_charge") is not None

    @property
    def native_value(self) -> float | None:
        return self.metrics.current_charge_power()


class Ec3LastTripResultSensor(Ec3MetricSensor):
    _attr_name = "Last local trip result"
    _attr_icon = "mdi:map-marker-check"
    _attr_native_unit_of_measurement = UnitOfLength.KILOMETERS
    _attr_device_class = SensorDeviceClass.DISTANCE
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, METRIC_LAST_TRIP)

    @property
    def native_value(self) -> float | None:
        trip = self.metrics.data.get("last_trip")
        return trip.get("distance_km") if isinstance(trip, dict) else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = super().extra_state_attributes
        trip = self.metrics.data.get("last_trip")
        if not isinstance(trip, dict):
            return data
        data.update(trip)
        # These aliases make the existing, portable history card work with
        # upstream raw trip entries and locally calculated results alike.
        data["start_mileage"] = trip.get("start_mileage")
        data["avg_speed"] = trip.get("average_speed")
        return data


class Ec3LastChargeResultSensor(Ec3MetricSensor):
    """One durable, local result row for each completed charge."""

    _attr_name = "Last local charge result"
    _attr_icon = "mdi:battery-check"

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, METRIC_LAST_CHARGE)

    @property
    def native_value(self) -> str | None:
        charge = self.metrics.data.get("last_charge")
        return charge.get("id") if isinstance(charge, dict) else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = super().extra_state_attributes
        charge = self.metrics.data.get("last_charge")
        if isinstance(charge, dict):
            data.update(charge)
        return data
