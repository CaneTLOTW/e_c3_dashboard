import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  FRONTEND_TEXT,
  languageFor,
  localeFor,
} from "../custom_components/e_c3_dashboard/static/i18n.js";

const root = new URL("../custom_components/e_c3_dashboard/", import.meta.url);
const languages = ["de", "en", "fr", "it", "es", "pt", "nl", "da", "nb", "sv", "fi", "pl", "cs", "sk", "hu", "ro", "sl", "hr"];
const extraLanguages = languages.filter((language) => !["de", "en", "fr"].includes(language));

function keyPaths(value, prefix = "") {
  const result = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) result.push(...keyPaths(child, path));
    else result.push(path);
  }
  return result.sort();
}

test("Home Assistant translations cover the planned 18-language matrix with identical keys", () => {
  const canonical = JSON.parse(fs.readFileSync(new URL("translations/en.json", root), "utf8"));
  const canonicalKeys = keyPaths(canonical);
  for (const language of languages) {
    const path = new URL(`translations/${language}.json`, root);
    assert.equal(fs.existsSync(path), true, `missing translations/${language}.json`);
    const catalog = JSON.parse(fs.readFileSync(path, "utf8"));
    assert.deepEqual(keyPaths(catalog), canonicalKeys, `${language} translation key mismatch`);
  }
});

test("frontend resolver supports every planned locale and normalizes regional variants", () => {
  for (const language of languages) {
    assert.equal(languageFor({ language }), language, `resolver missing ${language}`);
    assert.ok(localeFor({ language }).includes("-"), `locale mapping missing ${language}`);
  }
  assert.equal(languageFor({ language: "fr-FR" }), "fr");
  assert.equal(languageFor({ language: "de-AT" }), "de");
  assert.equal(languageFor({ language: "nb-NO" }), "nb");
  assert.equal(languageFor({ language: "no-NO" }), "nb");
  assert.equal(languageFor({ language: "unsupported-ZZ" }), "en");
  assert.equal(localeFor({ language: "pt-PT" }), "pt-PT");
  assert.equal(localeFor({ language: "cs-CZ" }), "cs-CZ");
  assert.equal(localeFor({ language: "nb-NO" }), "nb-NO");
});

test("all fifteen additional frontend languages expose every user-facing namespace at runtime", () => {
  for (const language of extraLanguages) {
    for (const namespace of ["tripHistory", "chargeHistory", "vehicleOverview", "dashboard"]) {
      const catalog = FRONTEND_TEXT[namespace][language];
      assert.ok(catalog, `${language} missing ${namespace}`);
      assert.deepEqual(
        Object.keys(catalog).sort(),
        Object.keys(FRONTEND_TEXT[namespace].en).sort(),
        `${language}/${namespace} runtime key mismatch`,
      );
    }
  }
});

test("long-label smoke locales are explicitly available", () => {
  for (const language of ["de", "fr", "pl"]) {
    assert.ok(FRONTEND_TEXT.dashboard[language].notificationRecipients.length > 5);
    assert.ok(FRONTEND_TEXT.tripHistory[language].visibleTrips.includes("{visible}"));
  }
});
