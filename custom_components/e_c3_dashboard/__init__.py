"""e-C3 Dashboard config-entry setup and bundled frontend registration."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.storage import Store

from .const import (
    CONF_VEHICLE_SLUG,
    DOMAIN,
    FRONTEND_RESOURCE_URLS,
    FRONTEND_URL,
    FRONTEND_VERSION,
    LEGACY_FRONTEND_RESOURCE_URLS,
    PLATFORMS,
)
from .coordinator import Ec3DashboardCoordinator
from .dashboard import async_ensure_dashboard, async_remove_dashboard_marker
from .metrics import VehicleMetricsManager
from .notifications import VehicleNotificationManager
from .server_history import ServerHistoryManager

type Ec3DashboardConfigEntry = ConfigEntry

_LOGGER = logging.getLogger(__name__)
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def _async_register_frontend_resource(hass: HomeAssistant) -> None:
    """Keep exactly one package-owned Lovelace resource registered.

    Internal package JavaScript remains available through static paths and is
    imported by ``frontend.js``. Older installations registered several e-C3
    modules independently; remove only those package-owned legacy entries so
    Home Assistant no longer has competing load points/orderings.
    """
    lovelace = hass.data.get("lovelace")
    if lovelace is None or getattr(lovelace, "resource_mode", "storage") != "storage":
        _LOGGER.warning(
            "Lovelace resource storage is unavailable; add %s manually",
            FRONTEND_URL,
        )
        return

    async def _register_when_ready(_now: Any) -> None:
        if not lovelace.resources.loaded:
            async_call_later(hass, 5, _register_when_ready)
            return

        existing_items = list(lovelace.resources.async_items())
        existing = {
            item["url"].split("?", 1)[0]: item
            for item in existing_items
            if item.get("url")
        }

        for legacy_url in LEGACY_FRONTEND_RESOURCE_URLS:
            if legacy_url == FRONTEND_URL:
                continue
            legacy = existing.get(legacy_url)
            if legacy is None:
                continue
            await lovelace.resources.async_delete_item(legacy["id"])
            _LOGGER.info("Removed legacy e-C3 Dashboard resource %s", legacy_url)

        for resource_url in FRONTEND_RESOURCE_URLS:
            expected_url = f"{resource_url}?v={FRONTEND_VERSION}"
            resource = existing.get(resource_url)
            if resource is None:
                await lovelace.resources.async_create_item(
                    {"res_type": "module", "url": expected_url}
                )
                _LOGGER.info("Registered e-C3 Dashboard resource %s", expected_url)
            elif resource["url"] != expected_url or resource.get("type") != "module":
                await lovelace.resources.async_update_item(
                    resource["id"], {"res_type": "module", "url": expected_url}
                )
                _LOGGER.info("Updated e-C3 Dashboard resource %s", expected_url)

    await _register_when_ready(0)


async def async_setup(hass: HomeAssistant, _config: dict) -> bool:
    """Set up static frontend assets exactly once."""
    if DOMAIN in hass.data:
        return True

    static_dir = Path(__file__).parent / "static"
    static_paths = [
        "frontend.js",
        "e_c3_dashboard.js",
        "gps-history-card.js",
        "gps-history-core.js",
        "vehicle-overview-card.js",
        "trip-history-card.js",
        "charge-history-card.js",
        "charge-history-core.js",
        "i18n.js",
    ]
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                f"/e_c3_dashboard/{filename}",
                str(static_dir / filename),
                cache_headers=False,
            )
            for filename in static_paths
        ]
    )
    await _async_register_frontend_resource(hass)
    hass.data[DOMAIN] = {}
    return True


async def async_setup_entry(
    hass: HomeAssistant, entry: Ec3DashboardConfigEntry
) -> bool:
    """Set up one selected upstream Stellantis vehicle."""
    coordinator = Ec3DashboardCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    metrics = VehicleMetricsManager(hass, entry, coordinator.data["entity_mapping"])
    await metrics.async_initialize()
    coordinator.metrics = metrics

    server_history = ServerHistoryManager(
        hass, entry, coordinator.data["entity_mapping"], metrics
    )
    await server_history.async_initialize()
    coordinator.server_history = server_history
    metrics.server_history = server_history

    notifications = VehicleNotificationManager(
        hass, entry, coordinator.data["entity_mapping"], metrics
    )
    await notifications.async_initialize()
    coordinator.notifications = notifications

    hass.data[DOMAIN][entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    # ``async_forward_entry_setups`` has completed only after every platform
    # has accepted its entities.  Give Home Assistant one drain cycle before
    # publishing the status mapping so Number/Time controls are present on the
    # first normal strategy/dashboard build as well.
    await hass.async_block_till_done()
    await notifications.async_refresh_entities()
    await async_ensure_dashboard(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: Ec3DashboardConfigEntry
) -> bool:
    """Unload a selected vehicle without touching its upstream integration."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        coordinator = hass.data[DOMAIN][entry.entry_id]
        await coordinator.notifications.async_shutdown()
        await coordinator.metrics.async_shutdown()
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unloaded


async def async_remove_entry(
    hass: HomeAssistant, entry: Ec3DashboardConfigEntry
) -> None:
    """Remove only package-owned persisted state for a deleted config entry."""
    slug = entry.data[CONF_VEHICLE_SLUG]
    await Store(hass, 1, f"{DOMAIN}_{slug}_metrics").async_remove()
    await Store(hass, 1, f"{DOMAIN}_{slug}_server_history").async_remove()
    await Store(hass, 1, f"{DOMAIN}_{slug}_charge_curves").async_remove()
    await Store(hass, 1, f"{DOMAIN}_{slug}_notifications").async_remove()
    await async_remove_dashboard_marker(hass, entry.entry_id)


async def _async_reload_entry(
    hass: HomeAssistant, entry: Ec3DashboardConfigEntry
) -> None:
    """Apply changed module options."""
    await hass.config_entries.async_reload(entry.entry_id)
