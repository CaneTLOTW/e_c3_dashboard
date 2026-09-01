import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const constSource = read("custom_components/e_c3_dashboard/const.py");
const flowSource = read("custom_components/e_c3_dashboard/config_flow.py");
const strings = JSON.parse(read("custom_components/e_c3_dashboard/strings.json"));
const de = JSON.parse(read("custom_components/e_c3_dashboard/translations/de.json"));
const en = JSON.parse(read("custom_components/e_c3_dashboard/translations/en.json"));

test("battery capacity is a stable optional config-entry field", () => {
  assert.match(constSource, /CONF_BATTERY_CAPACITY_KWH = "battery_capacity_kwh"/);
  assert.match(flowSource, /vol\.Optional\(CONF_BATTERY_CAPACITY_KWH\)/);
  assert.match(flowSource, /data\[CONF_BATTERY_CAPACITY_KWH\] = float\(capacity\)/);
});

test("battery capacity can be maintained from options without recreating the entry", () => {
  assert.match(flowSource, /self\.config_entry\.data\.get\(CONF_BATTERY_CAPACITY_KWH\)/);
  assert.match(flowSource, /async_update_entry\(/);
  assert.match(flowSource, /entry_data\.pop\(CONF_BATTERY_CAPACITY_KWH, None\)/);
});

test("battery capacity config labels exist in canonical translations", () => {
  for (const catalog of [strings, de, en]) {
    assert.equal(typeof catalog.config?.step?.user?.data?.battery_capacity_kwh, "string");
    assert.equal(typeof catalog.options?.step?.init?.data?.battery_capacity_kwh, "string");
  }
});

test("English entity translations mirror the canonical entity catalog", () => {
  assert.deepEqual(en.entity, strings.entity);
});
