import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  FRONTEND_TEXT,
  languageFor,
  localeFor,
} from "../custom_components/e_c3_dashboard/static/i18n.js";
import { EXTRA_FRONTEND_TEXT as WESTERN_TEXT } from "../custom_components/e_c3_dashboard/static/i18n-extra-west.js";
import { EXTRA_FRONTEND_TEXT as NORTHERN_TEXT } from "../custom_components/e_c3_dashboard/static/i18n-extra-north.js";
import { EXTRA_FRONTEND_TEXT as EASTERN_TEXT } from "../custom_components/e_c3_dashboard/static/i18n-extra-east.js";
import { ADVANCED_FRONTEND_TEXT as WESTERN_ADVANCED } from "../custom_components/e_c3_dashboard/static/i18n-advanced-west.js";
import { ADVANCED_FRONTEND_TEXT as NORTHERN_ADVANCED } from "../custom_components/e_c3_dashboard/static/i18n-advanced-north.js";
import { ADVANCED_FRONTEND_TEXT as EASTERN_ADVANCED } from "../custom_components/e_c3_dashboard/static/i18n-advanced-east.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const runtimeSource = read("../custom_components/e_c3_dashboard/static/i18n.js");
const trip = read("../custom_components/e_c3_dashboard/static/trip-history-card.js");
const charge = read("../custom_components/e_c3_dashboard/static/charge-history-card.js");
const vehicle = read("../custom_components/e_c3_dashboard/static/vehicle-overview-card.js");
const strategy = read("../custom_components/e_c3_dashboard/static/e_c3_dashboard.js");

const LANGUAGES = [
  "de", "en", "fr", "it", "es", "pt", "nl", "da", "nb", "sv", "fi", "pl", "cs", "sk", "hu", "ro", "sl", "hr",
];
const EXTRA_LANGUAGES = LANGUAGES.filter((language) => !["de", "en", "fr"].includes(language));
const NAMESPACES = ["tripHistory", "chargeHistory", "vehicleOverview", "dashboard"];
const CAPABILITY_EXCEPTIONS = {
  vehicleOverview: new Set(["fuel"]),
  dashboard: new Set(["fuel", "fuelRange", "fuelConsumption"]),
};
const baseCatalogs = Object.assign({}, WESTERN_TEXT, NORTHERN_TEXT, EASTERN_TEXT);
const advancedCatalogs = Object.assign({}, WESTERN_ADVANCED, NORTHERN_ADVANCED, EASTERN_ADVANCED);

function placeholders(value) {
  return [...String(value).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();
}

function canonicalKeys(namespace) {
  return Object.keys(FRONTEND_TEXT[namespace].en).sort();
}

test("runtime wires all advanced catalogs with the release cache key", () => {
  for (const region of ["west", "north", "east"]) {
    assert.match(runtimeSource, new RegExp(`i18n-advanced-${region}\\.js\\?v=0\\.5\\.54`));
  }
  assert.match(runtimeSource, /i18n-core\.js\?v=0\.5\.54/);
});

test("locale resolver accepts regional variants and safe fallbacks", () => {
  assert.equal(languageFor({ language: "fr-FR" }), "fr");
  assert.equal(languageFor({ language: "de-AT" }), "de");
  assert.equal(languageFor({ language: "nb-NO" }), "nb");
  assert.equal(languageFor({ language: "no-NO" }), "nb");
  assert.equal(languageFor({ language: "xx-YY" }), "en");
  assert.equal(localeFor({ language: "fr-FR" }), "fr-FR");
  assert.equal(localeFor({ language: "nb-NO" }), "nb-NO");
});

test("all 18 runtime catalogs have exact EN key parity, non-empty values and placeholder parity", () => {
  for (const namespace of NAMESPACES) {
    const english = FRONTEND_TEXT[namespace].en;
    const keys = canonicalKeys(namespace);
    for (const language of LANGUAGES) {
      const translated = FRONTEND_TEXT[namespace][language];
      assert.ok(translated, `missing ${language}/${namespace}`);
      assert.deepEqual(Object.keys(translated).sort(), keys, `key mismatch ${language}/${namespace}`);
      for (const key of keys) {
        assert.equal(typeof translated[key], "string", `non-string ${language}/${namespace}.${key}`);
        assert.ok(translated[key].trim(), `empty ${language}/${namespace}.${key}`);
        assert.deepEqual(
          placeholders(translated[key]),
          placeholders(english[key]),
          `placeholder mismatch ${language}/${namespace}.${key}`,
        );
      }
    }
  }
});

test("15 extra languages explicitly provide every ordinary EN key before runtime fallback", () => {
  for (const language of EXTRA_LANGUAGES) {
    for (const namespace of NAMESPACES) {
      const provided = {
        ...(baseCatalogs[language]?.[namespace] || {}),
        ...(advancedCatalogs[language]?.[namespace] || {}),
      };
      const exceptions = CAPABILITY_EXCEPTIONS[namespace] || new Set();
      const required = canonicalKeys(namespace).filter((key) => !exceptions.has(key));
      assert.deepEqual(Object.keys(provided).sort(), required.sort(), `source coverage mismatch ${language}/${namespace}`);
      for (const key of required) {
        assert.ok(String(provided[key]).trim(), `empty source ${language}/${namespace}.${key}`);
      }
    }
  }
});

test("capability labels remain centrally injected for every language", () => {
  for (const language of LANGUAGES) {
    assert.ok(FRONTEND_TEXT.vehicleOverview[language].fuel?.trim(), `missing ${language} vehicleOverview.fuel`);
    for (const key of ["fuel", "fuelRange", "fuelConsumption"]) {
      assert.ok(FRONTEND_TEXT.dashboard[language][key]?.trim(), `missing ${language} dashboard.${key}`);
    }
  }
});

test("long-label smoke coverage remains present for DE, FR and PL", () => {
  for (const language of ["de", "fr", "pl"]) {
    for (const [namespace, key] of [
      ["dashboard", "longTermStatistics"],
      ["dashboard", "notificationSettings"],
      ["dashboard", "vehicleMaintenanceData"],
      ["vehicleOverview", "cardDescription"],
    ]) {
      assert.ok(FRONTEND_TEXT[namespace][language][key]?.trim(), `missing long-label smoke key ${language}/${namespace}.${key}`);
    }
  }
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
    assert.match(strategy, new RegExp(`strings\\.${key}`));
  }
  assert.doesNotMatch(strategy, /Zeit unbekannt|seit gerade eben|Verbunden|Getrennt|ABRP Live-Daten/);
});
