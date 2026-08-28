import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../custom_components/e_c3_dashboard/", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

const frontend = read("static/frontend.js");
const strategy = read("static/e_c3_dashboard.js");
const overview = read("static/vehicle-overview-card.js");
const gps = read("static/gps-history-card.js");
const constants = read("const.py");

test("Home Assistant registers one e-C3 frontend resource", () => {
  assert.match(constants, /FRONTEND_URL = "\/e_c3_dashboard\/frontend\.js"/);
  assert.match(constants, /FRONTEND_VERSION = "0\.5\.42"/);
  assert.match(constants, /FRONTEND_RESOURCE_URLS = \(FRONTEND_URL,\)/);
  assert.match(frontend, /import\("\.\/vehicle-overview-card\.js\?v=0\.5\.42"\)/);
  assert.match(frontend, /import\("\.\/gps-history-card\.js\?v=0\.5\.42"\)/);
  assert.doesNotMatch(frontend, /gps-history-fix\.js/);
  assert.doesNotMatch(frontend, /map-marker-fix\.js/);
});

test("dashboard Strategy registers before any dependency or package-card wait", () => {
  const strategyImport = 'await import("./e_c3_dashboard.js?v=0.5.42");';
  const packageStart = "const packageModules = Promise.allSettled([";
  const dependencyStart = "const dependencyReadiness = Promise.all(REQUIRED_ELEMENTS.map(waitForElement));";

  assert.match(frontend, /customElements\.whenDefined\(tag\)/);
  assert.match(frontend, /DEPENDENCY_GRACE_MS = 10000/);
  assert.ok(frontend.includes(strategyImport));
  assert.ok(frontend.indexOf(strategyImport) < frontend.indexOf(packageStart));
  assert.ok(frontend.indexOf(strategyImport) < frontend.indexOf(dependencyStart));
  assert.match(frontend, /window\.__ec3DashboardDependencyReadiness = dependencyReadiness/);
  assert.doesNotMatch(frontend, /STRATEGY_REGISTRATION_DEADLINE_MS/);
  assert.doesNotMatch(frontend, /readinessGate/);
  assert.doesNotMatch(frontend, /registrationDeadline/);
});

test("LIVE reuses the validated vehicle overview lifecycle instead of owning a second hero", () => {
  assert.match(strategy, /type: "custom:e-c3-dashboard-vehicle-overview-card"/);
  assert.match(strategy, /variant: "live"/);
  assert.match(strategy, /entry_id: attributes\.entry_id/);
  assert.doesNotMatch(strategy, /The LIVE picture is part of the canonical hero configuration/);
  assert.doesNotMatch(strategy, /"background-image": `\[\[\[/);
  assert.match(overview, /config\.variant === "live"/);
  assert.match(overview, /attributes\?\.entity_picture/);
  assert.match(overview, /picture \|\| ""/);
  assert.match(overview, /nextSignature !== this\._signature/);
});

test("GPS components are canonical cards, not Strategy wrappers", () => {
  assert.match(strategy, /custom:e-c3-dashboard-gps-date-card/);
  assert.match(strategy, /custom:e-c3-dashboard-gps-map-card/);
  assert.match(gps, /customElements\.define\(DATE_CARD_TAG/);
  assert.match(gps, /customElements\.define\(MAP_CARD_TAG/);
  assert.doesNotMatch(gps, /Strategy\.generate/);
  assert.doesNotMatch(gps, /originalGenerate/);
  assert.doesNotMatch(gps, /customElements\.define =/);
});

test("only the documented third-party map shadow-DOM compatibility hook remains", () => {
  assert.match(frontend, /--ec3-transparent-picture-marker/);
  assert.match(frontend, /marker\.picture/);
  assert.match(frontend, /Symbol\.for\("e_c3_dashboard\.transparent_picture_marker"\)/);
  assert.doesNotMatch(frontend, /reactive_live_vehicle_picture/);
  assert.doesNotMatch(frontend, /customElements\.define\("ll-strategy-dashboard-e-c3-dashboard"/);
});

test("obsolete post-patch source files are gone", () => {
  assert.equal(fs.existsSync(new URL("static/map-marker-fix.js", root)), false);
  assert.equal(fs.existsSync(new URL("static/gps-history-fix.js", root)), false);
});