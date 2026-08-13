"""e-C3 Dashboard config-entry setup and bundled frontend registration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, FRONTEND_URL, FRONTEND_VERSION, PLATFORMS
from .coordinator import Ec3DashboardCoordinator

type Ec3DashboardConfigEntry = ConfigEntry


async def async_setup(hass: HomeAssistant, _config: dict) -> bool:
    """Set up static frontend assets exactly once."""

    if DOMAIN in hass.data:
        return True

    frontend_file = Path(__file__).parent / "static" / "e_c3_dashboard.js"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_URL, str(frontend_file), cache_headers=False)]
    )
    add_extra_js_url(hass, f"{FRONTEND_URL}?v={FRONTEND_VERSION}")
    hass.data[DOMAIN] = {}
    return True


async def async_setup_entry(
    hass: HomeAssistant, entry: Ec3DashboardConfigEntry
) -> bool:
    """Set up one selected upstream Stellantis vehicle."""
    coordinator = Ec3DashboardCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

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
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unloaded


async def _async_reload_entry(
    hass: HomeAssistant, entry: Ec3DashboardConfigEntry
) -> None:
    """Apply changed module options."""
    await hass.config_entries.async_reload(entry.entry_id)
