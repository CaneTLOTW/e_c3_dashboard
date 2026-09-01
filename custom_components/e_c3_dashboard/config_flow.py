"""Config and options flows for e-C3 Dashboard."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.const import UnitOfEnergy
from homeassistant.core import callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import selector
from homeassistant.util import slugify

from .capabilities import capability_map, mapping_from_registry_entries, powertrain_from_mapping
from .compatibility import async_check_upstream_compatibility
from .const import (
    CONF_BATTERY_CAPACITY_KWH,
    CONF_VEHICLE_DEVICE_ID,
    CONF_VEHICLE_SLUG,
    DEFAULT_OPTIONS,
    DOMAIN,
    OPTION_CHARGING,
    OPTION_DASHBOARD_NAME,
    OPTION_GPS,
    OPTION_HISTORY_HOURS,
    OPTION_NOTIFICATIONS,
    OPTION_NOTIFICATION_RECIPIENTS,
    OPTION_TRIPS,
    OPTION_WAKEUP,
    REQUIRED_DASHBOARD_CARDS,
    UPSTREAM_DOMAIN,
)


def _upstream_vehicle_entries(hass, device_id: str):
    upstream_entry_ids = {
        entry.entry_id
        for entry in hass.config_entries.async_entries(UPSTREAM_DOMAIN)
    }
    entity_registry = er.async_get(hass)
    return [
        registry_entry
        for registry_entry in er.async_entries_for_device(entity_registry, device_id)
        if registry_entry.config_entry_id in upstream_entry_ids
    ]


def _vehicle_capabilities_for_device(hass, device_id: str) -> dict[str, bool]:
    mapping = mapping_from_registry_entries(_upstream_vehicle_entries(hass, device_id))
    powertrain = powertrain_from_mapping(hass, mapping)
    return capability_map(powertrain, mapping)


def _battery_capacity_selector() -> selector.NumberSelector:
    """Return the per-vehicle manual battery-capacity fallback selector."""
    return selector.NumberSelector(
        selector.NumberSelectorConfig(
            min=1,
            max=250,
            step=0.1,
            unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
            mode=selector.NumberSelectorMode.BOX,
        )
    )


class Ec3DashboardConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Set up a dashboard entry for exactly one upstream vehicle."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Select one vehicle; request traction capacity only when relevant."""
        if not self.context.get("dashboard_card_preflight_seen"):
            return await self.async_step_dashboard_cards()

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
                await self.async_set_unique_id(f"{DOMAIN}_{device_id}")
                self._abort_if_unique_id_configured()

                requested_slug = str(user_input.get(CONF_VEHICLE_SLUG, "") or "").strip()
                if requested_slug:
                    vehicle_slug = slugify(requested_slug)
                    if not vehicle_slug:
                        errors[CONF_VEHICLE_SLUG] = "invalid_slug"
                    elif self._slug_in_use(vehicle_slug):
                        errors[CONF_VEHICLE_SLUG] = "slug_in_use"
                else:
                    base_slug = slugify(self._vehicle_name(device_id)) or "vehicle"
                    vehicle_slug = self._available_vehicle_slug(base_slug)

                if CONF_VEHICLE_SLUG not in errors:
                    capabilities = _vehicle_capabilities_for_device(self.hass, device_id)
                    needs_capacity = capabilities.get("battery_capacity", False)
                    if needs_capacity and self.context.get("capacity_prompt_for") != device_id:
                        self.context["capacity_prompt_for"] = device_id
                        self.context["capacity_prompt_slug"] = vehicle_slug
                    else:
                        data = {
                            CONF_VEHICLE_DEVICE_ID: device_id,
                            CONF_VEHICLE_SLUG: vehicle_slug,
                        }
                        if needs_capacity:
                            capacity = user_input.get(CONF_BATTERY_CAPACITY_KWH)
                            if capacity is not None:
                                data[CONF_BATTERY_CAPACITY_KWH] = float(capacity)
                        return self.async_create_entry(
                            title=self._vehicle_name(device_id),
                            data=data,
                        )

        prompt_device = self.context.get("capacity_prompt_for")
        fields = {}
        if prompt_device:
            fields[vol.Required(CONF_VEHICLE_DEVICE_ID, default=prompt_device)] = selector.DeviceSelector(
                selector.DeviceSelectorConfig(integration=UPSTREAM_DOMAIN)
            )
            fields[vol.Optional(
                CONF_VEHICLE_SLUG,
                default=self.context.get("capacity_prompt_slug", ""),
            )] = str
            fields[vol.Optional(CONF_BATTERY_CAPACITY_KWH)] = _battery_capacity_selector()
        else:
            fields[vol.Required(CONF_VEHICLE_DEVICE_ID)] = selector.DeviceSelector(
                selector.DeviceSelectorConfig(integration=UPSTREAM_DOMAIN)
            )
            fields[vol.Optional(CONF_VEHICLE_SLUG)] = str

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(fields),
            errors=errors,
        )

    async def async_step_dashboard_cards(self, user_input=None):
        """Show a best-effort Lovelace-resource preflight before setup."""
        if user_input is not None:
            self.context["dashboard_card_preflight_seen"] = True
            return await self.async_step_user()

        status = self._dashboard_card_resource_status()
        if status is None:
            card_status = "—"
        else:
            card_status = "\n".join(
                f"{'✓' if installed else '✗'} {name}"
                for name, installed in status
            )

        return self.async_show_form(
            step_id="dashboard_cards",
            data_schema=vol.Schema(
                {
                    vol.Required("dashboard_cards_confirmed", default=False): bool,
                }
            ),
            description_placeholders={"card_status": card_status},
        )

    def _dashboard_card_resource_status(self) -> list[tuple[str, bool]] | None:
        """Return resource-registry matches for required dashboard cards."""
        lovelace = self.hass.data.get(LOVELACE_DATA)
        resources = getattr(lovelace, "resources", None)
        if resources is None or not getattr(resources, "loaded", False):
            return None

        resource_urls = {
            item.get("url", "").split("?", 1)[0].lower()
            for item in resources.async_items()
            if (item.get("type") or item.get("res_type")) == "module"
        }
        return [
            (name, any(resource_hint in url for url in resource_urls))
            for name, _element, resource_hint in REQUIRED_DASHBOARD_CARDS
        ]

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
        """Require universal vehicle basics; battery is capability-specific."""
        entries = _upstream_vehicle_entries(self.hass, device_id)
        keys = {registry_entry.translation_key for registry_entry in entries}
        return (
            {"vehicle", "mileage"}.issubset(keys)
            and any(entry.entity_id.startswith("device_tracker.") for entry in entries)
        )

    def _slug_in_use(self, vehicle_slug: str) -> bool:
        """Return whether another dashboard entry already owns this storage slug."""
        return any(
            entry.data.get(CONF_VEHICLE_SLUG) == vehicle_slug
            for entry in self.hass.config_entries.async_entries(DOMAIN)
        )

    def _available_vehicle_slug(self, base_slug: str) -> str:
        """Return a deterministic free slug for an automatically named vehicle."""
        if not self._slug_in_use(base_slug):
            return base_slug
        suffix = 2
        while self._slug_in_use(f"{base_slug}_{suffix}"):
            suffix += 1
        return f"{base_slug}_{suffix}"

    def _vehicle_name(self, device_id: str) -> str:
        """Return the selected upstream vehicle name for multi-entry fallback."""
        device = dr.async_get(self.hass).async_get(device_id)
        return device.name_by_user or device.name or "Stellantis vehicle"

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Expose user-configurable dashboard modules."""
        return Ec3DashboardOptionsFlow()


class Ec3DashboardOptionsFlow(config_entries.OptionsFlow):
    """Configure one vehicle dashboard without changing its identity."""

    async def async_step_init(self, user_input=None):
        """Configure title, capacity fallback and portable modules."""
        if user_input is not None:
            normalized = dict(user_input)
            normalized[OPTION_DASHBOARD_NAME] = str(
                normalized.get(OPTION_DASHBOARD_NAME, "")
            ).strip()

            # Battery capacity is vehicle setup data, not a runtime module
            # toggle. Keep one canonical value in ConfigEntry.data while still
            # allowing an existing entry to maintain or clear it from Options.
            capacity = normalized.pop(CONF_BATTERY_CAPACITY_KWH, None)
            entry_data = dict(self.config_entry.data)
            if capacity is None:
                entry_data.pop(CONF_BATTERY_CAPACITY_KWH, None)
            else:
                entry_data[CONF_BATTERY_CAPACITY_KWH] = float(capacity)
            if entry_data != dict(self.config_entry.data):
                self.hass.config_entries.async_update_entry(
                    self.config_entry,
                    data=entry_data,
                )

            return self.async_create_entry(title="", data=normalized)

        options = dict(DEFAULT_OPTIONS)
        options.update(self.config_entry.options)
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

        current_capacity = self.config_entry.data.get(CONF_BATTERY_CAPACITY_KWH)
        capacity_key = (
            vol.Optional(CONF_BATTERY_CAPACITY_KWH, default=float(current_capacity))
            if current_capacity is not None
            else vol.Optional(CONF_BATTERY_CAPACITY_KWH)
        )
        fields = {
            vol.Optional(
                OPTION_DASHBOARD_NAME,
                default=options[OPTION_DASHBOARD_NAME],
            ): str,
        }
        capabilities = _vehicle_capabilities_for_device(
            self.hass, self.config_entry.data[CONF_VEHICLE_DEVICE_ID]
        )
        if capabilities.get("battery_capacity", False):
            fields[capacity_key] = _battery_capacity_selector()
        fields.update(
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
        schema = vol.Schema(fields)
        return self.async_show_form(step_id="init", data_schema=schema)
