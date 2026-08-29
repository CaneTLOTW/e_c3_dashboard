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

test("an invalid row never becomes the continuity anchor for later repairs", () => {
  const output = runPython(String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("trip_repair", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
rows = [
  {"id":"invalid-first","start_time":"2026-08-25T09:00:00+00:00","duration_seconds":600,"distance_km":5000,"start_mileage":0,"end_mileage":5000,"valid_for_statistics":False,"quality_flags":["distance_outlier","zero_start_odometer_sentinel"]},
  {"id":"anchor","start_time":"2026-08-25T10:00:00+00:00","duration_seconds":600,"distance_km":10,"start_mileage":1000,"end_mileage":1010,"valid_for_statistics":True,"quality_flags":[]},
  {"id":"bad","start_time":"2026-08-25T11:00:00+00:00","end_time":"2026-08-25T11:09:00+00:00","duration_seconds":540,"distance_km":1017,"start_mileage":0,"end_mileage":1017,"energy_kwh":1.0,"valid_for_statistics":False,"quality_flags":["distance_outlier","derived_speed_outlier","zero_start_odometer_sentinel"]},
  {"id":"next","start_time":"2026-08-25T12:00:00+00:00","duration_seconds":600,"distance_km":3,"start_mileage":1017,"end_mileage":1020,"valid_for_statistics":True,"quality_flags":[]},
]
local = [{"start_time":"2026-08-25T11:00:05+00:00","end_time":"2026-08-25T11:09:05+00:00","start_mileage":1010,"end_mileage":1017}]
out = mod.repair_trip_odometer_continuity(rows, local)
row = next(item for item in out if item["id"] == "bad")
print(json.dumps(row, sort_keys=True))
`);
  const row = JSON.parse(output);
  assert.equal(row.start_mileage, 1010);
  assert.equal(row.end_mileage, 1017);
  assert.equal(row.distance_km, 7);
  assert.equal(row.repair_metadata.previous_end_mileage_km, 1010);
});

test("next-server evidence skips invalid following rows", () => {
  const output = runPython(String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("trip_repair", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
rows = [
  {"id":"prev","start_time":"2026-08-25T10:00:00+00:00","distance_km":10,"start_mileage":1031,"end_mileage":1041,"valid_for_statistics":True,"quality_flags":[]},
  {"id":"bad","start_time":"2026-08-25T11:00:00+00:00","duration_seconds":600,"distance_km":1048,"start_mileage":0,"end_mileage":1048,"valid_for_statistics":False,"quality_flags":["distance_outlier","zero_start_odometer_sentinel"]},
  {"id":"invalid-next","start_time":"2026-08-25T11:30:00+00:00","distance_km":2,"start_mileage":1046,"end_mileage":1048,"valid_for_statistics":False,"quality_flags":["odometer_distance_mismatch"]},
  {"id":"valid-next","start_time":"2026-08-25T12:00:00+00:00","distance_km":5,"start_mileage":1048,"end_mileage":1053,"valid_for_statistics":True,"quality_flags":[]},
]
row = mod.repair_trip_odometer_continuity(rows, [])[1]
print(json.dumps(row, sort_keys=True))
`);
  const row = JSON.parse(output);
  assert.equal(row.start_mileage, 1041);
  assert.equal(row.end_mileage, 1048);
  assert.equal(row.distance_km, 7);
  assert.equal(row.repair_metadata.source, "next_server_start");
});
