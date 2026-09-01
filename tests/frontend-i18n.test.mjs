import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const catalog = read("../custom_components/e_c3_dashboard/static/i18n.js");
const trip = read("../custom_components/e_c3_dashboard/static/trip-history-card.js");
const charge = read("../custom_components/e_c3_dashboard/static/charge-history-card.js");
const vehicle = read("../custom_components/e_c3_dashboard/static/vehicle-overview-card.js");
const strategy = read("../custom_components/e_c3_dashboard/static/e_c3_dashboard.js");

test("frontend catalog exposes core namespaces and the expanded locale resolver", () => {
  for (const namespace of ["tripHistory", "chargeHistory", "vehicleOverview", "dashboard"]) {
    assert.ok(catalog.includes(`${namespace}: {`), `missing ${namespace} namespace`);
  }
  assert.ok(catalog.split("fr: {").length - 1 >= 4, "French catalog entries are incomplete");
  assert.match(catalog, /const SUPPORTED_LANGUAGES = new Set/);
  assert.match(catalog, /normalized\.split\("-"\)\[0\]/);
  assert.match(catalog, /if \(base === "no"\) return "nb"/);
  assert.match(catalog, /fr: "fr-FR"/);
  assert.match(catalog, /nb: "nb-NO"/);
});

test("trip and charge cards use HA locale when language is automatic", () => {
  for (const source of [trip, charge]) {
    assert.match(source, /_i18nContext\(\)/);
    assert.match(source, /return explicit \? \{ language: explicit \} : \(this\._hass \|\| this\._config\)/);
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


test("dashboard strategy uses catalog strings without binary German branches", () => {
  assert.doesNotMatch(strategy, /language\(hass\) === "de"/);
  for (const key of [
    "vehicleMaintenanceData", "maintenance", "brand", "powertrain",
    "chargeLimitEnabled", "serviceBattery", "tripHistoryIntro", "syncServerHistory",
    "privacySharing", "privacyDataSharing", "refreshInterval", "correctBatteryValues",
    "abrpLiveData", "strategyEditorDescription",
  ]) {
    assert.match(strategy, new RegExp(`strings\.${key}`));
  }
  assert.doesNotMatch(strategy, /Zeit unbekannt|seit gerade eben|Verbunden|Getrennt|ABRP Live-Daten/);
});
