import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../custom_components/e_c3_dashboard/static/gps-history-core.js", import.meta.url),
  "utf8",
);
const {
  dateWindow,
  filterGeoJsonByWindow,
  localDateKey,
  normalizeDateKey,
  shiftDateKey,
} = await import(`data:text/javascript,${encodeURIComponent(source)}`);

const trip = (id, start, end) => ({
  type: "Feature",
  geometry: { type: "LineString", coordinates: [[8.5, 51.2], [8.6, 51.3]] },
  properties: { trip_id: id, start_time: start, end_time: end },
});
const iso = (timestamp) => new Date(timestamp).toISOString();

const fixedNow = new Date(2026, 7, 28, 12, 0, 0);

test("normalizes and shifts local date keys without moving into the future", () => {
  assert.equal(localDateKey(fixedNow), "2026-08-28");
  assert.equal(normalizeDateKey("invalid", fixedNow), "2026-08-28");
  assert.equal(normalizeDateKey("2026-08-29", fixedNow), "2026-08-28");
  assert.equal(shiftDateKey("2026-08-28", -1, fixedNow), "2026-08-27");
  assert.equal(shiftDateKey("2026-08-28", 1, fixedNow), "2026-08-28");
});

test("today uses now as the display end while past days use next midnight", () => {
  const today = dateWindow("2026-08-28", fixedNow);
  assert.equal(today.isToday, true);
  assert.equal(today.historyEnd, "now");
  assert.equal(today.endMs, fixedNow.getTime());

  const past = dateWindow("2026-08-27", fixedNow);
  assert.equal(past.isToday, false);
  assert.equal(past.endMs - past.startMs, 24 * 60 * 60 * 1000);
});

test("filters canonical server features to the selected local day", () => {
  const window = dateWindow("2026-08-27", fixedNow);
  const geojson = {
    type: "FeatureCollection",
    features: [
      trip("old", iso(window.startMs - 60 * 60 * 1000), iso(window.startMs - 30 * 60 * 1000)),
      trip("selected", iso(window.startMs + 60 * 60 * 1000), iso(window.startMs + 90 * 60 * 1000)),
      trip("crossing", iso(window.endMs - 5 * 60 * 1000), iso(window.endMs + 5 * 60 * 1000)),
      trip("future", iso(window.endMs + 60 * 60 * 1000), iso(window.endMs + 90 * 60 * 1000)),
    ],
  };

  const filtered = filterGeoJsonByWindow(geojson, window);
  assert.deepEqual(
    filtered.features.map((feature) => feature.properties.trip_id),
    ["selected", "crossing"],
  );
  assert.equal(geojson.features.length, 4, "source archive must remain untouched");
});

test("drops features without timestamps instead of leaking archive data", () => {
  const window = dateWindow("2026-08-27", fixedNow);
  const filtered = filterGeoJsonByWindow(
    {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: null, properties: {} }],
    },
    window,
  );
  assert.deepEqual(filtered.features, []);
});
