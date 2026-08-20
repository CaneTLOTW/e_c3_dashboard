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
    PLATFORMS,
)
from .coordinator import Ec3DashboardCoordinator
from .dashboard import async_ensure_dashboard, async_remove_dashboard_marker
from .metrics import VehicleMetricsManager
from .notifications import VehicleNotificationManager
from .server_history import ServerHistoryManager

type Ec3DashboardConfigEntry = ConfigEntry

_LOGGER = logging.getLogger(__name__)

# This integration is configured exclusively through its config flow.
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def _async_register_frontend_resource(hass: HomeAssistant) -> None:
    """Register the strategy as a normal Lovelace module resource.

    ``add_extra_js_url`` is appropriate for integration-owned panels but is
    not a dependable strategy loader: the dashboard can be opened before the
    dynamically advertised module has reached the browser.  A stored
    Lovelace resource is loaded before a strategy is resolved.
    """
    lovelace = hass.data.get("lovelace")
    if lovelace is None or getattr(lovelace, "resource_mode", "storage") != "storage":
        _LOGGER.warning(
            "Lovelace resource storage is unavailable; add the e-C3 Dashboard JavaScript modules manually",
        )
        return

    async def _register_when_ready(_now: Any) -> None:
        if not lovelace.resources.loaded:
            async_call_later(hass, 5, _register_when_ready)
            return

        existing = {
            resource["url"].split("?", 1)[0]: resource
            for resource in lovelace.resources.async_items()
        }
        # Register the package-owned cards as Lovelace resources as well as
        # the strategy. This makes the HACS package self-contained and avoids
        # accidentally using similarly named cards from a household dashboard.
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
    frontend_file = static_dir / "e_c3_dashboard.js"
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(FRONTEND_URL, str(frontend_file), cache_headers=False),
            StaticPathConfig(
                "/e_c3_dashboard/trip-history-card.js",
                str(static_dir / "trip-history-card.js"),
                cache_headers=False,
            ),
            StaticPathConfig(
                "/e_c3_dashboard/charge-history-card.js",
                str(static_dir / "charge-history-card.js"),
                cache_headers=False,
            ),
            StaticPathConfig(
                "/e_c3_dashboard/charge-history-core.js",
                str(static_dir / "charge-history-core.js"),
                cache_headers=False,
            ),
            StaticPathConfig(
                "/e_c3_dashboard/i18n.js",
                str(static_dir / "i18n.js"),
                cache_headers=False,
            ),
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

    metrics = VehicleMetricsManager(
        hass, entry, coordinator.data["entity_mapping"]
    )
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
    """Remove package-owned persisted state when a config entry is deleted.

    This does not touch upstream entities, Recorder history, or any user
    dashboard. It only prevents a later setup using the same local slug from
    inheriting old trip, charging, or notification markers.
    """
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
