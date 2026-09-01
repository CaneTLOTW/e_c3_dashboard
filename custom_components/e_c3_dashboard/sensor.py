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
from .entity_identity import (
    apply_vehicle_entity_identity,
    registry_technical_key,
    vehicle_vin,
)


def _compact_curve_samples(samples: Any, limit: int = 12) -> list[dict[str, Any]]:
    """Expose a small curve timeline without bloating Recorder attributes.

    The complete raw samples intentionally stay in the package Store. The
    frontend only needs timestamp and SOC to draw the derived curve, so this
    compact, evenly-spaced view survives in the state attribute without
    exceeding Home Assistant's Recorder attribute size limit.
    """
    usable = [
        sample
        for sample in (samples if isinstance(samples, list) else [])
        if isinstance(sample, dict) and sample.get("soc") is not None
    ]
    if len(usable) > limit:
        positions = [
            round(index * (len(usable) - 1) / (limit - 1)) for index in range(limit)
        ]
        usable = [usable[index] for index in dict.fromkeys(positions)]
    return [
        {
            "source_time": sample.get("source_time")
            or sample.get("time")
            or sample.get("received_at"),
            "soc": sample.get("soc"),
        }
        for sample in usable
    ]


def _compact_trip_row(trip: dict[str, Any]) -> dict[str, Any]:
    """Return the UI contract without copying 160-character server IDs.

    Full Stellantis IDs remain primary keys in the canonical Store. The
    frontend only needs a stable row key, for which a 20-character suffix is
    ample and keeps the state attribute within Recorder's size limit.
    """
    row = {
        key: trip.get(key)
        for key in (
            "start_time",
            "end_time",
            "duration_seconds",
            "distance_km",
            "start_mileage",
            "soc_start",
            "soc_end",
            "energy_kwh",
            "energy_per_100_km",
            "average_speed",
            "valid_for_statistics",
            "quality_flags",
            "speed_source",
        )
    }
    row["server_id"] = str(trip.get("server_id") or trip.get("id") or "")[-20:]
    return row


