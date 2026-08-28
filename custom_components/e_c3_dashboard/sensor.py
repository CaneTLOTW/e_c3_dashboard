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
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    METRIC_CURRENT_CHARGE_POWER,
    METRIC_CURRENT_TRIP_ENERGY,
    METRIC_DISTANCE_SINCE_CHARGE,
    METRIC_LAST_CHARGE,
    METRIC_LAST_TRIP,
    METRIC_TRAILING_CONSUMPTION,
)
from .dashboard import dashboard_title_for_entry


def _compact_curve_samples(samples: Any, limit: int = 12) -> list[dict[str, Any]]:
    """Expose a small curve timeline without bloating Recorder attributes."""
    usable = [
        sample for sample in (samples if isinstance(samples, list) else [])
        if isinstance(sample, dict) and sample.get("soc") is not None
    ]
    if len(usable) > limit:
        positions = [round(index * (len(usable) - 1) / (limit - 1)) for index in range(limit)]
        usable = [usable[index] for index in dict.fromkeys(positions)]
    return [
        {
            "source_time": sample.get("source_time") or sample.get("time") or sample.get("received_at"),
            "soc": sample.get("soc"),
        }
        for sample in usable
    ]


def _compact_trip_row(trip: dict[str, Any]) -> dict[str, Any]:
    """Return the UI contract without copying long server IDs."""
    row = {key: trip.get(key) for key in (
        "start_time", "end_time", "duration_seconds", "distance_km", "start_mileage",
        "soc_start", "soc_end", "energy_kwh", "energy_per_100_km", "average_speed",
    )}
    row["server_id"] = str(trip.get("server_id") or trip.get("id") or "")[-20:]
    return row


_TRIP_ATTRIBUTE_COLUMNS = (
    "server_id", "start_time", "end_time", "duration_seconds", "distance_km",
    "start_mileage", "soc_start", "soc_end", "energy_kwh", "energy_per_100_km",
    "average_speed",
)


def _packed_trip_row(trip: dict[str, Any]) -> list[Any]:
    row = _compact_trip_row(trip)
    return [row.get(column) for column in _TRIP_ATTRIBUTE_COLUMNS]


def _geojson_coordinates(position: Any) -> list[float] | None:
    """Extract a valid GeoJSON longitude/latitude pair from a trip position."""
    if not isinstance(position, dict):
        return None
    geometry = position.get("geometry") if position.get("type") == "Feature" else position
    coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None
    if not isinstance(coordinates, (list, tuple)) or len(coordinates) < 2:
        return None
    try:
        longitude, latitude = float(coordinates[0]), float(coordinates[1])
    except (TypeError, ValueError):
        return None
    if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
        return None
    return [longitude, latitude]


def _trip_position_geojson(trips: Any) -> dict[str, Any]:
    """Build a bounded GeoJSON overlay from canonical server-trip positions."""
    features: list[dict[str, Any]] = []
    for trip in trips if isinstance(trips, list) else []:
        if not isinstance(trip, dict) or trip.get("distance_km") == 0:
            continue
        start = _geojson_coordinates(trip.get("display_start_position") or trip.get("raw_start_position"))
        end = _geojson_coordinates(trip.get("display_end_position") or trip.get("raw_stop_position"))
        properties = {
            "trip_id": str(trip.get("id") or trip.get("server_id") or "")[-20:],
            "start_time": trip.get("start_time"),
            "end_time": trip.get("end_time"),
            "distance_km": trip.get("distance_km"),
            "position_source": trip.get("position_source") or "server_trip",
            "route_detail": "start_stop_only",
        }
        if start:
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": start},
                "properties": {**properties, "point_type": "start"},
            })
        if end:
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": end},
                "properties": {**properties, "point_type": "end"},
            })
        if start and end and start != end:
            features.append({
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": [start, end]},
                "properties": properties,
            })
    return {"type": "FeatureCollection", "features": features}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create project entities for the selected vehicle."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    status = Ec3DashboardStatusSensor(coordinator, entry)
    coordinator.notifications.register_entity(status)
    entities = [
        status,
        Ec3ServerTripHistorySensor(coordinator, entry),
        Ec3ServerGpsHistorySensor(coordinator, entry),
        Ec3ServerChargeHistorySensor(coordinator, entry),
        Ec3VehicleInfoSensor(coordinator, entry),
        Ec3TrailingConsumptionSensor(coordinator, entry),
        Ec3DistanceSinceChargeSensor(coordinator, entry),
        Ec3CurrentTripEnergySensor(coordinator, entry),
        Ec3LastTripResultSensor(coordinator, entry),
        Ec3CurrentChargePowerSensor(coordinator, entry),
        Ec3LastChargeResultSensor(coordinator, entry),
    ]
    for entity in entities[1:]:
        coordinator.metrics.register_entity(entity)
        if hasattr(coordinator, "server_history") and coordinator.server_history:
            coordinator.server_history.register_entity(entity)
    async_add_entities(entities)

    @callback
    def _publish_metric_mapping(_now) -> None:
        status.async_write_ha_state()

    async_call_later(hass, 0, _publish_metric_mapping)


