"""Constants for the e-C3 Dashboard integration."""

from __future__ import annotations

from homeassistant.const import Platform

DOMAIN = "e_c3_dashboard"
PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.SWITCH, Platform.BUTTON]

UPSTREAM_DOMAIN = "stellantis_vehicles"
MIN_UPSTREAM_VERSION = "2026.7.2"

CONF_VEHICLE_DEVICE_ID = "vehicle_device_id"
CONF_VEHICLE_SLUG = "vehicle_slug"

OPTION_TRIPS = "trips"
OPTION_CHARGING = "charging"
OPTION_GPS = "gps"
OPTION_WAKEUP = "wakeup"
OPTION_NOTIFICATIONS = "notifications"
OPTION_NOTIFICATION_RECIPIENTS = "notification_recipients"
OPTION_HISTORY_HOURS = "history_hours"

DEFAULT_OPTIONS = {
    OPTION_TRIPS: True,
    OPTION_CHARGING: True,
    OPTION_GPS: True,
    OPTION_WAKEUP: True,
    OPTION_NOTIFICATIONS: False,
    # Recipients are selected in the options flow. They remain disabled until
    # explicitly enabled on the generated dashboard.
    OPTION_NOTIFICATION_RECIPIENTS: [],
    # Dashboard query/display horizon only. Recorder retention remains under
    # the user's global Home Assistant configuration.
    OPTION_HISTORY_HOURS: 2160,
}

FRONTEND_URL = "/e_c3_dashboard/e_c3_dashboard.js"
FRONTEND_VERSION = "0.4.9"
STATIC_VERSION = FRONTEND_VERSION
FRONTEND_RESOURCE_URLS = (
    "/e_c3_dashboard/trip-history-card.js",
    "/e_c3_dashboard/charge-history-card.js",
    FRONTEND_URL,
)

METRIC_TRAILING_CONSUMPTION = "trailing_consumption_500km"
METRIC_DISTANCE_SINCE_CHARGE = "distance_since_charge"
METRIC_CURRENT_TRIP_ENERGY = "current_trip_energy"
METRIC_LAST_TRIP = "last_trip_result"
METRIC_CURRENT_CHARGE_POWER = "current_charge_power"
METRIC_LAST_CHARGE = "last_charge_result"
METRIC_KEYS = (
    METRIC_TRAILING_CONSUMPTION,
    METRIC_DISTANCE_SINCE_CHARGE,
    METRIC_CURRENT_TRIP_ENERGY,
    METRIC_LAST_TRIP,
    METRIC_CURRENT_CHARGE_POWER,
    METRIC_LAST_CHARGE,
)

AUTO_DASHBOARD_STORAGE_VERSION = 1
AUTO_DASHBOARD_STRATEGY = "custom:e-c3-dashboard"
LEGACY_AUTO_DASHBOARD_STRATEGY = "e-c3-dashboard"
