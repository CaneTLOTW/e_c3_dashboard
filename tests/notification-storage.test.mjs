import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/notifications.py", import.meta.url),
  "utf8",
);

test("notification Store keeps the compatible v1 major schema", () => {
  assert.match(source, /_STORE_VERSION = 1/);
  assert.match(source, /settings = self\.data\.setdefault\("settings", \{\}\)/);
  assert.match(source, /for key, default in SETTING_DEFAULTS\.items\(\):/);
  assert.match(source, /settings\.setdefault\(key, default\)/);
});
