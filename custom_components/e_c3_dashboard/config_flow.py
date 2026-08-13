"""Config and options flows for e-C3 Dashboard."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import selector
from homeassistant.util import slugify

from .compatibility import async_check_upstream_compatibility
from .const import (
    CONF_VEHICLE_DEVICE_ID,
    CONF_VEHICLE_SLUG,
    DEFAULT_OPTIONS,
    DOMAIN,
    OPTION_CHARGING,
    OPTION_GPS,
    OPTION_HISTORY_HOURS,
    OPTION_NOTIFICATIONS,
    OPTION_NOTIFICATION_RECIPIENTS,
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

        compatibility = await async_check_upstream_compatibility(self.hass)
        if not compatibility["version_supported"]:
            return self.async_abort(reason="unsupported_upstream_version")

        errors: dict[str, str] = {}
        if user_input is not None:
            device_id = user_input[CONF_VEHICLE_DEVICE_ID]
            if not self._is_upstream_vehicle(device_id):
                errors[CONF_VEHICLE_DEVICE_ID] = "invalid_vehicle"
            elif not self._has_required_upstream_entities(device_id):
                errors[CONF_VEHICLE_DEVICE_ID] = "upstream_not_ready"
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

    def _has_required_upstream_entities(self, device_id: str) -> bool:
        """Require a completed upstream setup, not merely an installed repo."""
        upstream_entry_ids = {
            entry.entry_id
            for entry in self.hass.config_entries.async_entries(UPSTREAM_DOMAIN)
        }
        entity_registry = er.async_get(self.hass)
        entries = [
            registry_entry
            for registry_entry in er.async_entries_for_device(entity_registry, device_id)
            if registry_entry.config_entry_id in upstream_entry_ids
        ]
        keys = {
            registry_entry.translation_key
            for registry_entry in entries
        }
        return (
            {"vehicle", "battery", "mileage"}.issubset(keys)
            and any(entry.entity_id.startswith("device_tracker.") for entry in entries)
        )

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
        # Notify recipients are services, not necessarily registered HA
        # entities. Looking them up through the entity registry caused the
        # options dialog to fail on current Home Assistant versions. Querying
        # the live service registry also keeps this list aligned with mobile
        # app notifications and other configured notify targets.
        notify_services = self.hass.services.async_services().get("notify", {})
        notify_recipients = sorted(
            f"notify.{service_name}"
            for service_name in notify_services
            if service_name not in {"notify", "send_message"}
        )
        recipient_selector = selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=notify_recipients,
                multiple=True,
                mode=selector.SelectSelectorMode.DROPDOWN,
            )
        )
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
                vol.Optional(
                    OPTION_NOTIFICATION_RECIPIENTS,
                    default=[
                        entity_id
                        for entity_id in options[OPTION_NOTIFICATION_RECIPIENTS]
                        if entity_id in notify_recipients
                    ],
                ): recipient_selector,
                vol.Required(
                    OPTION_HISTORY_HOURS,
                    default=options[OPTION_HISTORY_HOURS],
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=24,
                        max=8760,
                        step=24,
                        unit_of_measurement="h",
                        mode=selector.NumberSelectorMode.BOX,
                    )
                ),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
