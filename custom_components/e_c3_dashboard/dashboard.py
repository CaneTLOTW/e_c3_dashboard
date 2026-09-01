"""Safe creation and metadata sync of package-owned Lovelace dashboards."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.components import frontend
from homeassistant.components.lovelace import dashboard as lovelace_dashboard
from homeassistant.components.lovelace.const import LOVELACE_DATA, MODE_STORAGE
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.storage import Store
from homeassistant.util import slugify

from .const import (
    AUTO_DASHBOARD_STORAGE_VERSION,
    AUTO_DASHBOARD_STRATEGY,
    CONF_VEHICLE_DEVICE_ID,
    DOMAIN,
    LEGACY_AUTO_DASHBOARD_STRATEGY,
    OPTION_DASHBOARD_NAME,
)

_LOGGER = logging.getLogger(__name__)

_BRAND_BY_MANUFACTURER = {
    "mycitroen": "Citroën",
    "mypeugeot": "Peugeot",
    "myopel": "Opel",
    "myds": "DS",
    "myvauxhall": "Vauxhall",
}


def _store(hass, entry_id: str) -> Store[dict[str, Any]]:
    """Return the small per-entry marker store for dashboard onboarding."""
    return Store(
        hass,
        AUTO_DASHBOARD_STORAGE_VERSION,
        f"{DOMAIN}_{entry_id}_dashboard",
    )


def vehicle_brand_for_entry(hass, entry) -> str:
    """Resolve the user-facing Stellantis brand from the upstream device.

    Stellantis Vehicles registers the selected mobile app (for example
    ``MyCitroen`` or ``MyDS``) as the device manufacturer. That is a stable
    source for dashboard naming and does not depend on localized entity IDs or
    on a model-name lookup that is not consistently exposed by the API.
    """
    device_id = entry.data.get(CONF_VEHICLE_DEVICE_ID)
    device = dr.async_get(hass).async_get(device_id) if device_id else None
    raw = str(getattr(device, "manufacturer", "") or "").strip()
    if not raw:
        return "Stellantis"
    known = _BRAND_BY_MANUFACTURER.get(raw.casefold())
    if known:
        return known
    # Preserve a future upstream brand instead of hard-coding an e-C3 fallback.
    return raw[2:] if raw.casefold().startswith("my") and len(raw) > 2 else raw


def _brand_entries(hass, brand: str) -> list[Any]:
    """Return package entries of the same resolved brand in stable order."""
    entries = [
        candidate
        for candidate in hass.config_entries.async_entries(DOMAIN)
        if vehicle_brand_for_entry(hass, candidate) == brand
    ]
    return sorted(entries, key=lambda candidate: candidate.entry_id)


def dashboard_title_for_entry(hass, entry) -> str:
    """Return the visible brand-aware title for one generated dashboard.

    A user-provided name always wins. Otherwise a single vehicle uses just the
    brand. Multiple package entries of the same brand are numbered without
    changing their technical vehicle identity.
    """
    configured = str(entry.options.get(OPTION_DASHBOARD_NAME, "")).strip()
    if configured:
        return configured

    brand = vehicle_brand_for_entry(hass, entry)
    same_brand = _brand_entries(hass, brand)
    if len(same_brand) <= 1:
        return brand
    try:
        ordinal = same_brand.index(entry) + 1
    except ValueError:
        return brand
    return f"{brand} ({ordinal})"


def _dashboard_url_base_for_entry(hass, entry) -> str:
    """Return a generic brand-based base path for package dashboards."""
    brand = slugify(vehicle_brand_for_entry(hass, entry), separator="-") or "stellantis"
    return f"{brand}-dashboard"


def _available_dashboard_url_path(hass, entry, *, ignore: str | None = None) -> str:
    """Return the first free stable brand path without touching user panels."""
    lovelace = hass.data.get(LOVELACE_DATA)
    base = _dashboard_url_base_for_entry(hass, entry)
    candidate = base
    suffix = 2
    while (
        candidate != ignore
        and (
            (lovelace is not None and candidate in lovelace.dashboards)
            or frontend.async_panel_exists(hass, candidate)
        )
    ):
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


async def async_remove_dashboard_marker(hass, entry_id: str) -> None:
    """Delete only the package's onboarding marker, never a user dashboard."""
    await _store(hass, entry_id).async_remove()


async def _async_matching_strategy_url_path(hass, entry_id: str) -> str | None:
    """Return the URL path of a dashboard already targeting this entry."""
    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None:
        return None

    package_entry_count = len(hass.config_entries.async_entries(DOMAIN))
    for url_path, dashboard in lovelace.dashboards.items():
        if not isinstance(url_path, str):
            continue
        try:
            dashboard_config = await dashboard.async_load(False)
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
            return url_path
        if selected_entry is None and package_entry_count == 1:
            return url_path
    return None


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


