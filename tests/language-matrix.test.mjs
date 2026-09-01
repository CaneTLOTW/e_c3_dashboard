import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

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

function readExtra(path) {
  const source = fs.readFileSync(new URL(path, root), "utf8");
  const sandbox = { catalog: null };
  vm.runInNewContext(source.replace("export const EXTRA_FRONTEND_TEXT =", "catalog ="), sandbox);
  return sandbox.catalog;
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

test("frontend resolver contains every planned locale and normalizes regional variants", () => {
  const source = fs.readFileSync(new URL("static/i18n.js", root), "utf8");
  for (const language of languages) assert.ok(source.includes(`"${language}"`), `resolver missing ${language}`);
  assert.match(source, /normalized\.split\("-"\)\[0\]/);
  assert.match(source, /if \(base === "no"\) return "nb"/);
  assert.match(source, /pt: "pt-PT"/);
  assert.match(source, /cs: "cs-CZ"/);
  assert.match(source, /nb: "nb-NO"/);
  assert.match(source, /return SUPPORTED_LANGUAGES\.has\(requested\) \? requested : "en"/);
});

test("all fifteen additional frontend languages provide every user-facing namespace", () => {
  const catalogs = Object.assign({}, readExtra("static/i18n-extra-west.js"), readExtra("static/i18n-extra-north.js"), readExtra("static/i18n-extra-east.js"));
  for (const language of extraLanguages) {
    assert.ok(catalogs[language], `missing frontend language ${language}`);
    for (const namespace of ["tripHistory", "chargeHistory", "vehicleOverview", "dashboard"]) {
      assert.ok(catalogs[language][namespace], `${language} missing ${namespace}`);
      assert.ok(Object.keys(catalogs[language][namespace]).length >= 5, `${language}/${namespace} is unexpectedly sparse`);
    }
  }
});

test("long-label smoke locales are explicitly available", () => {
  const source = fs.readFileSync(new URL("static/i18n.js", root), "utf8");
  for (const language of ["de", "fr", "pl"]) assert.ok(source.includes(`"${language}"`));
  const polish = readExtra("static/i18n-extra-north.js").pl;
  assert.ok(polish.dashboard.notificationRecipients.length > 5);
  assert.ok(polish.tripHistory.visibleTrips.includes("{visible}"));
});
