from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


sensor = "custom_components/e_c3_dashboard/sensor.py"
replace_once(
    sensor,
    '''        return {
            "Marke": info.get("brand") or "—",
            "Antrieb": info.get("motorization") or "—",
            "VIN": info.get("vin") or "—",
            "Bildanzahl": info.get("picture_count", 0),
            "Wartung verbleibende Tage": maintenance.get("days_remaining") or "—",
            "Wartung verbleibende Kilometer": maintenance.get("mileage_remaining_km")
            or "—",
            "Wartung aktualisiert": _relative_age(maintenance.get("updated_at")),
            "Datenquelle": "Stellantis Fahrzeug- und Wartungsdaten",
        }''',
    '''        updated_at = maintenance.get("updated_at")
        data = {
            # Stable, language-neutral attributes for cards, automations and
            # future integrations. Timestamps stay raw so Home Assistant can
            # render them in each user's locale.
            "brand": info.get("brand") or "—",
            "powertrain": info.get("motorization") or "—",
            "vin": info.get("vin") or "—",
            "picture_count": info.get("picture_count", 0),
            "maintenance_days_remaining": maintenance.get("days_remaining") or "—",
            "maintenance_mileage_remaining_km": maintenance.get("mileage_remaining_km")
            or "—",
            "maintenance_updated_at": updated_at,
            "source": "stellantis_vehicle_maintenance",
        }
        # Compatibility aliases from 0.5.x. Keep them for one compatibility
        # cycle so existing templates/automations do not break while bundled
        # UI moves to the neutral contract above.
        data.update(
            {
                "Marke": data["brand"],
                "Antrieb": data["powertrain"],
                "VIN": data["vin"],
                "Bildanzahl": data["picture_count"],
                "Wartung verbleibende Tage": data["maintenance_days_remaining"],
                "Wartung verbleibende Kilometer": data[
                    "maintenance_mileage_remaining_km"
                ],
                "Wartung aktualisiert": _relative_age(updated_at),
                "Datenquelle": "Stellantis Fahrzeug- und Wartungsdaten",
            }
        )
        return data''',
)

strategy = "custom_components/e_c3_dashboard/static/e_c3_dashboard.js"
for old, new in [
    ('attribute: "Wartung verbleibende Tage", name: strings.daysRemaining', 'attribute: "maintenance_days_remaining", name: strings.daysRemaining'),
    ('attribute: "Wartung verbleibende Kilometer", name: strings.mileageRemaining', 'attribute: "maintenance_mileage_remaining_km", name: strings.mileageRemaining'),
    ('attribute: "Wartung aktualisiert", name: strings.updated', 'attribute: "maintenance_updated_at", name: strings.updated, time_format: "relative"'),
    ('attribute: "Marke", name: strings.brand', 'attribute: "brand", name: strings.brand'),
    ('attribute: "Antrieb", name: strings.powertrain', 'attribute: "powertrain", name: strings.powertrain'),
    ('attribute: "VIN", name: "VIN"', 'attribute: "vin", name: "VIN"'),
]:
    replace_once(strategy, old, new)

architecture = "tests/frontend-architecture.test.mjs"
file = Path(architecture)
text = file.read_text()
text += '''\n\ntest("vehicle information popup uses neutral attributes and HA-native relative time", () => {\n  assert.match(strategy, /attribute: "maintenance_days_remaining", name: strings\\.daysRemaining/);\n  assert.match(strategy, /attribute: "maintenance_mileage_remaining_km", name: strings\\.mileageRemaining/);\n  assert.match(strategy, /attribute: "maintenance_updated_at", name: strings\\.updated, time_format: "relative"/);\n  assert.match(strategy, /attribute: "brand", name: strings\\.brand/);\n  assert.match(strategy, /attribute: "powertrain", name: strings\\.powertrain/);\n});\n'''
file.write_text(text)

Path("tests/vehicle-info-contract.test.mjs").write_text('''import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport test from "node:test";\n\nconst sensor = fs.readFileSync(\n  new URL("../custom_components/e_c3_dashboard/sensor.py", import.meta.url),\n  "utf8",\n);\n\ntest("vehicle info publishes a stable language-neutral attribute contract", () => {\n  for (const key of [\n    "brand",\n    "powertrain",\n    "vin",\n    "picture_count",\n    "maintenance_days_remaining",\n    "maintenance_mileage_remaining_km",\n    "maintenance_updated_at",\n    "source",\n  ]) {\n    assert.match(sensor, new RegExp(`"${key}"`));\n  }\n  assert.match(sensor, /"source": "stellantis_vehicle_maintenance"/);\n});\n\ntest("0.5.x German aliases remain explicitly compatibility-only", () => {\n  assert.match(sensor, /Compatibility aliases from 0\\.5\\.x/);\n  assert.match(sensor, /"Marke": data\["brand"\]/);\n  assert.match(sensor, /"Wartung aktualisiert": _relative_age\(updated_at\)/);\n});\n''')

# The runner removes this script and its workflow before committing.