async def _async_migrate_generated_dashboard_url(
    hass, entry, marker: dict[str, Any]
) -> dict[str, Any]:
    """Move only a proven package-owned legacy dashboard to a brand path.

    Home Assistant does not allow ``url_path`` in dashboard update fields, so
    the safe migration is create-new -> copy strategy config -> register ->
    remove-old. The marker and entry-bound strategy are both required before
    any destructive step, and a conflicting user panel is never overwritten.
    """
    current_url_path = marker.get("url_path")
    lovelace = hass.data.get(LOVELACE_DATA)
    if (
        not isinstance(current_url_path, str)
        or not current_url_path.startswith("e-c3-")
        or lovelace is None
    ):
        return marker

    old_dashboard = lovelace.dashboards.get(current_url_path)
    if old_dashboard is None:
        return marker
    try:
        config = await old_dashboard.async_load(False)
    except HomeAssistantError:
        return marker
    strategy = config.get("strategy")
    if (
        not isinstance(strategy, dict)
        or strategy.get("type") not in {
            AUTO_DASHBOARD_STRATEGY,
            LEGACY_AUTO_DASHBOARD_STRATEGY,
        }
        or strategy.get("entry_id") != entry.entry_id
    ):
        return marker

    desired_url_path = _available_dashboard_url_path(
        hass, entry, ignore=current_url_path
    )
    if desired_url_path == current_url_path:
        return marker

    dashboards = lovelace_dashboard.DashboardsCollection(hass)
    await dashboards.async_load()
    old_item = next(
        (
            candidate
            for candidate in dashboards.async_items()
            if candidate.get("url_path") == current_url_path
        ),
        None,
    )
    if old_item is None:
        return marker

    title = dashboard_title_for_entry(hass, entry)
    new_item = None
    new_dashboard = None
    new_panel_registered = False
    try:
        new_item = await dashboards.async_create_item(
            {
                "title": title,
                "icon": old_item.get("icon", "mdi:car-electric"),
                "show_in_sidebar": old_item.get("show_in_sidebar", True),
                "require_admin": old_item.get("require_admin", False),
                "url_path": desired_url_path,
            }
        )
        new_dashboard = lovelace_dashboard.LovelaceStorage(hass, new_item)
        await new_dashboard.async_save(config)
        frontend.async_register_built_in_panel(
            hass,
            "lovelace",
            frontend_url_path=desired_url_path,
            require_admin=new_item["require_admin"],
            show_in_sidebar=new_item["show_in_sidebar"],
            sidebar_title=new_item["title"],
            sidebar_icon=new_item.get("icon", "mdi:lovelace"),
            config={"mode": MODE_STORAGE},
        )
        new_panel_registered = True
    except (HomeAssistantError, ValueError):
        _LOGGER.exception(
            "Could not create brand dashboard path /%s; keeping /%s",
            desired_url_path,
            current_url_path,
        )
        if new_panel_registered:
            frontend.async_remove_panel(
                hass, desired_url_path, warn_if_unknown=False
            )
        if new_item is not None:
            try:
                await dashboards.async_delete_item(new_item["id"])
            except HomeAssistantError:
                _LOGGER.debug("Could not remove failed dashboard metadata", exc_info=True)
        if new_dashboard is not None:
            try:
                await new_dashboard.async_delete()
            except HomeAssistantError:
                _LOGGER.debug("Could not remove failed dashboard config", exc_info=True)
        return marker

    lovelace.dashboards[desired_url_path] = new_dashboard
    frontend.async_remove_panel(hass, current_url_path, warn_if_unknown=False)
    lovelace.dashboards.pop(current_url_path, None)
    try:
        await dashboards.async_delete_item(old_item["id"])
        await old_dashboard.async_delete()
    except HomeAssistantError:
        _LOGGER.warning(
            "Brand dashboard /%s is active, but legacy metadata for /%s could not be fully removed",
            desired_url_path,
            current_url_path,
            exc_info=True,
        )

    _LOGGER.info(
        "Migrated package dashboard /%s to /%s",
        current_url_path,
        desired_url_path,
    )
    return {
        **marker,
        "url_path": desired_url_path,
        "previous_url_path": current_url_path,
        "url_migrated": True,
    }


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
    _LOGGER.info("Updated dashboard title at /%s to %s", url_path, desired_title)


async def async_sync_generated_dashboard_metadata(hass) -> None:
    """Synchronize visible titles for all package-created vehicle dashboards."""
    for entry in hass.config_entries.async_entries(DOMAIN):
        marker = await _store(hass, entry.entry_id).async_load() or {}
        await _async_sync_generated_dashboard_metadata(hass, entry, marker)


async def async_ensure_dashboard(hass, entry) -> str | None:
    """Create/migrate one package dashboard and return its actual URL path."""
    marker_store = _store(hass, entry.entry_id)
    marker = await marker_store.async_load() or {}
    if marker.get("handled"):
        migrated = await _async_migrate_generated_dashboard_url(hass, entry, marker)
        if migrated != marker:
            marker = migrated
            await marker_store.async_save(marker)
        await _async_repair_legacy_generated_dashboard(hass, entry, marker)
        await async_sync_generated_dashboard_metadata(hass)
        url_path = marker.get("url_path")
        if isinstance(url_path, str):
            return url_path
        return await _async_matching_strategy_url_path(hass, entry.entry_id)

    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None:
        _LOGGER.warning("Lovelace is not ready; dashboard was not created yet")
        return None

    matching_url_path = await _async_matching_strategy_url_path(
        hass, entry.entry_id
    )
    if matching_url_path is not None:
        await marker_store.async_save(
            {
                "handled": True,
                "reason": "existing_strategy",
                "navigation_url_path": matching_url_path,
            }
        )
        await async_sync_generated_dashboard_metadata(hass)
        return matching_url_path

    url_path = _available_dashboard_url_path(hass, entry)
    title = dashboard_title_for_entry(hass, entry)

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
        _LOGGER.exception("Could not create the dashboard storage entry")
        return None

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
        _LOGGER.exception("Could not register the dashboard panel")
        return None

    await marker_store.async_save({"handled": True, "url_path": url_path})
    await async_sync_generated_dashboard_metadata(hass)
    _LOGGER.info("Created dashboard at /%s for %s", url_path, entry.title)
    return url_path