_TRIP_ATTRIBUTE_COLUMNS = (
    "server_id",
    "start_time",
    "end_time",
    "duration_seconds",
    "distance_km",
    "start_mileage",
    "soc_start",
    "soc_end",
    "energy_kwh",
    "energy_per_100_km",
    "average_speed",
    "valid_for_statistics",
    "quality_flags",
    "speed_source",
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
    """Build a bounded GeoJSON overlay from canonical server-trip positions.

    The Stellantis trip endpoint provides start/stop points, not necessarily a
    complete route. Lines in this overlay therefore deliberately represent
    start-to-stop approximations; HA Recorder history remains the detailed
    live route source when available.
    """
    features: list[dict[str, Any]] = []
    for trip in trips if isinstance(trips, list) else []:
        if not isinstance(trip, dict) or trip.get("distance_km") == 0:
            continue
        start = _geojson_coordinates(
            trip.get("display_start_position") or trip.get("raw_start_position")
        )
        end = _geojson_coordinates(
            trip.get("display_end_position") or trip.get("raw_stop_position")
        )
        properties = {
            "trip_id": str(trip.get("id") or trip.get("server_id") or "")[-20:],
            "start_time": trip.get("start_time"),
            "end_time": trip.get("end_time"),
            "distance_km": trip.get("distance_km"),
            "position_source": trip.get("position_source") or "server_trip",
            "route_detail": "start_stop_only",
        }
        if start:
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": start},
                    "properties": {**properties, "point_type": "start"},
                }
            )
        if end:
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": end},
                    "properties": {**properties, "point_type": "end"},
                }
            )
        if start and end and start != end:
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": [start, end]},
                    "properties": properties,
                }
            )
    return {"type": "FeatureCollection", "features": features}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create one diagnostics entity for the selected vehicle."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    status = Ec3DashboardStatusSensor(coordinator, entry)
    coordinator.notifications.register_entity(status)
    capabilities = coordinator.data.get("capabilities", {})
    electric = capabilities.get("electric_trip_metrics", False)
    charge_history = capabilities.get("charge_history", False)
    charging = capabilities.get("charging", False)

    entities = [
        status,
        Ec3ServerTripHistorySensor(coordinator, entry),
        Ec3ServerGpsHistorySensor(coordinator, entry),
        Ec3VehicleInfoSensor(coordinator, entry),
        Ec3LastTripResultSensor(coordinator, entry),
    ]
    if electric:
        entities.extend([
            Ec3TrailingConsumptionSensor(coordinator, entry),
            Ec3CurrentTripEnergySensor(coordinator, entry),
        ])
    if charge_history:
        entities.extend([
            Ec3ServerChargeHistorySensor(coordinator, entry),
            Ec3DistanceSinceChargeSensor(coordinator, entry),
            Ec3LastChargeResultSensor(coordinator, entry),
        ])
    if charging:
        entities.append(Ec3CurrentChargePowerSensor(coordinator, entry))
    for entity in entities[1:]:
        coordinator.metrics.register_entity(entity)
        if hasattr(coordinator, "server_history") and coordinator.server_history:
            coordinator.server_history.register_entity(entity)
    async_add_entities(entities)

    # The strategy reads metric entity IDs from the status entity. Entity
    # registration occurs asynchronously, so publish once more on the next
    # event-loop turn after the complete platform set is registered.
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
        apply_vehicle_entity_identity(
            self, coordinator.hass, entry, "sensor", "status"
        )

    @property
    def native_value(self) -> str:
        """Return a compact readiness value."""
        return self.coordinator.data["status"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose only non-sensitive mapping data."""
        registry = er.async_get(self.coordinator.hass)
        vin = vehicle_vin(self.coordinator.hass, self._entry)
        registry_entries = er.async_entries_for_config_entry(
            registry, self._entry.entry_id
        )

        metric_entities: dict[str, str] = {}
        control_entities: dict[str, str] = {}
        server_history_entities: dict[str, str] = {}
        for registry_entry in registry_entries:
            if registry_entry.platform != DOMAIN:
                continue
            technical_key = registry_technical_key(
                registry_entry, self._entry, vin
            )
            if not technical_key or technical_key == "status":
                continue
            if registry_entry.domain == "sensor":
                metric_entities[technical_key] = registry_entry.entity_id
                if technical_key.startswith("server_"):
                    server_history_entities[technical_key] = registry_entry.entity_id
            elif registry_entry.domain in {"switch", "button", "number", "time"}:
                control_entities[technical_key] = registry_entry.entity_id

        return {
            "integration_domain": DOMAIN,
            "entry_id": self._entry.entry_id,
            "vehicle_slug": self.coordinator.data["vehicle_slug"],
            "dashboard_url_path": self.coordinator.data.get("dashboard_url_path"),
            "vehicle_tracker": self.coordinator.data["vehicle_tracker"],
            "powertrain": self.coordinator.data.get("powertrain", "unknown"),
            "capabilities": self.coordinator.data.get("capabilities", {}),
            "entity_mapping": self.coordinator.data["entity_mapping"],
            "metric_entities": metric_entities,
            "control_entities": control_entities,
            "server_history_entities": server_history_entities,
            "notification_status": self.coordinator.notifications.data.get(
                "last_notification"
            ),
            "notification_diagnostics": self.coordinator.notifications.diagnostic(),
            "wakeup_status": {
                "last_wakeup": self.coordinator.notifications.data.get("last_wakeup"),
                "today": self.coordinator.notifications.data.get(
                    "wakeup_count_today", 0
                ),
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
        apply_vehicle_entity_identity(
            self, coordinator.hass, entry, "sensor", metric_key
        )

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
    _attr_translation_key = "server_trip_history"
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
        raw_count = (
            len(getattr(history, "data", {}).get("canonical_trips", []))
            if history
            else len(rows)
        )
        zero_rows = []
        if history:
            for trip in history.data.get("canonical_trips", []):
                if trip.get("distance_km") != 0:
                    continue
                zero_rows.append(_packed_trip_row(trip))
        data.update(
            {
                "count": len(rows),
                "raw_count": raw_count,
                "zero_distance_count": max(0, raw_count - len(rows)),
                "trip_columns": _TRIP_ATTRIBUTE_COLUMNS,
                "trip_rows": rows,
                "zero_trip_rows": zero_rows,
                "source": "canonical_history",
                "server_history_ready": bool(
                    history
                    and history.data.get("updated_at")
                    and not history.data.get("error")
                ),
            }
        )
        return data


class Ec3ServerGpsHistorySensor(Ec3MetricSensor):
    """Expose server-trip positions as a GeoJSON map overlay."""

    _attr_name = "Server GPS history"
    _attr_translation_key = "server_gps_history"
    _attr_icon = "mdi:map-marker-path"

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, "server_gps_history")

    @property
    def native_value(self):
        history = getattr(self.metrics, "server_history", None)
        trips = (
            getattr(history, "data", {}).get("canonical_trips", []) if history else []
        )
        return sum(
            1
            for trip in trips
            if isinstance(trip, dict) and trip.get("distance_km") != 0
        )

    @property
    def extra_state_attributes(self):
        data = super().extra_state_attributes
        history = getattr(self.metrics, "server_history", None)
        trips = (
            getattr(history, "data", {}).get("canonical_trips", []) if history else []
        )
        geojson = _trip_position_geojson(trips)
        data.update(
            {
                "geojson": geojson,
                "source": "stellantis_trip_positions",
                "route_detail": "start_stop_only",
                "trip_count": self.native_value,
                "feature_count": len(geojson["features"]),
                "server_history_ready": bool(
                    history
                    and history.data.get("updated_at")
                    and not history.data.get("error")
                ),
            }
        )
        return data


class Ec3ServerChargeHistorySensor(Ec3MetricSensor):
    """Count and compact attributes for deterministic charge windows."""

    _attr_name = "Server charge history"
    _attr_translation_key = "server_charge_history"
    _attr_icon = "mdi:ev-station"

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, "server_charge_history")

    @property
    def native_value(self):
        return len(self.metrics.canonical_charges())

    @property
    def extra_state_attributes(self):
        data = super().extra_state_attributes
        rows = []
        for charge in self.metrics.canonical_charges():
            if charge.get("quality") == "observed":
                row = {
                    key: charge.get(key)
                    for key in (
                        "id",
                        "quality",
                        "source",
                        "sources",
                        "window_start",
                        "window_end",
                        "standstill_duration_seconds",
                        "start_time",
                        "end_time",
                        "charging_duration_seconds",
                        "soc_start",
                        "soc_end",
                        "capacity_kwh",
                        "energy_kwh",
                        "average_power_kw",
                        "maximum_power_kw",
                        "charge_type",
                        "has_charge_curve",
                        "sample_count",
                        "minimum_power_kw",
                        "median_power_kw",
                        "power_source",
                        "match_metadata",
                    )
                }
            else:
                row = {
                    key: charge.get(key)
                    for key in (
                        "id",
                        "quality",
                        "source",
                        "window_start",
                        "window_end",
                        "standstill_duration_seconds",
                        "soc_start",
                        "soc_end",
                        "capacity_kwh",
                        "energy_kwh",
                    )
                }
            # Raw samples remain in the local Store. The browser receives a
            # deliberately bounded timeline only for observed sessions.
            if charge.get("quality") == "observed":
                row["samples"] = _compact_curve_samples(charge.get("samples", []))
            rows.append(row)
        active = getattr(self.metrics, "data", {}).get("active_charge")
        active_payload = None
        if isinstance(active, dict) and active.get("start_time"):
            samples = [
                sample
                for sample in active.get("samples", [])
                if isinstance(sample, dict)
            ]
            active_payload = {
                "start_time": active.get("start_time"),
                "soc_start": active.get("start_soc"),
                "soc_end": samples[-1].get("soc")
                if samples
                else active.get("start_soc"),
                "capacity_kwh": active.get("capacity_kwh"),
                "charge_type": active.get("charge_type") or "Unknown",
                "samples": _compact_curve_samples(samples),
            }
        history = getattr(self.metrics, "server_history", None)
        archive = (
            getattr(history, "data", {}).get("archive_metadata", {}) if history else {}
        )
        data.update(
            {
                "count": len(rows),
                "charges": rows,
                "active_charge": active_payload,
                "archive_observed_count": archive.get("observed_charge_count", 0),
                "archive_oldest_observed_charge": archive.get("oldest_observed_charge"),
                "curve_store": archive.get("curve_store", False),
                "curve_raw_sample_sessions": archive.get("raw_sample_session_count", 0),
                "curve_raw_sample_count": archive.get("raw_sample_count", 0),
                "curve_oldest_session": archive.get("curve_oldest_session"),
                "source": "canonical_history",
                "server_history_ready": bool(
                    history
                    and history.data.get("updated_at")
                    and not history.data.get("error")
                ),
            }
        )
        return data


def _relative_age(value: Any) -> str:
    """Format a backend timestamp as a short German relative age."""
    parsed = dt_util.parse_datetime(str(value)) if value else None
    if parsed is None:
        return "—"
    parsed = dt_util.as_utc(parsed)
    seconds = max(0, int((dt_util.utcnow() - parsed).total_seconds()))
    if seconds < 60:
        return f"vor {seconds} Sekunden"
    minutes = seconds // 60
    if minutes < 60:
        return f"vor {minutes} Minuten"
    hours = minutes // 60
    if hours < 24:
        return f"vor {hours} Stunden"
    return f"vor {hours // 24} Tagen"


class Ec3VehicleInfoSensor(Ec3MetricSensor):
    """Expose backend-supplied vehicle metadata without VIN inference."""

    _attr_name = "Vehicle information"
    _attr_translation_key = "vehicle_info"
    _attr_icon = "mdi:car-info"

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry, "vehicle_info")

    @property
    def native_value(self):
        info = getattr(self.metrics.server_history, "data", {}).get("vehicle_info", {})
        return info.get("brand") or info.get("motorization") or "unknown"

    @property
    def extra_state_attributes(self):
        info = getattr(self.metrics.server_history, "data", {}).get("vehicle_info", {})
        maintenance = info.get("maintenance", {}) if isinstance(info, dict) else {}
        # Native HA more-info is intentionally used here. Keep its attributes
        # compact and user-facing; raw HAL links and picture lists stay in the
        # server-history store and are not shown in the popup.
        updated_at = maintenance.get("updated_at")
        data = {
            # Stable, language-neutral attributes for cards, automations and
            # future integrations. Timestamps stay raw so Home Assistant can
            # render them in each user's locale.
            "brand": info.get("brand") or "—",
            "powertrain": info.get("motorization") or "—",
            "vin": info.get("vin") or "—",
            "picture_count": info.get("picture_count", 0),
            "maintenance_days_remaining": maintenance.get("days_remaining") or "—",
            "maintenance_mileage_remaining_km": maintenance.get("mileage_remaining_km")
            or "—",
            "maintenance_updated_at": updated_at,
            "source": "stellantis_vehicle_maintenance",
        }
        # Compatibility aliases from 0.5.x. Keep them for one compatibility
        # cycle so existing templates/automations do not break while bundled
        # UI moves to the neutral contract above.
        data.update(
            {
                "Marke": data["brand"],
                "Antrieb": data["powertrain"],
                "VIN": data["vin"],
                "Bildanzahl": data["picture_count"],
                "Wartung verbleibende Tage": data["maintenance_days_remaining"],
                "Wartung verbleibende Kilometer": data[
                    "maintenance_mileage_remaining_km"
                ],
                "Wartung aktualisiert": _relative_age(updated_at),
                "Datenquelle": "Stellantis Fahrzeug- und Wartungsdaten",
            }
        )
        return data


class Ec3TrailingConsumptionSensor(Ec3MetricSensor):
    _attr_name = "Trailing consumption (500 km)"
    _attr_translation_key = "trailing_consumption_500km"
    _attr_icon = "mdi:car-electric"
    _attr_native_unit_of_measurement = (
        f"{UnitOfEnergy.KILO_WATT_HOUR}/100 {UnitOfLength.KILOMETERS}"
    )
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
        history = getattr(self.metrics, "server_history", None)
        data["source"] = (
            "canonical server trip history"
            if history and getattr(history, "data", {}).get("trips")
            else "local completed trips fallback"
        )
        return data


class Ec3DistanceSinceChargeSensor(Ec3MetricSensor):
    _attr_name = "Distance since last charge"
    _attr_translation_key = "distance_since_charge"
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
                "baseline_source": self.metrics.data.get("charge_baseline_source"),
                "source": "upstream last-charge timestamp plus local Recorder mileage",
            }
        )
        return data


class Ec3CurrentTripEnergySensor(Ec3MetricSensor):
    _attr_name = "Current trip energy"
    _attr_translation_key = "current_trip_energy"
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
    _attr_translation_key = "current_charge_power"
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
    _attr_translation_key = "last_trip_result"
    _attr_icon = "mdi:map-marker-check"
    _attr_native_unit_of_measurement = UnitOfLength.KILOMETERS
    _attr_device_class = SensorDeviceClass.DISTANCE
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, METRIC_LAST_TRIP)

    @property
    def native_value(self) -> float | None:
        trip = self.metrics.canonical_last_trip()
        return trip.get("distance_km") if isinstance(trip, dict) else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = super().extra_state_attributes
        trip = self.metrics.canonical_last_trip()
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
    _attr_translation_key = "last_charge_result"
    _attr_icon = "mdi:battery-check"

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, METRIC_LAST_CHARGE)

    @property
    def native_value(self) -> str | None:
        charge = self.metrics.canonical_last_charge()
        return charge.get("id") if isinstance(charge, dict) else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = super().extra_state_attributes
        charge = self.metrics.canonical_last_charge()
        if isinstance(charge, dict):
            data.update(charge)
        return data
