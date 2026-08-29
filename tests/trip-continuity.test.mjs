import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = path.join(root, "custom_components", "e_c3_dashboard", "trip_repair.py");

function runPython(body) {
  return execFileSync("python", ["-c", body, helper], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

test("zero-start Stellantis trip is repaired from local odometer continuity", () => {
  const output = runPython(String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("trip_repair", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
trips = [
  {"id":"prev","start_time":"2026-08-25T12:30:00+00:00","end_time":"2026-08-25T13:00:00+00:00","duration_seconds":1800,"distance_km":41.0,"start_mileage":1000.0,"end_mileage":1041.0,"valid_for_statistics":True,"quality_flags":[]},
  {"id":"bad","start_time":"2026-08-25T13:14:00+00:00","end_time":"2026-08-25T13:23:00+00:00","duration_seconds":540,"distance_km":1048.0,"start_mileage":0.0,"end_mileage":1048.0,"energy_kwh":1.05,"raw_average_speed_kmh":None,"valid_for_statistics":False,"quality_flags":["distance_outlier","derived_speed_outlier","zero_start_odometer_sentinel"],"raw_server":{"distance":1048.0,"startMileage":0.0}},
  {"id":"next","start_time":"2026-08-25T14:00:00+00:00","end_time":"2026-08-25T14:20:00+00:00","duration_seconds":1200,"distance_km":12.0,"start_mileage":1048.0,"end_mileage":1060.0,"valid_for_statistics":True,"quality_flags":[]},
]
local = [{"start_time":"2026-08-25T13:14:05+00:00","end_time":"2026-08-25T13:23:02+00:00","start_mileage":1041.0,"end_mileage":1048.0,"distance_km":7.0}]
out = mod.repair_trip_odometer_continuity(trips, local)
row = next(item for item in out if item["id"] == "bad")
print(json.dumps(row, sort_keys=True))
`);
  const row = JSON.parse(output);
  assert.equal(row.start_mileage, 1041);
  assert.equal(row.end_mileage, 1048);
  assert.equal(row.distance_km, 7);
  assert.equal(row.average_speed, 46.7);
  assert.equal(row.energy_per_100_km, 15);
  assert.equal(row.valid_for_statistics, true);
  assert.equal(row.repair_metadata.source, "local_trip_match");
  assert.equal(row.source_distance_km, 1048);
  assert.equal(row.raw_server.distance, 1048);
  assert.equal(row.raw_server.startMileage, 0);
  assert.ok(row.quality_flags.includes("odometer_continuity_repaired"));
});

test("repair falls back to next server start but refuses unsupported regression", () => {
  const output = runPython(String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("trip_repair", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
repairable = [
  {"id":"prev","start_time":"2026-08-25T10:00:00+00:00","distance_km":10,"start_mileage":1031,"end_mileage":1041,"valid_for_statistics":True,"quality_flags":[]},
  {"id":"bad","start_time":"2026-08-25T11:00:00+00:00","duration_seconds":600,"distance_km":1048,"start_mileage":0,"end_mileage":1048,"valid_for_statistics":False,"quality_flags":["distance_outlier","zero_start_odometer_sentinel"]},
  {"id":"next","start_time":"2026-08-25T12:00:00+00:00","distance_km":5,"start_mileage":1048,"end_mileage":1053,"valid_for_statistics":True,"quality_flags":[]},
]
unsupported = [
  {"id":"prev","start_time":"2026-08-25T10:00:00+00:00","distance_km":10,"start_mileage":1031,"end_mileage":1041,"valid_for_statistics":True,"quality_flags":[]},
  {"id":"bad","start_time":"2026-08-25T11:00:00+00:00","duration_seconds":600,"distance_km":5,"start_mileage":1000,"end_mileage":1005,"valid_for_statistics":False,"quality_flags":["odometer_distance_mismatch"]},
  {"id":"next","start_time":"2026-08-25T12:00:00+00:00","distance_km":5,"start_mileage":1006,"end_mileage":1011,"valid_for_statistics":False,"quality_flags":["odometer_distance_mismatch"]},
]
r1 = mod.repair_trip_odometer_continuity(repairable, [])[1]
r2 = mod.repair_trip_odometer_continuity(unsupported, [])[1]
print(json.dumps({"r1":r1,"r2":r2}, sort_keys=True))
`);
  const { r1, r2 } = JSON.parse(output);
  assert.equal(r1.distance_km, 7);
  assert.equal(r1.repair_metadata.source, "next_server_start");
  assert.equal(r1.valid_for_statistics, true);
  assert.equal(r2.distance_km, 5);
  assert.equal(r2.start_mileage, 1000);
  assert.equal(r2.repair_metadata, undefined);
});

test("continuity repair is idempotent on the canonical copy", () => {
  const output = runPython(String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("trip_repair", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
rows = [
  {"id":"prev","start_time":"2026-08-25T10:00:00+00:00","distance_km":10,"start_mileage":1031,"end_mileage":1041,"valid_for_statistics":True,"quality_flags":[]},
  {"id":"bad","start_time":"2026-08-25T11:00:00+00:00","duration_seconds":600,"distance_km":1048,"start_mileage":0,"end_mileage":1048,"valid_for_statistics":False,"quality_flags":["distance_outlier","zero_start_odometer_sentinel"]},
  {"id":"next","start_time":"2026-08-25T12:00:00+00:00","distance_km":5,"start_mileage":1048,"end_mileage":1053,"valid_for_statistics":True,"quality_flags":[]},
]
first = mod.repair_trip_odometer_continuity(rows, [])
encoded_first = json.dumps(first, sort_keys=True)
second = mod.repair_trip_odometer_continuity(first, [])
print(json.dumps({"same": encoded_first == json.dumps(second, sort_keys=True)}))
`);
  assert.deepEqual(JSON.parse(output), { same: true });
});
