import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/static/vehicle-overview-card.js", import.meta.url),
  "utf8",
);

test("overview card is config-entry mapped and reactive", () => {
  assert.match(source, /integration_domain === STATUS_DOMAIN/);
  assert.match(source, /typeof attributes\.entity_mapping === "object"/);
  assert.match(source, /attributes\.vehicle_tracker/);
  assert.match(source, /tracker\?\.attributes\?\.entity_picture/);
  assert.match(source, /controls\.manual_wakeup \|\| mapped\.wakeup/);
  assert.match(source, /mapped\.preconditioning_start/);
  assert.match(source, /custom:e-c3-dashboard-vehicle-overview-card|e-c3-dashboard-vehicle-overview-card/);
});

test("overview card has no household or VIN hardcoding", () => {
  assert.doesNotMatch(source, /dashboard-kfz/);
  assert.doesNotMatch(source, /VR7[A-Z0-9]{10,}/);
  assert.doesNotMatch(source, /device_tracker\.vr7/i);
  assert.match(source, /`\/e-c3-\$\{slug\}\/vehicle`/);
});

test("overview card actions do not also navigate", () => {
  const stopPropagationCount = (source.match(/event\.stopPropagation\(\)/g) || []).length;
  assert.ok(stopPropagationCount >= 2);
  assert.match(source, /button", "press"/);
});
