import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const identity = read("custom_components/e_c3_dashboard/entity_identity.py");
const init = read("custom_components/e_c3_dashboard/__init__.py");
const sensor = read("custom_components/e_c3_dashboard/sensor.py");
const number = read("custom_components/e_c3_dashboard/number.py");
const time = read("custom_components/e_c3_dashboard/time.py");
const button = read("custom_components/e_c3_dashboard/button.py");
const sw = read("custom_components/e_c3_dashboard/switch.py");
const metrics = read("custom_components/e_c3_dashboard/metrics.py");
const configFlow = read("custom_components/e_c3_dashboard/config_flow.py");

test("package-owned entities use VIN plus a language-neutral technical key", () => {
  assert.match(identity, /return f"\{prefix\}_\{technical_key\}"/);
  assert.match(identity, /identifier\[0\] == UPSTREAM_DOMAIN/);
  assert.match(identity, /new_unique_id=desired_unique_id/);
  assert.match(identity, /new_entity_id=desired_entity_id/);
  assert.match(init, /async_migrate_package_entity_ids\(hass, entry\)/);

  for (const source of [sensor, number, time, button, sw]) {
    assert.match(source, /apply_vehicle_entity_identity\(/);
  }
  assert.doesNotMatch(sensor, /_attr_unique_id = f"\{entry\.entry_id\}_/);
  assert.doesNotMatch(number, /_attr_unique_id = f"\{entry\.entry_id\}_/);
  assert.doesNotMatch(time, /_attr_unique_id = f"\{entry\.entry_id\}_/);
  assert.doesNotMatch(button, /_attr_unique_id = f"\{entry\.entry_id\}_/);
  assert.doesNotMatch(sw, /_attr_unique_id = f"\{entry\.entry_id\}_/);
});

test("battery capacity is a per-vehicle config fallback and not an e-C3 constant", () => {
  assert.match(configFlow, /CONF_BATTERY_CAPACITY_KWH/);
  assert.match(metrics, /last_valid_battery_capacity_kwh/);
  assert.match(metrics, /return round\(current, 3\), "api"/);
  assert.match(metrics, /return round\(stored, 3\), "last_api"/);
  assert.match(metrics, /self\.entry\.data\.get\(CONF_BATTERY_CAPACITY_KWH\)/);
  assert.match(metrics, /return round\(configured, 3\), "configured"/);
  assert.match(metrics, /return None, None/);
  assert.doesNotMatch(metrics, /43\.4/);
  assert.doesNotMatch(metrics, /FALLBACK_CAPACITY/);
});

test("unknown capacity suppresses SOC-derived energy instead of inventing a value", () => {
  assert.match(metrics, /if capacity is not None and start_soc is not None and end_soc is not None/);
  assert.match(metrics, /if start_soc is None or current_soc is None or capacity is None:/);
  assert.match(metrics, /energy_kwh = None/);
  assert.match(metrics, /capacity_source/);
});
