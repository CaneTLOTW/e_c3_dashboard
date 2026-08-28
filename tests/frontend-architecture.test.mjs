import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../custom_components/e_c3_dashboard/", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

const frontend = read("static/frontend.js");
const strategy = read("static/e_c3_dashboard.js");
const gps = read("static/gps-history-card.js");
const constants = read("const.py");

test("Home Assistant registers one e-C3 frontend resource", () => {
  assert.match(constants, /FRONTEND_URL = "\/e_c3_dashboard\/frontend\.js"/);
  assert.match(constants, /FRONTEND_RESOURCE_URLS = \(FRONTEND_URL,\)/);
  assert.match(frontend, /import\("\.\/vehicle-overview-card\.js\?v=0\.5\.37"\)/);
  assert.match(frontend, /import\("\.\/gps-history-card\.js\?v=0\.5\.37"\)/);
  assert.doesNotMatch(frontend, /gps-history-fix\.js/);
  assert.doesNotMatch(frontend, /map-marker-fix\.js/);
});

test("dependency preflight waits instead of failing on first customElements lookup", () => {
  assert.match(frontend, /customElements\.whenDefined\(tag\)/);
  assert.match(frontend, /DEPENDENCY_GRACE_MS = 10000/);
  assert.match(frontend, /await dependencyReadiness/);
  assert.match(frontend, /await import\("\.\/e_c3_dashboard\.js\?v=0\.5\.37"\)/);
});

test("LIVE hero owns its reactive picture directly", () => {
  assert.match(strategy, /triggers_update: \[tracker\]/);
  assert.match(strategy, /states\[\$\{JSON\.stringify\(tracker\)\}\]\?\.attributes\?\.entity_picture/);
  assert.match(strategy, /"background-image": `\[\[\[/);
  assert.doesNotMatch(strategy, /custom_fields\.vehicle_image/);
  assert.doesNotMatch(strategy, /patchLiveVehiclePicture/);
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
  assert.doesNotMatch(frontend, /ll-strategy-dashboard-e-c3-dashboard/);
});

test("obsolete post-patch source files are gone", () => {
  assert.equal(fs.existsSync(new URL("static/map-marker-fix.js", root)), false);
  assert.equal(fs.existsSync(new URL("static/gps-history-fix.js", root)), false);
});
