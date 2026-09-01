import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../custom_components/e_c3_dashboard/", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

const frontend = read("static/frontend.js");
const strategy = read("static/e_c3_dashboard.js");
const overview = read("static/vehicle-overview-card.js");
const gps = read("static/gps-history-card.js");
const i18n = read("static/i18n.js");
const constants = read("const.py");
const init = read("__init__.py");
const switches = read("switch.py");
const buttons = read("button.py");
const numbers = read("number.py");
const times = read("time.py");

test("Home Assistant registers one e-C3 frontend resource", () => {
  assert.match(constants, /FRONTEND_URL = "\/e_c3_dashboard\/frontend\.js"/);
  assert.match(constants, /FRONTEND_VERSION = "0\.5\.53"/);
  assert.match(constants, /FRONTEND_RESOURCE_URLS = \(FRONTEND_URL,\)/);
  assert.match(frontend, /import\("\.\/vehicle-overview-card\.js\?v=0\.5\.53"\)/);
  assert.match(frontend, /import\("\.\/gps-history-card\.js\?v=0\.5\.53"\)/);
  assert.match(frontend, /import\("\.\/e_c3_dashboard\.js\?v=0\.5\.53"\)/);
  assert.doesNotMatch(frontend, /gps-history-fix\.js/);
  assert.doesNotMatch(frontend, /map-marker-fix\.js/);
});

