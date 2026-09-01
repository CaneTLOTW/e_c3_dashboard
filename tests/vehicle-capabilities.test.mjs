import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const strategy = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/static/e_c3_dashboard.js", import.meta.url), "utf8");
const hero = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/static/vehicle-overview-card.js", import.meta.url), "utf8");
const tripHistory = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/static/trip-history-card.js", import.meta.url), "utf8");
const coordinator = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/coordinator.py", import.meta.url), "utf8");
const configFlow = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/config_flow.py", import.meta.url), "utf8");
const metrics = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/metrics.py", import.meta.url), "utf8");
const sensorPlatform = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/sensor.py", import.meta.url), "utf8");
const numberPlatform = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/number.py", import.meta.url), "utf8");
const switchPlatform = fs.readFileSync(new URL("../custom_components/e_c3_dashboard/switch.py", import.meta.url), "utf8");

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
  assert.match(strategy, /supportsElectric && entity\("battery_values_correction"\)/);
});

test("thermic notification UI omits electric SOC and charge-specific settings", () => {
  assert.match(strategy, /supportsElectric \? \["home_soc_warning"/);
  assert.match(strategy, /supportsElectric \? \["home_soc_reset"/);
  assert.match(strategy, /supportsElectric \? \["home_delay_minutes"/);
  assert.match(strategy, /supportsCharging \? \["charge_start_delay_minutes"/);
  assert.match(strategy, /supportsCharging \? controlSwitch\("wakeup_charging"/);
});

test("trip history only renders electric energy columns when actual energy exists", () => {
  assert.match(strategy, /energy_entities: supportsElectric \? \[lastTripResult\]\.filter\(Boolean\) : \[\]/);
  assert.match(tripHistory, /const hasEnergy = trips\.some\(\(trip\) => trip\.attributes\?\.energy_kwh !== undefined\)/);
  assert.match(tripHistory, /hasEnergy \? html`<th>\$\{text\.energy\}<\/th><th>\$\{text\.consumption\}<\/th>` : nothing/);
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

test("package-owned entity platforms only load powertrain-relevant entities", () => {
  assert.match(sensorPlatform, /Ec3ServerTripHistorySensor\(coordinator, entry\)/);
  assert.match(sensorPlatform, /Ec3ServerGpsHistorySensor\(coordinator, entry\)/);
  assert.match(sensorPlatform, /Ec3VehicleInfoSensor\(coordinator, entry\)/);
  assert.match(sensorPlatform, /Ec3LastTripResultSensor\(coordinator, entry\)/);
  assert.match(sensorPlatform, /if electric:/);
  assert.match(sensorPlatform, /Ec3TrailingConsumptionSensor/);
  assert.match(sensorPlatform, /Ec3CurrentTripEnergySensor/);
  assert.match(sensorPlatform, /if charge_history:/);
  assert.match(sensorPlatform, /Ec3ServerChargeHistorySensor/);
  assert.match(sensorPlatform, /Ec3DistanceSinceChargeSensor/);
  assert.match(sensorPlatform, /Ec3LastChargeResultSensor/);
  assert.match(sensorPlatform, /if charging:/);
  assert.match(sensorPlatform, /Ec3CurrentChargePowerSensor/);

  assert.match(numberPlatform, /"service_battery_warning"/);
  assert.match(numberPlatform, /"stale_home_hours"/);
  assert.match(numberPlatform, /if electric:/);
  assert.match(numberPlatform, /"home_soc_warning"/);
  assert.match(numberPlatform, /if charging:/);
  assert.match(numberPlatform, /"charge_start_delay_minutes"/);

  assert.match(switchPlatform, /SWITCH_TRIP_REPORTS/);
  assert.match(switchPlatform, /SWITCH_WAKEUP_PROBE/);
  assert.match(switchPlatform, /if capabilities\.get\("charging", False\):/);
  assert.match(switchPlatform, /SWITCH_CHARGE_REPORTS/);
  assert.match(switchPlatform, /SWITCH_WAKEUP_CHARGING/);
});
