import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sensor = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/sensor.py", import.meta.url),
  "utf8",
);

test("vehicle info publishes a stable language-neutral attribute contract", () => {
  for (const key of [
    "brand",
    "powertrain",
    "vin",
    "picture_count",
    "maintenance_days_remaining",
    "maintenance_mileage_remaining_km",
    "maintenance_updated_at",
    "source",
  ]) {
    assert.match(sensor, new RegExp(`"${key}"`));
  }
  assert.match(sensor, /"source": "stellantis_vehicle_maintenance"/);
});

test("0.5.x German aliases remain explicitly compatibility-only", () => {
  assert.match(sensor, /Compatibility aliases from 0\.5\.x/);
  assert.match(sensor, /"Marke": data\["brand"\]/);
  assert.match(sensor, /"Wartung aktualisiert": _relative_age\(updated_at\)/);
});
