import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../custom_components/e_c3_dashboard/static/charge-history-core.js", import.meta.url), "utf8");
const {
    buildChargeSessions,
    buildLocalChargeSessions,
    findChargeSession,
    mergeChargeSessions,
} = await import(`data:text/javascript,${encodeURIComponent(source)}`);

const state = (value, timestamp, attributes = undefined) => ({
    state: String(value),
    last_changed: timestamp,
    ...(attributes ? { attributes } : {}),
});

const rawSessions = buildChargeSessions({
    chargingStates: [
        state("on", "2026-08-14T08:00:00Z"),
        state("off", "2026-08-14T09:00:00Z"),
        state("on", "2026-08-14T12:00:00Z"),
        state("off", "2026-08-14T13:00:00Z"),
    ],
    socStates: [
        state(20, "2026-08-14T08:00:00Z"),
        state(40, "2026-08-14T09:00:00Z"),
        state(50, "2026-08-14T12:00:00Z"),
        state(80, "2026-08-14T13:00:00Z"),
    ],
    modeStates: [state("AC", "2026-08-14T07:59:00Z")],
});

const localOnly = buildLocalChargeSessions([
    state("unknown", "2026-08-14T14:00:00Z", {
        start_time: "2026-08-14T10:00:00Z",
        end_time: "2026-08-14T11:30:00Z",
        duration_seconds: 5400,
        soc_start: 35,
        soc_end: 65,
        capacity_kwh: 43.4,
        energy_kwh: 13.02,
        average_power_kw: 8.68,
        charge_type: "AC",
    }),
]);

assert.equal(localOnly.length, 1, "historical local result must be usable while current state is unknown");
assert.match(localOnly[0].id, /^charge-2026-08-14T10:00:00\.000Z$/);

const matchingLocal = buildLocalChargeSessions([
    state("unknown", "2026-08-14T14:00:00Z", {
        start_time: "2026-08-14T08:02:00Z",
        end_time: "2026-08-14T09:00:00Z",
        duration_seconds: 3480,
        soc_start: 20,
        soc_end: 40,
        capacity_kwh: 43.4,
        energy_kwh: 8.68,
        average_power_kw: 8.97,
        charge_type: "AC",
    }),
]);

const merged = mergeChargeSessions(rawSessions, matchingLocal);
assert.equal(merged.length, 2, "matching local and recorder sessions must be deduplicated");
const matched = merged.find((session) => session.id === matchingLocal[0].id);
assert.equal(matched?.id, matchingLocal[0].id, "local replacement must keep one stable session ID");
assert.equal(findChargeSession(merged, matchingLocal[0].id)?.id, matchingLocal[0].id);
assert.equal(findChargeSession(merged, matchingLocal[0].start)?.id, matchingLocal[0].id, "old timestamp selections remain compatible");

const localMerged = mergeChargeSessions([], localOnly);
assert.equal(localMerged.length, 1, "a recorder-only local result must be selectable");
assert.equal(findChargeSession(localMerged, localOnly[0].id)?.id, localOnly[0].id);

assert.equal(matched?.start, "2026-08-14T08:02:00Z");
assert.equal(mergeChargeSessions(rawSessions, []).at(0).start, "2026-08-14T12:00:00.000Z", "without a selection the newest session is first");
assert.equal(findChargeSession(merged, "charge-does-not-exist"), null, "unknown selections must not silently resolve to another session");

console.log("charge-history-core tests passed");
