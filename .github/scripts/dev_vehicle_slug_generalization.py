from pathlib import Path
import json


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


flow = "custom_components/e_c3_dashboard/config_flow.py"
replace_once(
    flow,
    '''            else:
                vehicle_slug = slugify(user_input[CONF_VEHICLE_SLUG])
                if not vehicle_slug:
                    errors[CONF_VEHICLE_SLUG] = "invalid_slug"
                else:
                    await self.async_set_unique_id(f"{DOMAIN}_{device_id}")
                    self._abort_if_unique_id_configured()
                    data = {
                        CONF_VEHICLE_DEVICE_ID: device_id,
                        CONF_VEHICLE_SLUG: vehicle_slug,
                    }
                    capacity = user_input.get(CONF_BATTERY_CAPACITY_KWH)
                    if capacity is not None:
                        data[CONF_BATTERY_CAPACITY_KWH] = float(capacity)
                    return self.async_create_entry(
                        title=self._vehicle_name(device_id),
                        data=data,
                    )''',
    '''            else:
                await self.async_set_unique_id(f"{DOMAIN}_{device_id}")
                self._abort_if_unique_id_configured()

                requested_slug = str(
                    user_input.get(CONF_VEHICLE_SLUG, "") or ""
                ).strip()
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
                    data = {
                        CONF_VEHICLE_DEVICE_ID: device_id,
                        CONF_VEHICLE_SLUG: vehicle_slug,
                    }
                    capacity = user_input.get(CONF_BATTERY_CAPACITY_KWH)
                    if capacity is not None:
                        data[CONF_BATTERY_CAPACITY_KWH] = float(capacity)
                    return self.async_create_entry(
                        title=self._vehicle_name(device_id),
                        data=data,
                    )''',
)
replace_once(
    flow,
    '                vol.Required(CONF_VEHICLE_SLUG, default="e_c3"): str,',
    '                vol.Optional(CONF_VEHICLE_SLUG): str,',
)
replace_once(
    flow,
    '''    def _vehicle_name(self, device_id: str) -> str:
        """Return the selected upstream vehicle name for multi-entry fallback."""
        device = dr.async_get(self.hass).async_get(device_id)
        return device.name_by_user or device.name or "e-C3"
''',
    '''    def _slug_in_use(self, vehicle_slug: str) -> bool:
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
''',
)

catalogs = {
    "custom_components/e_c3_dashboard/strings.json": {
        "description": "Choose a vehicle that is already configured by Stellantis Vehicles. The vehicle identifier is optional; when left empty it is derived from the selected vehicle and made unique automatically. Battery capacity is only a per-vehicle fallback when Stellantis does not provide a usable value.",
        "slug": "Vehicle identifier (optional)",
        "slug_in_use": "This vehicle identifier is already used by another dashboard entry.",
    },
    "custom_components/e_c3_dashboard/translations/en.json": {
        "description": "Choose a vehicle that is already configured by Stellantis Vehicles. The vehicle identifier is optional; when left empty it is derived from the selected vehicle and made unique automatically. Battery capacity is only a per-vehicle fallback when Stellantis does not provide a usable value.",
        "slug": "Vehicle identifier (optional)",
        "slug_in_use": "This vehicle identifier is already used by another dashboard entry.",
    },
    "custom_components/e_c3_dashboard/translations/de.json": {
        "description": "Wähle ein Fahrzeug aus, das bereits durch Stellantis Vehicles eingerichtet wurde. Die Fahrzeugkennung ist optional; bleibt sie leer, wird sie automatisch aus dem gewählten Fahrzeug abgeleitet und eindeutig gemacht. Die Batteriekapazität dient nur als fahrzeugbezogener Fallback, wenn Stellantis keinen brauchbaren Wert liefert.",
        "slug": "Fahrzeugkennung (optional)",
        "slug_in_use": "Diese Fahrzeugkennung wird bereits von einem anderen Dashboard-Eintrag verwendet.",
    },
    "custom_components/e_c3_dashboard/translations/fr.json": {
        "description": "Choisissez un véhicule déjà configuré par Stellantis Vehicles. L’identifiant du véhicule est facultatif ; s’il reste vide, il est dérivé automatiquement du véhicule sélectionné et rendu unique. La capacité de batterie n’est qu’une valeur de secours propre au véhicule si Stellantis ne fournit pas de valeur exploitable.",
        "slug": "Identifiant du véhicule (facultatif)",
        "slug_in_use": "Cet identifiant de véhicule est déjà utilisé par une autre entrée de tableau de bord.",
    },
}

for path, values in catalogs.items():
    file = Path(path)
    data = json.loads(file.read_text())
    user = data["config"]["step"]["user"]
    user["description"] = values["description"]
    user["data"]["vehicle_slug"] = values["slug"]
    data["config"]["error"]["slug_in_use"] = values["slug_in_use"]
    file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

Path("tests/config-flow-vehicle-slug.test.mjs").write_text('''import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport test from "node:test";\n\nconst read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");\nconst flow = read("custom_components/e_c3_dashboard/config_flow.py");\nconst catalogs = [\n  "custom_components/e_c3_dashboard/strings.json",\n  "custom_components/e_c3_dashboard/translations/en.json",\n  "custom_components/e_c3_dashboard/translations/de.json",\n  "custom_components/e_c3_dashboard/translations/fr.json",\n].map((path) => JSON.parse(read(path)));\n\ntest("fresh vehicle setup has no fixed e-C3 slug default", () => {\n  assert.match(flow, /vol\\.Optional\\(CONF_VEHICLE_SLUG\\): str/);\n  assert.doesNotMatch(flow, /default="e_c3"/);\n  assert.match(flow, /base_slug = slugify\\(self\\._vehicle_name\\(device_id\\)\\) or "vehicle"/);\n  assert.match(flow, /vehicle_slug = self\\._available_vehicle_slug\\(base_slug\\)/);\n  assert.doesNotMatch(flow, /or "e-C3"/);\n});\n\ntest("explicit storage slugs cannot collide across dashboard entries", () => {\n  assert.match(flow, /def _slug_in_use\\(self, vehicle_slug: str\\)/);\n  assert.match(flow, /entry\\.data\\.get\\(CONF_VEHICLE_SLUG\\) == vehicle_slug/);\n  assert.match(flow, /errors\\[CONF_VEHICLE_SLUG\\] = "slug_in_use"/);\n  assert.match(flow, /while self\\._slug_in_use\\(f"\\{base_slug\\}_\\{suffix\\}"\\)/);\n});\n\ntest("slug guidance and collision errors exist in DE EN and FR", () => {\n  for (const catalog of catalogs) {\n    assert.equal(typeof catalog.config?.step?.user?.data?.vehicle_slug, "string");\n    assert.match(catalog.config.step.user.data.vehicle_slug.toLowerCase(), /optional|facultatif/);\n    assert.equal(typeof catalog.config?.error?.slug_in_use, "string");\n  }\n});\n''')
