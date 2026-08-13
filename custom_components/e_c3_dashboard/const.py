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
FRONTEND_VERSION = "0.1.0"
