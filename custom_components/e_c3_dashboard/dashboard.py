"""Safe creation and metadata sync of package-owned Lovelace dashboards."""

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
    OPTION_DASHBOARD_NAME,
)

_LOGGER = logging.getLogger(__name__)


def _store(hass, entry_id: str) -> Store[dict[str, Any]]:
    """Return the small per-entry marker store for dashboard onboarding."""
    return Store(
        hass,
        AUTO_DASHBOARD_STORAGE_VERSION,
        f"{DOMAIN}_{entry_id}_dashboard",
    )


def dashboard_title_for_entry(hass, entry) -> str:
    """Return the visible title without exposing vehicle identity unnecessarily.

    One configured vehicle needs no disambiguation and therefore uses the
    neutral ``e-C3`` title. With multiple entries, the upstream/entry title is
    used only as the automatic differentiator. A user-provided option always
    wins and can replace either default completely.
    """
    configured = str(entry.options.get(OPTION_DASHBOARD_NAME, "")).strip()
    if configured:
        return configured
    entries = hass.config_entries.async_entries(DOMAIN)
    if len(entries) <= 1:
        return "e-C3"
    fallback = str(entry.title or "").strip() or entry.entry_id[-6:]
    return f"e-C3 · {fallback}"


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
        if selected_entry is None and package_entry_count == 1:
            return True
    return False


async def _async_repair_legacy_generated_dashboard(hass, entry, marker: dict[str, Any]) -> None:
    """Correct only the package-created legacy strategy configuration."""
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


async def _async_sync_generated_dashboard_metadata(
    hass, entry, marker: dict[str, Any]
) -> None:
    """Update only metadata of a dashboard proven to be package-created.

    The marker contains the exact URL path created by this integration. A
    marker with only ``reason=existing_strategy`` deliberately has no URL path
    and is never touched, because that dashboard may be user-managed.
    """
    url_path = marker.get("url_path")
    lovelace = hass.data.get(LOVELACE_DATA)
    if not isinstance(url_path, str) or lovelace is None:
        return

    dashboard_config = lovelace.dashboards.get(url_path)
    if dashboard_config is None or not isinstance(dashboard_config.config, dict):
        return

    desired_title = dashboard_title_for_entry(hass, entry)
    current = dashboard_config.config
    if current.get("title") == desired_title:
        return

    dashboards = lovelace_dashboard.DashboardsCollection(hass)
    await dashboards.async_load()
    item = next(
        (candidate for candidate in dashboards.async_items() if candidate.get("url_path") == url_path),
        None,
    )
    if item is None:
        return

    updated = await dashboards.async_update_item(item["id"], {"title": desired_title})

    # This local collection instance is intentionally not wired to Lovelace's
    # setup listener. Mirror the core listener's runtime side effects so the
    # sidebar title changes immediately, without changing url_path/config data.
    dashboard_config.config = updated
    frontend.async_register_built_in_panel(
        hass,
        "lovelace",
        frontend_url_path=url_path,
        require_admin=updated["require_admin"],
        show_in_sidebar=updated["show_in_sidebar"],
        sidebar_title=updated["title"],
        sidebar_icon=updated.get("icon", "mdi:lovelace"),
        config={"mode": MODE_STORAGE},
        update=True,
    )
    _LOGGER.info("Updated e-C3 Dashboard title at /%s to %s", url_path, desired_title)


async def async_sync_generated_dashboard_metadata(hass) -> None:
    """Synchronize visible titles for all package-created vehicle dashboards."""
    for entry in hass.config_entries.async_entries(DOMAIN):
        marker = await _store(hass, entry.entry_id).async_load() or {}
        await _async_sync_generated_dashboard_metadata(hass, entry, marker)


async def async_ensure_dashboard(hass, entry) -> None:
    """Create one package dashboard per config entry and keep its title current."""
    marker_store = _store(hass, entry.entry_id)
    marker = await marker_store.async_load() or {}
    if marker.get("handled"):
        await _async_repair_legacy_generated_dashboard(hass, entry, marker)
        await async_sync_generated_dashboard_metadata(hass)
        return

    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None:
        _LOGGER.warning("Lovelace is not ready; e-C3 Dashboard was not created yet")
        return

    if await _async_has_matching_strategy(hass, entry.entry_id):
        await marker_store.async_save({"handled": True, "reason": "existing_strategy"})
        await async_sync_generated_dashboard_metadata(hass)
        return

    vehicle_slug = entry.data["vehicle_slug"]
    url_path = slugify(f"e-c3-{vehicle_slug}", separator="-")
    title = dashboard_title_for_entry(hass, entry)

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
        _LOGGER.exception("Could not register the e-C3 Dashboard panel")
        return

    await marker_store.async_save({"handled": True, "url_path": url_path})
    await async_sync_generated_dashboard_metadata(hass)
    _LOGGER.info("Created e-C3 Dashboard at /%s for %s", url_path, entry.title)