class Ec3DashboardStatusSensor(CoordinatorEntity, SensorEntity):
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
        """Expose only non-secret mapping and presentation data."""
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
            "dashboard_title": dashboard_title_for_entry(self.coordinator.hass, self._entry),
            "vehicle_slug": self.coordinator.data["vehicle_slug"],
            "vehicle_tracker": self.coordinator.data["vehicle_tracker"],
            "entity_mapping": self.coordinator.data["entity_mapping"],
            "metric_entities": metric_entities,
            "control_entities": control_entities,
            "server_history_entities": {
                registry_entry.unique_id.removeprefix(f"{self._entry.entry_id}_"): registry_entry.entity_id
                for registry_entry in er.async_entries_for_config_entry(
                    er.async_get(self.coordinator.hass), self._entry.entry_id
                )
                if registry_entry.domain == "sensor"
                and registry_entry.platform == DOMAIN
                and registry_entry.unique_id.removeprefix(f"{self._entry.entry_id}_").startswith("server_")
            },
            "notification_status": self.coordinator.notifications.data.get("last_notification"),
            "wakeup_status": {
                "last_wakeup": self.coordinator.notifications.data.get("last_wakeup"),
                "today": self.coordinator.notifications.data.get("wakeup_count_today", 0),
            },
            "missing_required": self.coordinator.data["missing_required"],
            "upstream_entity_count": self.coordinator.data["upstream_entity_count"],
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


class Ec3ServerTripHistorySensor(Ec3MetricSensor):
    """Count and compact attributes for canonical Stellantis trips."""

    _attr_name = "Server trip history"
    _attr_icon = "mdi:car-clock"

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, "server_trip_history")

    @property
    def native_value(self):
        return len(self.metrics.canonical_trips())

    @property
    def extra_state_attributes(self):
        data = super().extra_state_attributes
        rows = [_packed_trip_row(trip) for trip in self.metrics.canonical_trips()]
        history = getattr(self.metrics, "server_history", None)
        raw_count = len(getattr(history, "data", {}).get("canonical_trips", [])) if history else len(rows)
        zero_rows = []
        if history:
            for trip in history.data.get("canonical_trips", []):
                if trip.get("distance_km") != 0:
                    continue
                zero_rows.append(_compact_trip_row(trip))
        data.update({
            "columns": _TRIP_ATTRIBUTE_COLUMNS,
            "rows": rows,
            "trips": rows,
            "total_trip_count": raw_count,
            "zero_distance_trips": zero_rows,
        })
        return data


class Ec3ServerGpsHistorySensor(Ec3MetricSensor):
    """GeoJSON overlay for server trip positions."""

    _attr_name = "Server GPS history"
    _attr_icon = "mdi:map-marker-path"

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, "server_gps_history")

    @property
    def native_value(self):
        return len(_trip_position_geojson(self.metrics.canonical_trips())["features"])

    @property
    def extra_state_attributes(self):
        data = super().extra_state_attributes
        data["geojson"] = _trip_position_geojson(self.metrics.canonical_trips())
        return data


class Ec3ServerChargeHistorySensor(Ec3MetricSensor):
    """Count compact canonical charge sessions."""

    _attr_name = "Server charge history"
    _attr_icon = "mdi:ev-station"

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, "server_charge_history")

    @property
    def native_value(self):
        return len(self.metrics.charge_sessions())

    @property
    def extra_state_attributes(self):
        data = super().extra_state_attributes
        data["sessions"] = self.metrics.compact_charge_sessions()
        return data


