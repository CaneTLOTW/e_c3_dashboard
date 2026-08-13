"""e-C3 Dashboard config-entry setup and bundled frontend registration."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_call_later

from .const import DOMAIN, FRONTEND_URL, FRONTEND_VERSION, PLATFORMS
from .coordinator import Ec3DashboardCoordinator
from .metrics import VehicleMetricsManager

type Ec3DashboardConfigEntry = ConfigEntry

_LOGGER = logging.getLogger(__name__)


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
            "Lovelace resource storage is unavailable; add %s as a JavaScript module manually",
            FRONTEND_URL,
        )
        return

    async def _register_when_ready(_now: Any) -> None:
        if not lovelace.resources.loaded:
            async_call_later(hass, 5, _register_when_ready)
            return

        expected_url = f"{FRONTEND_URL}?v={FRONTEND_VERSION}"
        for resource in lovelace.resources.async_items():
            if resource["url"].split("?", 1)[0] != FRONTEND_URL:
                continue
            if resource["url"] != expected_url or resource.get("type") != "module":
                await lovelace.resources.async_update_item(
                    resource["id"], {"res_type": "module", "url": expected_url}
                )
                _LOGGER.info("Updated e-C3 Dashboard strategy resource %s", expected_url)
            else:
                _LOGGER.info("e-C3 Dashboard strategy resource is ready: %s", expected_url)
            return

        await lovelace.resources.async_create_item(
            {"res_type": "module", "url": expected_url}
        )
        _LOGGER.info("Registered e-C3 Dashboard strategy resource %s", expected_url)

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

    hass.data[DOMAIN][entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: Ec3DashboardConfigEntry
) -> bool:
    """Unload a selected vehicle without touching its upstream integration."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        await hass.data[DOMAIN][entry.entry_id].metrics.async_shutdown()
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unloaded


async def _async_reload_entry(
    hass: HomeAssistant, entry: Ec3DashboardConfigEntry
) -> None:
    """Apply changed module options."""
    await hass.config_entries.async_reload(entry.entry_id)
