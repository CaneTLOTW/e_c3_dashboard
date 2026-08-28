import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../custom_components/e_c3_dashboard/static/", import.meta.url);
const overview = fs.readFileSync(new URL("vehicle-overview-card.js", root), "utf8");
const strategy = fs.readFileSync(new URL("e_c3_dashboard.js", root), "utf8");

test("live hero range and temperature badges use native HA more-info", () => {
  assert.ok(overview.includes("entity: autonomy,"));
  assert.ok(overview.includes("entity: temperature,"));
  assert.ok(overview.includes('tap_action: { action: "more-info" }'));
  assert.ok(overview.includes("Math.round(Number(entity.state)) + ' km'"));
  assert.ok(overview.includes("entity.attributes?.unit_of_measurement || '°C'"));
});

test("hero preconditioning uses mapped button entities with HA perform-action", () => {
  assert.ok(overview.includes('perform_action: "button.press"'));
  assert.ok(overview.includes("target: { entity_id: preconditioningStart }"));
  assert.ok(overview.includes("target: { entity_id: preconditioningStop }"));
  assert.ok(!overview.includes("service_data: { entity_id: preconditioningStart }"));
});

test("vehicle information popup leads with maintenance and contains public vehicle fields", () => {
  const popup = strategy.indexOf('hash: "#e-c3-vehicle-info"');
  const maintenance = strategy.indexOf('? "Wartung" : "Maintenance"', popup);
  const vehicle = strategy.indexOf('? "Fahrzeug" : "Vehicle"', popup);
  assert.ok(popup >= 0);
  assert.ok(maintenance > popup);
  assert.ok(vehicle > maintenance);
  for (const attribute of ["Marke", "Antrieb", "VIN", "Bildanzahl", "Datenquelle"]) {
    assert.ok(strategy.indexOf(`attribute: "${attribute}"`, vehicle) > vehicle);
  }
  assert.ok(!strategy.includes('metric("vehicle_info") ? bubble("vehicle_info"'));
});

test("settings and ABRP are owned by the system view, not the vehicle overview", () => {
  assert.ok(!strategy.includes('separator(strings.settings, "mdi:cog-outline")'));
  const system = strategy.indexOf('path: "system"');
  const settings = strategy.indexOf("heading: strings.settings", system);
  const abrp = strategy.indexOf('heading: "ABRP"', system);
  assert.ok(system >= 0);
  assert.ok(settings > system);
  assert.ok(abrp > settings);
  for (const entityKey of ["refresh_interval", "battery_values_correction", "abrp_sync", "abrp_token"]) {
    assert.ok(strategy.indexOf(`entity("${entityKey}")`, system) > system);
  }
});
