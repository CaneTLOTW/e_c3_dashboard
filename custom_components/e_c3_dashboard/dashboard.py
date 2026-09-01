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

from .capabilities import POWERTRAIN_ELECTRIC, POWERTRAIN_HYBRID
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


def dashboard_icon_for_entry(hass, entry) -> str:
    """Return an icon matching the resolved vehicle powertrain."""
    coordinator = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    powertrain = getattr(coordinator, "data", {}).get("powertrain") if coordinator else None
    return (
        "mdi:car-electric"
        if powertrain in {POWERTRAIN_ELECTRIC, POWERTRAIN_HYBRID}
        else "mdi:car"
    )


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
    desired_icon = dashboard_icon_for_entry(hass, entry)
    current = dashboard_config.config
    if current.get("title") == desired_title and current.get("icon") == desired_icon:
        return

    dashboards = lovelace_dashboard.DashboardsCollection(hass)
    await dashboards.async_load()
    item = next(
        (candidate for candidate in dashboards.async_items() if candidate.get("url_path") == url_path),
        None,
    )
    if item is None:
        return

    updated = await dashboards.async_update_item(
        item["id"], {"title": desired_title, "icon": desired_icon}
    )

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
    icon = dashboard_icon_for_entry(hass, entry)

    dashboards = lovelace_dashboard.DashboardsCollection(hass)
    await dashboards.async_load()
    try:
        item = await dashboards.async_create_item(
            {
                "title": title,
                "icon": icon,
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
            sidebar_icon=icon,
            config={"mode": MODE_STORAGE},
        )
    except (HomeAssistantError, ValueError):
        _LOGGER.exception("Could not register the dashboard panel")
        return None

    await marker_store.async_save({"handled": True, "url_path": url_path})
    await async_sync_generated_dashboard_metadata(hass)
    _LOGGER.info("Created dashboard at /%s for %s", url_path, entry.title)
    return url_path
