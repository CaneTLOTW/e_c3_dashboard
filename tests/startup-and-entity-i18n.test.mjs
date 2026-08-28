import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const initSource = read("custom_components/e_c3_dashboard/__init__.py");
const numberSource = read("custom_components/e_c3_dashboard/number.py");
const timeSource = read("custom_components/e_c3_dashboard/time.py");
const switchSource = read("custom_components/e_c3_dashboard/switch.py");
const buttonSource = read("custom_components/e_c3_dashboard/button.py");
const strings = JSON.parse(read("custom_components/e_c3_dashboard/strings.json"));
const de = JSON.parse(read("custom_components/e_c3_dashboard/translations/de.json"));

test("config-entry setup never globally drains Home Assistant tasks", () => {
  assert.doesNotMatch(initSource, /await hass\.async_block_till_done\(\)/);
  assert.match(initSource, /hass\.async_create_task\(server_history\.async_initialize\(\)\)/);
  assert.match(initSource, /async_call_later\(hass, 1, _refresh_control_mapping\)/);
});

test("notification controls use Home Assistant entity translation keys", () => {
  assert.match(numberSource, /self\._attr_translation_key = key/);
  assert.match(timeSource, /self\._attr_translation_key = key/);
  assert.match(switchSource, /self\._attr_translation_key = "notify_recipient" if recipient else key/);
  assert.match(buttonSource, /self\._attr_translation_key = key/);
});

test("German notification control translations are complete", () => {
  const required = {
    number: [
      "range_warning_km", "range_reset_km", "home_soc_warning", "home_soc_reset",
      "home_delay_minutes", "service_battery_warning", "service_battery_reset",
      "stale_home_hours", "stale_away_hours", "probe_wait_minutes",
      "charge_start_delay_minutes",
    ],
    time: ["quiet_start", "quiet_end"],
    switch: [
      "notifications", "trip_reports", "charge_reports", "alerts", "wakeup_hourly",
      "wakeup_charging", "wakeup_probe", "notify_recipient",
    ],
    button: ["manual_wakeup", "test_notification", "sync_server_history"],
  };

  for (const [domain, keys] of Object.entries(required)) {
    for (const key of keys) {
      assert.equal(typeof strings.entity?.[domain]?.[key]?.name, "string", `missing English ${domain}.${key}`);
      assert.equal(typeof de.entity?.[domain]?.[key]?.name, "string", `missing German ${domain}.${key}`);
    }
  }

  assert.equal(de.entity.number.range_warning_km.name, "Reichweitenwarnung");
  assert.equal(de.entity.time.quiet_start.name, "Ruhezeit Beginn");
  assert.equal(de.entity.switch.notifications.name, "Benachrichtigungen");
  assert.equal(de.entity.button.test_notification.name, "Testbenachrichtigung");
});
