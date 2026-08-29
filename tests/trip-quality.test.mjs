import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/server_history.py", import.meta.url),
  "utf8",
);
const sensors = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/sensor.py", import.meta.url),
  "utf8",
);
const tripCard = fs.readFileSync(
  new URL("../custom_components/e_c3_dashboard/static/trip-history-card.js", import.meta.url),
  "utf8",
);

test("trip normalization refuses impossible distance/time speed fallbacks", () => {
  assert.match(source, /fallback_speed_valid/);
  assert.match(source, /derived_speed_outlier/);
  assert.match(source, /valid_for_statistics = False/);
  assert.match(source, /zero_start_odometer_sentinel/);
});

test("trailing consumption uses canonical validated trips", () => {
  const metrics = fs.readFileSync(
    new URL("../custom_components/e_c3_dashboard/metrics.py", import.meta.url),
    "utf8",
  );
  assert.match(metrics, /reversed\(self\.canonical_trips\(\)\)/);
  assert.match(metrics, /valid_for_statistics.*is False/);
});

test("packed trip attributes preserve quality metadata for the frontend", () => {
  assert.match(sensors, /"valid_for_statistics",\s*\n\s*"quality_flags",\s*\n\s*"speed_source"/);
  assert.match(sensors, /"canonical server trip history"/);
});

test("implausible server rows stay visible as diagnostics but suppress fake values", () => {
  assert.match(tripCard, /_isInvalidTrip\(trip\)/);
  assert.match(tripCard, /if \(this\._isInvalidTrip\(trip\)\) return "—"/);
  assert.match(tripCard, /invalid \? "—" : this\._value\(trip\.attributes\?\.energy_per_100_km\)/);
  assert.match(tripCard, /text\.invalidServerTrip/);
});
