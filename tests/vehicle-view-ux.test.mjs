import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../custom_components/e_c3_dashboard/static/", import.meta.url);
const overview = fs.readFileSync(new URL("vehicle-overview-card.js", root), "utf8");
const strategy = fs.readFileSync(new URL("e_c3_dashboard.js", root), "utf8");

test("live hero range and temperature badges open native HA more-info", () => {
  assert.match(overview, /entity: autonomy,[\s\S]*?tap_action: \{ action: "more-info" \}/);
  assert.match(overview, /entity: temperature,[\s\S]*?tap_action: \{ action: "more-info" \}/);
  assert.match(overview, /state_display: `\[\[\[[\s\S]*?Math\.round\(Number\(entity\.state\)\) \+ ' km'/);
  assert.match(overview, /return entity\.state \+ ' ' \+ \(entity\.attributes\?\.unit_of_measurement \|\| '°C'\)/);
});

test("hero preconditioning uses mapped button entities with HA perform-action", () => {
  assert.match(overview, /perform_action: "button\.press",\s*target: \{ entity_id: preconditioningStart \}/);
  assert.match(overview, /perform_action: "button\.press",\s*target: \{ entity_id: preconditioningStop \}/);
  assert.doesNotMatch(overview, /service_data: \{ entity_id: preconditioningStart \}/);
});

test("vehicle information popup leads with maintenance and contains the full public vehicle metric", () => {
  const popup = strategy.indexOf('hash: "#e-c3-vehicle-info"');
  const maintenance = strategy.indexOf('title: language(hass) === "de" ? "Wartung" : "Maintenance"', popup);
  const vehicle = strategy.indexOf('title: language(hass) === "de" ? "Fahrzeug" : "Vehicle"', popup);
  assert.ok(popup >= 0 && maintenance > popup && vehicle > maintenance);
  for (const attribute of ["Marke", "Antrieb", "VIN", "Bildanzahl", "Datenquelle"]) {
    assert.ok(strategy.indexOf(`attribute: "${attribute}"`, vehicle) > vehicle);
  }
  assert.doesNotMatch(strategy, /metric\("vehicle_info"\) \? bubble\("vehicle_info"/);
});

test("settings and ABRP are owned by the system view, not the vehicle overview", () => {
  assert.doesNotMatch(strategy, /separator\(strings\.settings, "mdi:cog-outline"\)/);
  const system = strategy.indexOf('path: "system"');
  assert.ok(system >= 0);
  const settings = strategy.indexOf('heading: strings.settings', system);
  const abrp = strategy.indexOf('heading: "ABRP"', system);
  assert.ok(settings > system);
  assert.ok(abrp > settings);
  for (const entityKey of ["refresh_interval", "battery_values_correction", "abrp_sync", "abrp_token"]) {
    assert.ok(strategy.indexOf(`entity("${entityKey}")`, system) > system);
  }
});
