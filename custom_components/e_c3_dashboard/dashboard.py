"""Safe, one-time creation of the package-owned Lovelace dashboard."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.components import frontend
from homeassistant.components.lovelace import dashboard as lovelace_dashboard
from homeassistant.components.lovelace.const import LOVELACE_DATA, MODE_STORAGE
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.storage import Store
from homeassistant.util import slugify

from .const import (
    AUTO_DASHBOARD_STORAGE_VERSION,
    AUTO_DASHBOARD_STRATEGY,
    DOMAIN,
    LEGACY_AUTO_DASHBOARD_STRATEGY,
)

_LOGGER = logging.getLogger(__name__)


def _store(hass, entry_id: str) -> Store[dict[str, Any]]:
    """Return the small per-entry marker store for dashboard onboarding."""
    return Store(
        hass,
        AUTO_DASHBOARD_STORAGE_VERSION,
        f"{DOMAIN}_{entry_id}_dashboard",
    )


async def async_remove_dashboard_marker(hass, entry_id: str) -> None:
    """Delete only the package's onboarding marker, never a user dashboard."""
    await _store(hass, entry_id).async_remove()


async def _async_has_matching_strategy(hass, entry_id: str) -> bool:
    """Return whether a dashboard already targets this package entry."""
    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None:
        return False

    package_entry_count = len(hass.config_entries.async_entries(DOMAIN))
    for config in lovelace.dashboards.values():
        try:
            dashboard_config = await config.async_load(False)
        except HomeAssistantError:
            continue
        strategy = dashboard_config.get("strategy")
        if not isinstance(strategy, dict) or strategy.get("type") not in {
            AUTO_DASHBOARD_STRATEGY,
            LEGACY_AUTO_DASHBOARD_STRATEGY,
        }:
            continue
        selected_entry = strategy.get("entry_id")
        if selected_entry == entry_id:
            return True
        # A dashboard created by the former manual flow had no entry ID. It
        # necessarily belongs to the sole package entry in that configuration.
        if selected_entry is None and package_entry_count == 1:
            return True
    return False


async def _async_repair_legacy_generated_dashboard(hass, entry, marker: dict[str, Any]) -> None:
    """Correct only the package-created 0.4.8 strategy configuration.

    Version 0.4.8 omitted the required ``custom:`` prefix. The marker records
    the exact dashboard created by this package, so this migration cannot touch
    a user-created dashboard.
    """
    url_path = marker.get("url_path")
    lovelace = hass.data.get(LOVELACE_DATA)
    if not isinstance(url_path, str) or lovelace is None:
        return
    dashboard_config = lovelace.dashboards.get(url_path)
    if dashboard_config is None:
        return
    try:
        config = await dashboard_config.async_load(False)
    except HomeAssistantError:
        return
    strategy = config.get("strategy")
    if not isinstance(strategy, dict):
        return
    if (
        strategy.get("type") != LEGACY_AUTO_DASHBOARD_STRATEGY
        or strategy.get("entry_id") != entry.entry_id
    ):
        return
    await dashboard_config.async_save(
        {**config, "strategy": {**strategy, "type": AUTO_DASHBOARD_STRATEGY}}
    )
    _LOGGER.info("Repaired the e-C3 Dashboard strategy at /%s", url_path)


async def async_ensure_dashboard(hass, entry) -> None:
    """Create one new dashboard after setup, without altering user dashboards.

    Home Assistant has no public integration API for creating a storage
    dashboard. This mirrors the core's own storage-dashboard creation path:
    create the dashboard record, save only the strategy config and register its
    Lovelace panel for the current runtime. It intentionally does not update,
    recreate or remove an existing dashboard.
    """
    marker_store = _store(hass, entry.entry_id)
    marker = await marker_store.async_load() or {}
    if marker.get("handled"):
        await _async_repair_legacy_generated_dashboard(hass, entry, marker)
        return

    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None:
        _LOGGER.warning("Lovelace is not ready; e-C3 Dashboard was not created yet")
        return

    if await _async_has_matching_strategy(hass, entry.entry_id):
        await marker_store.async_save({"handled": True, "reason": "existing_strategy"})
        return

    vehicle_slug = entry.data["vehicle_slug"]
    url_path = slugify(f"e-c3-{vehicle_slug}", separator="-")
    title = f"e-C3 · {entry.title}"

    # Never claim an existing URL path, even when it is not an e-C3 dashboard.
    if url_path in lovelace.dashboards:
        _LOGGER.warning(
            "Cannot create e-C3 Dashboard at /%s because that dashboard already exists",
            url_path,
        )
        await marker_store.async_save({"handled": True, "reason": "url_conflict"})
        return

    dashboards = lovelace_dashboard.DashboardsCollection(hass)
    await dashboards.async_load()
    try:
        item = await dashboards.async_create_item(
            {
                "title": title,
                "icon": "mdi:car-electric",
                "show_in_sidebar": True,
                "require_admin": False,
                "url_path": url_path,
            }
        )
    except HomeAssistantError:
        _LOGGER.exception("Could not create the e-C3 Dashboard storage entry")
        return

    dashboard_config = lovelace_dashboard.LovelaceStorage(hass, item)
    try:
        await dashboard_config.async_save(
            {
                "strategy": {
                    "type": AUTO_DASHBOARD_STRATEGY,
                    "entry_id": entry.entry_id,
                }
            }
        )
        lovelace.dashboards[url_path] = dashboard_config
        frontend.async_register_built_in_panel(
            hass,
            "lovelace",
            frontend_url_path=url_path,
            require_admin=False,
            show_in_sidebar=True,
            sidebar_title=title,
            sidebar_icon="mdi:car-electric",
            config={"mode": MODE_STORAGE},
        )
    except (HomeAssistantError, ValueError):
        # The dashboard record remains visible in the normal dashboard manager
        # if a later panel registration fails. Do not retry automatically: this
        # avoids replacing a user decision after a manual removal or rename.
        _LOGGER.exception("Could not register the e-C3 Dashboard panel")
        return

    await marker_store.async_save({"handled": True, "url_path": url_path})
    _LOGGER.info("Created e-C3 Dashboard at /%s for %s", url_path, entry.title)
