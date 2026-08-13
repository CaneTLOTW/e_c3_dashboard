"""Constants for the e-C3 Dashboard integration."""

from __future__ import annotations

from homeassistant.const import Platform

DOMAIN = "e_c3_dashboard"
PLATFORMS: list[Platform] = [Platform.SENSOR]

UPSTREAM_DOMAIN = "stellantis_vehicles"
MIN_UPSTREAM_VERSION = "2026.7.2"

CONF_VEHICLE_DEVICE_ID = "vehicle_device_id"
CONF_VEHICLE_SLUG = "vehicle_slug"

OPTION_TRIPS = "trips"
OPTION_CHARGING = "charging"
OPTION_GPS = "gps"
OPTION_WAKEUP = "wakeup"
OPTION_NOTIFICATIONS = "notifications"

DEFAULT_OPTIONS = {
    OPTION_TRIPS: True,
    OPTION_CHARGING: True,
    OPTION_GPS: True,
    OPTION_WAKEUP: True,
    OPTION_NOTIFICATIONS: False,
}

FRONTEND_URL = "/e_c3_dashboard/e_c3_dashboard.js"
FRONTEND_VERSION = "0.2.1"
STATIC_VERSION = FRONTEND_VERSION

METRIC_TRAILING_CONSUMPTION = "trailing_consumption_500km"
METRIC_DISTANCE_SINCE_CHARGE = "distance_since_charge"
METRIC_CURRENT_TRIP_ENERGY = "current_trip_energy"
METRIC_LAST_TRIP = "last_trip_result"
METRIC_KEYS = (
    METRIC_TRAILING_CONSUMPTION,
    METRIC_DISTANCE_SINCE_CHARGE,
    METRIC_CURRENT_TRIP_ENERGY,
    METRIC_LAST_TRIP,
)
