import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dashboardSource = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/dashboard.py", import.meta.url),
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
  assert.match(dashboardSource, /getattr\(device, "manufacturer"/);
  assert.match(dashboardSource, /return f"\{brand\} \(\{ordinal\}\)"/);
  assert.match(dashboardSource, /entry\.options\.get\(OPTION_DASHBOARD_NAME/);
});

test("brand title update keeps the existing url path and only updates package-owned metadata", () => {
  assert.match(dashboardSource, /marker\.get\("url_path"\)/);
  assert.match(dashboardSource, /async_update_item\(item\["id"\], \{"title": desired_title\}\)/);
  assert.match(dashboardSource, /frontend_url_path=url_path/);
  assert.match(dashboardSource, /update=True/);
  assert.doesNotMatch(dashboardSource, /async_update_item\([^\n]*url_path/);
});

test("dashboard URL migration remains explicitly separate from brand-title work", () => {
  assert.match(dashboardSource, /URL migration is intentionally handled separately/);
  assert.match(dashboardSource, /url_path = slugify\(f"e-c3-\{vehicle_slug\}"/);
});

test("dashboard display name is a per-entry option and 0.5.53 cache version", () => {
  assert.match(configFlowSource, /OPTION_DASHBOARD_NAME/);
  assert.match(configFlowSource, /normalized\[OPTION_DASHBOARD_NAME\]/);
  assert.match(constSource, /OPTION_DASHBOARD_NAME = "dashboard_name"/);
  assert.match(constSource, /FRONTEND_VERSION = "0\.5\.53"/);
});
