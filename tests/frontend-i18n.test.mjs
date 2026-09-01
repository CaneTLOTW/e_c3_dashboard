import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const catalog = read("../custom_components/e_c3_dashboard/static/i18n.js");
const trip = read("../custom_components/e_c3_dashboard/static/trip-history-card.js");
const charge = read("../custom_components/e_c3_dashboard/static/charge-history-card.js");
const vehicle = read("../custom_components/e_c3_dashboard/static/vehicle-overview-card.js");

test("frontend catalog exposes German English and French namespaces", () => {
  for (const namespace of ["tripHistory", "chargeHistory", "vehicleOverview", "dashboard"]) {
    assert.ok(catalog.includes(`${namespace}: {`), `missing ${namespace} namespace`);
  }
  assert.ok(catalog.split("fr: {").length - 1 >= 4, "French catalog entries are incomplete");
  assert.match(catalog, /requested\.startsWith\("fr"\)/);
  assert.match(catalog, /if \(language === "fr"\) return "fr-FR"/);
});

test("trip and charge cards use HA locale when language is automatic", () => {
  for (const source of [trip, charge]) {
    assert.match(source, /_i18nContext\(\)/);
    assert.match(source, /\["de", "en", "fr"\]\.includes\(explicit\)/);
    assert.match(source, /this\._hass \|\| this\._config/);
    assert.doesNotMatch(source, /const de =|\$\{de \?/);
  }
});

test("localized custom cards consume catalog keys instead of hard-coded German UI text", () => {
  assert.match(trip, /text\.compactFilterNote/);
  assert.match(trip, /text\.visibleTrips/);
  assert.match(charge, /text\.batteryEnergy/);
  assert.match(charge, /text\.reconstructedHint/);
  assert.match(vehicle, /textFor\(hass, "vehicleOverview"\)/);
  assert.doesNotMatch(vehicle, /Wird geladen|In Fahrt|mehrere Fahrzeuge gefunden|Fahrzeug auswählen/);
});
