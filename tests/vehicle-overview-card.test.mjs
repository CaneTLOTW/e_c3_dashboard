import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/static/vehicle-overview-card.js", import.meta.url),
  "utf8",
);

test("vehicle overview ports the existing button-card layout", () => {
  assert.match(source, /type: "vertical-stack"/);
  assert.match(source, /heading: config\.heading \|\| "Mobilität"/);
  assert.match(source, /type: "custom:button-card"/);
  assert.match(source, /height: "270px"/);
  assert.match(source, /"background-position": "center 54%"/);
  assert.match(source, /top: "115px"/);
  assert.match(source, /width: "220px"/);
  assert.match(source, /kfzBatteryChargePulse/);
  assert.match(source, /kfzBatteryDrivePulse/);
});

test("vehicle overview resolves every household value through the config-entry mapping", () => {
  for (const key of [
    "battery",
    "autonomy",
    "temperature",
    "battery_charging",
    "battery_charging_end",
    "battery_plugged",
    "engine",
    "preconditioning",
    "preconditioning_start",
    "preconditioning_stop",
  ]) {
    assert.match(source, new RegExp(`mapped\\.${key}`));
  }
  assert.match(source, /metricEntity\(hass, attributes, "current_charge_power"\)/);
  assert.match(source, /metricEntity\(hass, attributes, "current_trip_energy"\)/);
  assert.match(source, /attributes\.vehicle_tracker/);
  assert.match(source, /attributes\.vehicle_slug/);
});

test("vehicle overview contains no legacy household route, VIN or fixed vehicle entity", () => {
  assert.doesNotMatch(source, /dashboard-kfz\/ec3/);
  assert.doesNotMatch(source, /VR7CBZYA7TZ814720/i);
  assert.doesNotMatch(source, /AC-ACNT200015617082/i);
  assert.doesNotMatch(source, /sensor\.vr7/i);
  assert.doesNotMatch(source, /binary_sensor\.vr7/i);
  assert.doesNotMatch(source, /button\.vr7/i);
  assert.match(source, /`\/e-c3-\$\{pathSlug\}\/vehicle`/);
});

test("late tracker picture rebuilds the wrapper instead of freezing the URL", () => {
  assert.match(source, /attributes\?\.entity_picture/);
  assert.match(source, /picture \|\| ""/);
  assert.match(source, /nextSignature !== this\._signature/);
  assert.match(source, /this\._rebuild\(\)/);
});
