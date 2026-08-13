"""Compatibility checks for the required Stellantis Vehicles integration."""

from __future__ import annotations

from typing import Any

from awesomeversion import AwesomeVersion, AwesomeVersionCompareException
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import MIN_UPSTREAM_VERSION, UPSTREAM_DOMAIN


async def async_check_upstream_compatibility(
    hass: HomeAssistant,
) -> dict[str, Any]:
    """Return a versioned, display-safe compatibility result.

    This performs no vehicle API requests. It only reads the locally loaded
    upstream integration manifest and is safe to run during setup and reload.
    """
    try:
        integration = await async_get_integration(hass, UPSTREAM_DOMAIN)
    except Exception:  # The config flow renders the translated failure state.
        return {
            "installed": False,
            "version": None,
            "minimum_version": MIN_UPSTREAM_VERSION,
            "version_supported": False,
            "reason": "missing",
        }

    version = integration.manifest.get("version")
    if not isinstance(version, str) or not version:
        return {
            "installed": True,
            "version": version,
            "minimum_version": MIN_UPSTREAM_VERSION,
            "version_supported": False,
            "reason": "unknown_version",
        }

    try:
        supported = AwesomeVersion(version) >= AwesomeVersion(MIN_UPSTREAM_VERSION)
    except AwesomeVersionCompareException:
        supported = False

    return {
        "installed": True,
        "version": version,
        "minimum_version": MIN_UPSTREAM_VERSION,
        "version_supported": supported,
        "reason": "supported" if supported else "version_too_old",
    }
