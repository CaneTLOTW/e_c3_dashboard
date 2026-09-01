import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const flow = read("custom_components/e_c3_dashboard/config_flow.py");
const catalogs = [
  "custom_components/e_c3_dashboard/strings.json",
  "custom_components/e_c3_dashboard/translations/en.json",
  "custom_components/e_c3_dashboard/translations/de.json",
  "custom_components/e_c3_dashboard/translations/fr.json",
].map((path) => JSON.parse(read(path)));

test("fresh vehicle setup has no fixed e-C3 slug default", () => {
  assert.match(flow, /vol\.Optional\(CONF_VEHICLE_SLUG\): str/);
  assert.doesNotMatch(flow, /default="e_c3"/);
  assert.match(flow, /base_slug = slugify\(self\._vehicle_name\(device_id\)\) or "vehicle"/);
  assert.match(flow, /vehicle_slug = self\._available_vehicle_slug\(base_slug\)/);
  assert.doesNotMatch(flow, /or "e-C3"/);
});

test("explicit storage slugs cannot collide across dashboard entries", () => {
  assert.match(flow, /def _slug_in_use\(self, vehicle_slug: str\)/);
  assert.match(flow, /entry\.data\.get\(CONF_VEHICLE_SLUG\) == vehicle_slug/);
  assert.match(flow, /errors\[CONF_VEHICLE_SLUG\] = "slug_in_use"/);
  assert.match(flow, /while self\._slug_in_use\(f"\{base_slug\}_\{suffix\}"\)/);
});

test("slug guidance and collision errors exist in DE EN and FR", () => {
  for (const catalog of catalogs) {
    assert.equal(typeof catalog.config?.step?.user?.data?.vehicle_slug, "string");
    assert.match(catalog.config.step.user.data.vehicle_slug.toLowerCase(), /optional|facultatif/);
    assert.equal(typeof catalog.config?.error?.slug_in_use, "string");
  }
});