class Ec3VehicleInfoSensor(Ec3MetricSensor):
    """Vehicle information and maintenance attributes."""

    _attr_name = "Vehicle info"
    _attr_icon = "mdi:car-info"

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, "vehicle_info")

    @property
    def native_value(self):
        return self.coordinator.data.get("vehicle_name") or "e-C3"

    @property
    def extra_state_attributes(self):
        data = super().extra_state_attributes
        mapped = self.coordinator.data.get("entity_mapping", {})
        vehicle_entity = mapped.get("vehicle")
        state = self.coordinator.hass.states.get(vehicle_entity) if vehicle_entity else None
        attrs = state.attributes if state else {}
        data.update({
            "Marke": attrs.get("brand") or attrs.get("Brand") or attrs.get("Marke"),
            "Antrieb": attrs.get("powertrain") or attrs.get("Powertrain") or attrs.get("Antrieb"),
            "VIN": attrs.get("vin") or attrs.get("VIN"),
            "Wartung verbleibende Tage": attrs.get("maintenance_days_remaining") or attrs.get("Wartung verbleibende Tage"),
            "Wartung verbleibende Kilometer": attrs.get("maintenance_distance_remaining") or attrs.get("Wartung verbleibende Kilometer"),
            "Wartung aktualisiert": attrs.get("maintenance_updated_at") or attrs.get("Wartung aktualisiert"),
        })
        return data


class Ec3TrailingConsumptionSensor(Ec3MetricSensor):
    """Rolling 500 km consumption."""

    _attr_name = "Trailing consumption 500 km"
    _attr_icon = "mdi:chart-line"
    _attr_native_unit_of_measurement = "kWh/100 km"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, METRIC_TRAILING_CONSUMPTION)

    @property
    def native_value(self):
        return self.metrics.trailing_consumption_500km()


class Ec3DistanceSinceChargeSensor(Ec3MetricSensor):
    """Distance since the latest completed charge."""

    _attr_name = "Distance since charge"
    _attr_icon = "mdi:map-marker-distance"
    _attr_native_unit_of_measurement = UnitOfLength.KILOMETERS
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, METRIC_DISTANCE_SINCE_CHARGE)

    @property
    def native_value(self):
        return self.metrics.distance_since_charge_km()


class Ec3CurrentTripEnergySensor(Ec3MetricSensor):
    """Estimated current trip energy."""

    _attr_name = "Current trip energy"
    _attr_icon = "mdi:battery-minus"
    _attr_native_unit_of_measurement = UnitOfEnergy.KILO_WATT_HOUR
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, METRIC_CURRENT_TRIP_ENERGY)

    @property
    def native_value(self):
        return self.metrics.current_trip_energy_kwh()


class Ec3LastTripResultSensor(Ec3MetricSensor):
    """Latest completed trip result."""

    _attr_name = "Last trip result"
    _attr_icon = "mdi:car-clock"

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, METRIC_LAST_TRIP)

    @property
    def native_value(self):
        return self.metrics.last_trip_state()

    @property
    def extra_state_attributes(self):
        data = super().extra_state_attributes
        data.update(self.metrics.last_trip_attributes())
        return data


class Ec3CurrentChargePowerSensor(Ec3MetricSensor):
    """Current locally derived charging power."""

    _attr_name = "Current charge power"
    _attr_icon = "mdi:flash"
    _attr_native_unit_of_measurement = UnitOfPower.KILO_WATT
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, METRIC_CURRENT_CHARGE_POWER)

    @property
    def native_value(self):
        return self.metrics.current_charge_power_kw()


class Ec3LastChargeResultSensor(Ec3MetricSensor):
    """Latest completed charging result."""

    _attr_name = "Last charge result"
    _attr_icon = "mdi:ev-station"

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, METRIC_LAST_CHARGE)

    @property
    def native_value(self):
        return self.metrics.last_charge_state()

    @property
    def extra_state_attributes(self):
        data = super().extra_state_attributes
        data.update(self.metrics.last_charge_attributes())
        return data
