import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dashboardSource = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/dashboard.py", import.meta.url),
  "utf8",
);
const initSource = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/__init__.py", import.meta.url),
  "utf8",
);
const sensorSource = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/sensor.py", import.meta.url),
  "utf8",
);
const configFlowSource = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/config_flow.py", import.meta.url),
  "utf8",
);
const constSource = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/const.py", import.meta.url),
  "utf8",
);

test("dashboard title is derived from the upstream Stellantis mobile-app brand", () => {
  assert.match(dashboardSource, /"mycitroen": "Citroën"/);
  assert.match(dashboardSource, /"mypeugeot": "Peugeot"/);
  assert.match(dashboardSource, /"myopel": "Opel"/);
  assert.match(dashboardSource, /"myds": "DS"/);
  assert.match(dashboardSource, /"myvauxhall": "Vauxhall"/);
  assert.match(dashboardSource, /return f"\{brand\} \(\{ordinal\}\)"/);
  assert.match(dashboardSource, /entry\.options\.get\(OPTION_DASHBOARD_NAME/);
});

test("new package dashboard URLs are generic brand paths, not e-C3 paths", () => {
  assert.match(dashboardSource, /return f"\{brand\}-dashboard"/);
  assert.match(dashboardSource, /candidate = f"\{base\}-\{suffix\}"/);
  assert.doesNotMatch(dashboardSource, /url_path = slugify\(f"e-c3-/);
});

test("existing package dashboard URLs remain stable while new installs use brand paths", () => {
  assert.doesNotMatch(dashboardSource, /_async_migrate_generated_dashboard_url/);
  assert.doesNotMatch(dashboardSource, /current_url_path\.startswith\("e-c3-"\)/);
  assert.match(dashboardSource, /if marker\.get\("handled"\):/);
  assert.match(dashboardSource, /url_path = marker\.get\("url_path"\)/);
});

test("actual dashboard path is published for frontend navigation", () => {
  assert.match(initSource, /coordinator\.data\["dashboard_url_path"\] = await async_ensure_dashboard/);
  assert.match(sensorSource, /"dashboard_url_path": self\.coordinator\.data\.get\("dashboard_url_path"\)/);
  assert.match(dashboardSource, /return await _async_matching_strategy_url_path/);
});

test("dashboard display name remains a per-entry option and 0.5.54 cache version", () => {
  assert.match(configFlowSource, /OPTION_DASHBOARD_NAME/);
  assert.match(configFlowSource, /normalized\[OPTION_DASHBOARD_NAME\]/);
  assert.match(constSource, /OPTION_DASHBOARD_NAME = "dashboard_name"/);
  assert.match(constSource, /FRONTEND_VERSION = "0\.5\.54"/);
});


test("dashboard icon follows powertrain without changing brand naming", () => {
  assert.match(dashboardSource, /powertrain in \{POWERTRAIN_ELECTRIC, POWERTRAIN_HYBRID\}/);
  assert.match(dashboardSource, /"mdi:car-electric"/);
  assert.match(dashboardSource, /else "mdi:car"/);
  assert.match(dashboardSource, /\{"title": desired_title, "icon": desired_icon\}/);
});
