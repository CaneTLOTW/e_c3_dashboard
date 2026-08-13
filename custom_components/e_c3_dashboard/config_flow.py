"""Config and options flows for e-C3 Dashboard."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import selector
from homeassistant.util import slugify

from .const import (
    CONF_VEHICLE_DEVICE_ID,
    CONF_VEHICLE_SLUG,
    DEFAULT_OPTIONS,
    DOMAIN,
    OPTION_CHARGING,
    OPTION_GPS,
    OPTION_NOTIFICATIONS,
    OPTION_TRIPS,
    OPTION_WAKEUP,
    UPSTREAM_DOMAIN,
)


class Ec3DashboardConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Set up a dashboard entry for exactly one upstream vehicle."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Select a Stellantis device and a local, stable slug."""
        if not self.hass.config_entries.async_entries(UPSTREAM_DOMAIN):
            return self.async_abort(reason="missing_upstream")

        errors: dict[str, str] = {}
        if user_input is not None:
            device_id = user_input[CONF_VEHICLE_DEVICE_ID]
            if not self._is_upstream_vehicle(device_id):
                errors[CONF_VEHICLE_DEVICE_ID] = "invalid_vehicle"
            else:
                vehicle_slug = slugify(user_input[CONF_VEHICLE_SLUG])
                if not vehicle_slug:
                    errors[CONF_VEHICLE_SLUG] = "invalid_slug"
                else:
                    await self.async_set_unique_id(f"{DOMAIN}_{device_id}")
                    self._abort_if_unique_id_configured()
                    return self.async_create_entry(
                        title=self._vehicle_name(device_id),
                        data={
                            CONF_VEHICLE_DEVICE_ID: device_id,
                            CONF_VEHICLE_SLUG: vehicle_slug,
                        },
                    )

        schema = vol.Schema(
            {
                vol.Required(CONF_VEHICLE_DEVICE_ID): selector.DeviceSelector(
                    selector.DeviceSelectorConfig(integration=UPSTREAM_DOMAIN)
                ),
                vol.Required(CONF_VEHICLE_SLUG, default="e_c3"): str,
            }
        )
        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
        )

    def _is_upstream_vehicle(self, device_id: str) -> bool:
        """Require a selected device from an installed upstream config entry."""
        device = dr.async_get(self.hass).async_get(device_id)
        if device is None:
            return False
        upstream_entry_ids = {
            entry.entry_id
            for entry in self.hass.config_entries.async_entries(UPSTREAM_DOMAIN)
        }
        return bool(set(device.config_entries) & upstream_entry_ids)

    def _vehicle_name(self, device_id: str) -> str:
        """Return the user-friendly selected vehicle name."""
        device = dr.async_get(self.hass).async_get(device_id)
        return device.name_by_user or device.name or "e-C3"


    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Expose user-configurable dashboard modules."""
        return Ec3DashboardOptionsFlow()


class Ec3DashboardOptionsFlow(config_entries.OptionsFlow):
    """Enable optional generated views without changing vehicle identity."""

    async def async_step_init(self, user_input=None):
        """Configure portable modules."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        options = dict(DEFAULT_OPTIONS)
        options.update(self.config_entry.options)
        schema = vol.Schema(
            {
                vol.Required(OPTION_TRIPS, default=options[OPTION_TRIPS]): bool,
                vol.Required(
                    OPTION_CHARGING, default=options[OPTION_CHARGING]
                ): bool,
                vol.Required(OPTION_GPS, default=options[OPTION_GPS]): bool,
                vol.Required(OPTION_WAKEUP, default=options[OPTION_WAKEUP]): bool,
                vol.Required(
                    OPTION_NOTIFICATIONS,
                    default=options[OPTION_NOTIFICATIONS],
                ): bool,
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)

