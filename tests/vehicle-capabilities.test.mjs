import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const strategy = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/static/e_c3_dashboard.js", import.meta.url), "utf8");
const hero = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/static/vehicle-overview-card.js", import.meta.url), "utf8");
const coordinator = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/coordinator.py", import.meta.url), "utf8");
const configFlow = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/config_flow.py", import.meta.url), "utf8");
const metrics = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/metrics.py", import.meta.url), "utf8");

test("backend publishes powertrain capability contract without requiring a battery", () => {
  assert.match(coordinator, /_REQUIRED_ENTITY_KEYS = \{"vehicle", "mileage"\}/);
  assert.match(coordinator, /"powertrain": powertrain/);
  assert.match(coordinator, /"capabilities": capabilities/);
});

test("config flow only prompts for traction capacity on capable vehicles", () => {
  assert.match(configFlow, /needs_capacity = capabilities\.get\("battery_capacity", False\)/);
  assert.match(configFlow, /if capabilities\.get\("battery_capacity", False\):/);
  assert.doesNotMatch(configFlow, /\{"vehicle", "battery", "mileage"\}\.issubset/);
});

test("thermic dashboard hides electric sections and exposes fuel cards", () => {
  assert.match(strategy, /supportsCharging \? separator\(strings\.chargingRange/);
  assert.match(strategy, /supportsFuel \? bubble\("fuel"/);
  assert.match(strategy, /supportsFuel \? bubble\("fuel_autonomy"/);
  assert.match(strategy, /modules\.charging && supportsChargeHistory/);
  assert.match(strategy, /supportsCharging \? controlSwitch\("charge_reports"/);
});

test("shared hero supports either traction battery or fuel level", () => {
  assert.match(hero, /const primaryLevel = supportsElectric && battery \? battery : supportsFuel \? fuel/);
  assert.match(hero, /entity: primaryLevel/);
  assert.match(hero, /return \${literal\(strings\.fuel \|\| "Fuel"\)}/);
});

test("electric metrics are disabled by capability, not by guessed model", () => {
  assert.match(metrics, /capabilities\.get\("electric_trip_metrics"/);
  assert.match(metrics, /capabilities\.get\("battery_capacity"/);
  assert.match(metrics, /capabilities\.get\("charge_history"/);
});