test("dependency preflight waits instead of failing on first customElements lookup", () => {
  assert.match(frontend, /customElements\.whenDefined\(tag\)/);
  assert.match(frontend, /DEPENDENCY_GRACE_MS = 10000/);
  assert.match(frontend, /await dependencyReadiness/);
  assert.match(frontend, /await import\("\.\/e_c3_dashboard\.js\?v=0\.5\.53"\)/);
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

test("vehicle information popup puts maintenance before vehicle data", () => {
  const maintenance = strategy.indexOf("title: strings.maintenance");
  const vehicle = strategy.indexOf("title: strings.vehicle");
  assert.ok(maintenance >= 0);
  assert.ok(vehicle > maintenance);
  assert.doesNotMatch(strategy, /metric\("vehicle_info"\) \? bubble\("vehicle_info"/);
});

test("vehicle overview keeps only useful vehicle metrics and moves privacy to system", () => {
  const overviewStart = strategy.indexOf("const overviewSections = [");
  const vehicleEnd = strategy.indexOf("const views = [{", overviewStart);
  const vehicleBlock = strategy.slice(overviewStart, vehicleEnd);
  assert.doesNotMatch(vehicleBlock, /entity\("daylight"\)/);
  assert.doesNotMatch(vehicleBlock, /entity\("alarm"\)/);
  assert.doesNotMatch(vehicleBlock, /separator\(strings\.vehicleDetails/);
  assert.doesNotMatch(vehicleBlock, /entity\("privacy"\)/);
  const usage = vehicleBlock.indexOf('separator(strings.consumptionUsage');
  const mileage = vehicleBlock.indexOf('entity("mileage")', usage);
  const trailing = vehicleBlock.indexOf('metric("trailing_consumption_500km")', usage);
  assert.ok(usage >= 0 && mileage > usage && trailing > mileage);
  const systemStart = strategy.indexOf('path: "system"');
  assert.ok(systemStart > vehicleEnd);
  assert.ok(strategy.indexOf('entity("privacy")', systemStart) > systemStart);
  assert.match(strategy, /separator\(strings\.privacySharing/);
});

test("battery health pairs high-voltage and 12-V values at half width", () => {
  assert.match(strategy, /bubble\("battery_capacity", strings\.highVoltageBattery, "mdi:car-battery", \[\], 6\)/);
  assert.match(strategy, /serviceBatteryEntity \? bubble\("service_battery"[^\n]+\[\], 6, serviceBatteryEntity\)/);
  const liveStart = strategy.indexOf('separator(strings.live');
  const usageStart = strategy.indexOf('separator(strings.consumptionUsage');
  assert.doesNotMatch(strategy.slice(liveStart, usageStart), /service_battery/);
});

test("latest charge uses canonical result when available and renders relative age", () => {
  assert.match(strategy, /const lastChargeResult = metric\("last_charge_result"\)/);
  assert.match(strategy, /const lastChargeDisplayEntity = lastChargeResult \|\| nativeLastCharge/);
  assert.match(strategy, /a\.end_time \?\? a\.window_end \?\? a\.stoppedAt/);
  assert.match(strategy, /styles: relativeEventStyles/);
});

test("settings and ABRP remain in the system view, not the vehicle overview", () => {
  const vehicleEnd = strategy.indexOf('const views = [{');
  const systemStart = strategy.indexOf('path: "system"');
  const settings = strategy.indexOf('separator(strings.settings, "mdi:cog-outline")');
  const abrp = strategy.indexOf('entity("abrp_sync") ? separator("ABRP"');
  assert.ok(vehicleEnd >= 0);
  assert.ok(systemStart > vehicleEnd);
  assert.ok(settings > systemStart);
  assert.ok(abrp > systemStart);
  assert.ok(settings < abrp);
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

test("GPS uses the native HA period selector and bypasses the broken ha-map-card bridge", () => {
  assert.match(gps, /type: "energy-date-selection"/);
  assert.match(gps, /collection_key: this\._collectionKey/);
  assert.match(gps, /disable_compare: true/);
  assert.match(gps, /config\.history_date_selection = false/);
  assert.match(gps, /filterGeoJsonByWindow/);
  assert.match(gps, /earliestGeoJsonTime/);
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

test("notification controls publish after forwarded platforms without blocking bootstrap and render readably", () => {
  const platforms = init.indexOf("await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)");
  const refreshed = init.indexOf("await notifications.async_refresh_entities()", platforms);
  const delayed = init.indexOf("async_call_later(hass, 1, _refresh_control_mapping)", refreshed);
  assert.ok(platforms >= 0 && refreshed > platforms && delayed > refreshed);
  assert.doesNotMatch(init, /await hass\.async_block_till_done\(\)/);
  assert.match(init, /hass\.async_create_task\(server_history\.async_initialize\(\)\)/);
  assert.match(init, /Store\(hass, 1, f"\{DOMAIN\}_\{slug\}_notifications"\)\.async_remove\(\)/);
  for (const key of [
    "range_warning_km", "range_reset_km", "home_soc_warning", "home_soc_reset",
    "service_battery_warning", "service_battery_reset", "home_delay_minutes",
    "stale_home_hours", "stale_away_hours", "probe_wait_minutes",
    "charge_start_delay_minutes", "quiet_start", "quiet_end",
  ]) {
    assert.match(strategy, new RegExp(`\\["${key}", strings\\.`));
  }
  assert.match(strategy, /notificationWarningThresholds/);
  assert.match(strategy, /notificationTimingAvailability/);
  assert.match(strategy, /notificationQuietHours/);
  assert.match(strategy, /lastNotificationType/);
  assert.match(strategy, /heartbeatSource/);
  assert.match(strategy, /manageRecipients/);
  assert.match(strategy, /navigation_path: `\/config\/integrations\/integration\/\$\{STATUS_DOMAIN\}`/);
  assert.match(strategy, /controlSwitch\("alerts"[^\n]+"full"\)/);
  assert.match(strategy, /controlSwitch\("trip_reports"[^\n]+"full"\)/);
  assert.match(strategy, /controlSwitch\("charge_reports"[^\n]+"full"\)/);
  assert.doesNotMatch(strategy, /\{\{ state_attr\('\$\{statusEntity\}', 'notification_diagnostics'\) \}\}/);
});

test("dashboard translations contain every explicit notification and wake-up card label", () => {
  for (const [key, de, en] of [
    ["vehicleAlerts", "Fahrzeugwarnungen", "Vehicle alerts"],
    ["tripReports", "Fahrtberichte", "Trip reports"],
    ["chargeReports", "Ladeberichte", "Charge reports"],
    ["hourlyWakeup", "Stündlicher Wake-up", "Hourly wake-up"],
    ["availabilityProbe", "Erreichbarkeitsprobe mit Wake-up", "Availability wake-up probe"],
    ["chargeWakeup", "Wake-up beim Laden", "Wake-up while charging"],
    ["testNotification", "Testbenachrichtigung", "Test notification"],
  ]) {
    assert.match(i18n, new RegExp(`${key}: "${de.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(i18n, new RegExp(`${key}: "${en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
});

test("package-owned controls keep translation-backed entity names", () => {
  for (const source of [switches, buttons, numbers, times]) {
    assert.match(source, /_attr_has_entity_name = True/);
    assert.doesNotMatch(source, /_attr_has_entity_name = False/);
  }
});

test("wake-up action stays a real button press, shows command status, and views keep Vehicle left / Help right", () => {
  assert.match(strategy, /const wakeupStatusEntity = entity\("command_status"\) \|\| control\("manual_wakeup"\)/);
  assert.match(strategy, /entity: wakeupStatusEntity/);
  assert.match(strategy, /perform_action: "button\.press"/);
  assert.match(strategy, /target: \{ entity_id: control\("manual_wakeup"\) \}/);
  assert.match(strategy, /const viewOrder = \["vehicle", "charging", "statistics", "trips", "gps", "wakeup", "notifications", "system", "help"\]/);
  assert.match(strategy, /const mappedEntityCount = Object\.keys\(mapped\)\.length/);
  assert.match(strategy, /target\.innerText='\$\{mappedEntityCount\}'/);
});
