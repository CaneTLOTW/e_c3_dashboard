# Codex Runtime Handoff — e-C3 Dashboard 0.5.53 trip continuity + one-off LTS repair

## Role and scope

This is an **execute-prepared-patch + runtime data repair** task. Do not redesign the implementation.

Repository: `CaneTLOTW/e_c3_dashboard`
Branch: `develop`
Issue: `CaneTLOTW/e_c3_dashboard#25`
Previous user-accepted runtime: `0.5.52`

ChatGPT has already authored:

- `custom_components/e_c3_dashboard/trip_repair.py`
- `tests/trip-continuity.test.mjs`
- the exact wiring/version patch `internal/patches/0.5.53_trip_continuity.patch`

Your source-editing role is limited to applying that exact patch and, only if `git apply --check` finds a harmless context drift, making the smallest equivalent context-only adjustment and reporting it.

## Why this exists

A retained Stellantis server trip has a known malformed pair: zero start odometer plus a distance that is effectively the absolute end odometer. The local package captured the same physical trip with a plausible monotonic odometer delta. Merely hand-editing the current canonical row would be lost at the next server sync, so the repair must be part of every canonical rebuild while the raw server row remains untouched.

Separately, Home Assistant long-term statistics show a one-time `sum` reset while the mileage `state` itself stayed monotonic. That historical statistics sequence should be corrected once through Home Assistant's supported statistics-adjust path and then observed for recurrence.

## Phase A — apply the prepared 0.5.53 source patch

1. Start from the current `develop` HEAD referenced by the latest ChatGPT handoff in `CaneTLOTW/e_c3_dashboard#25`.
2. Confirm the prepared helper tests are green on that HEAD.
3. Run:

   ```bash
   git apply --check internal/patches/0.5.53_trip_continuity.patch
   git apply internal/patches/0.5.53_trip_continuity.patch
   ```

4. Do **not** rewrite the algorithm. The patch must only:
   - import `repair_trip_odometer_continuity` in `server_history.py`;
   - run it on normalized server trips using current local metric trips as corroboration;
   - bump package/frontend resource version to `0.5.53`;
   - update the narrow regression expectations.
5. Keep `internal/patches/0.5.53_trip_continuity.patch` in the repository as implementation provenance unless it itself causes validation trouble.
6. Run locally:
   - Python compile;
   - `node --test tests/*.test.mjs`;
   - static JS syntax checks used by the repository;
   - JSON validation;
   - `git diff --check`.
7. Commit the applied source changes to `develop` and wait for the full GitHub Validate workflow. Do not deploy a red SHA.

## Phase B — verify the canonical repair logic from source/tests

Before touching runtime data, confirm from the resulting candidate that the behavior is exactly this:

- a canonical start odometer lower than the prior plausible end is only a **repair trigger**;
- it is not blindly overwritten without evidence;
- end-odometer evidence priority is:
  1. same-window local trip with start near the prior end;
  2. next positive server start odometer;
  3. only for explicit `start=0` sentinel, the normalized source end;
- repaired distance must remain positive and pass distance/duration/speed plausibility;
- raw Stellantis payload is not mutated;
- original source mileage/distance/flags remain available as repair provenance;
- repaired canonical distance, speed and consumption are recalculated;
- unsupported regressions remain invalid rather than being fabricated;
- repeated rebuild is idempotent.

The known historical row is expected to become approximately `1041 → 1048 = 7 km`, preferably with `repair_metadata.source=local_trip_match` while that local row is still available.

## Phase C — one-off Home Assistant LTS sum repair

Do this while the current HA runtime is reachable, preferably **before** the 0.5.53 restart.

### C1. Read-only resolve the exact boundary

For the mileage statistic used by the dashboard's `Gefahrene Strecke pro Monat` chart:

1. Resolve the exact `statistic_id` without publishing any VIN/private identifier.
2. Read the 5-minute and hourly statistics around the already identified August reset boundary.
3. Confirm again:
   - `state` remains monotonic;
   - `sum` has a single discontinuity/reset;
   - identify `last_good_sum` immediately before the reset;
   - identify `first_bad_sum` and the exact `start_time` of the first bad row.
4. Compute exactly:

   `adjustment = last_good_sum - first_bad_sum`

Do **not** assume the adjustment is exactly `648`; use the stored numbers.

### C2. Apply only through Home Assistant's supported statistics API

Preferred/required mutation path is the authenticated Home Assistant WebSocket command:

```json
{
  "type": "recorder/adjust_sum_statistics",
  "statistic_id": "<resolved statistic id>",
  "start_time": "<first bad row ISO timestamp>",
  "adjustment": <computed adjustment>,
  "adjustment_unit_of_measurement": "km"
}
```

Important:

- **Do not edit SQLite/MariaDB tables directly.**
- Do not delete Recorder/statistics rows.
- Do not use `recorder/import_statistics` as a substitute.
- If no authorized HA WebSocket path is available in this execution environment, STOP this phase and report the sanitized `statistic_id`, exact boundary time, `last_good_sum`, `first_bad_sum`, and calculated adjustment so the user/ChatGPT can perform it through HA. Do not fall back to raw database writes.

### C3. Verify after adjustment

Read the affected statistics again and verify:

- both short-term and hourly/long-term sums are continuous across the repaired boundary;
- the underlying mileage `state` is unchanged;
- a week/month `change` query across the previous bad period is no longer negative solely because of that reset;
- no unrelated statistic was modified.

Record the exact adjustment in the issue in sanitized form. We intentionally add **no permanent LTS workaround** in 0.5.53; the user wants to observe whether the reset recurs.

## Phase D — deploy exact green 0.5.53 candidate

1. Package-only backup if practical. Do not delete unrelated data to make room.
2. Sync the exact green candidate to `/homeassistant/custom_components/e_c3_dashboard`.
3. Verify installed `manifest.json` and `FRONTEND_VERSION` are `0.5.53` and the Lovelace resource is `/e_c3_dashboard/frontend.js?v=0.5.53`.
4. Because Python canonical-history code changed, perform one normal integration reload if sufficient; otherwise exactly one normal HA Core restart.
5. After normal wait, continue with the actual e-C3 checks. No standalone MCP/8123/Supervisor health gate.

## Phase E — runtime acceptance

Verify the known bad trip after canonical rebuild/server sync:

- raw retained Stellantis data still contains the original malformed values;
- canonical/UI row is repaired to the plausible trip (expected about 7 km in the known case);
- start/end mileage are monotonic;
- average speed is plausible and recalculated when source speed is absent;
- consumption uses the repaired distance;
- row is eligible for statistics only if the repaired result passes all guards;
- `repair_metadata`/source provenance records how the repair was established;
- perform one safe server-history sync and verify the canonical repair remains in place afterward (proves the next pull does not resurrect the 1048-km display defect).

Then check:

- 500-km consumption still looks plausible after the newly valid 7-km trip participates in the rolling window;
- no regression in dashboard strategy, Notifications, Wake-up, GPS, loader, or preconditioning visual.

## Small-repair rule

Only context drift needed to apply the **already-authored patch** may be fixed locally. Report file/change/reason/retest. Any change to the repair semantics, statistics strategy, data model, loader, notification logic, or UI scope: STOP and return the finding to ChatGPT.

## Result format

Post to `CaneTLOTW/e_c3_dashboard#25`:

```markdown
## Codex → ChatGPT Ergebnis

### Candidate
- pre-patch develop SHA:
- applied prepared patch:
- resulting exact SHA / version:
- repository validation:

### Trip continuity source acceptance
- helper tests:
- wiring confirmed:
- raw preservation confirmed:
- unsupported regression behavior:

### LTS one-off repair
- statistic id: sanitized
- reset boundary:
- last_good_sum:
- first_bad_sum:
- calculated adjustment:
- mutation path: recorder/adjust_sum_statistics / BLOCKED_NO_AUTHORIZED_WS
- short-term verification:
- hourly/LTS verification:
- negative change after repair:

### Runtime
- exact synced SHA:
- resource version:
- reload/restart:
- no rollback / no main:

### Known trip after canonical rebuild
- raw source retained:
- canonical start/end/distance:
- average speed / speed source:
- consumption:
- repair source:
- valid_for_statistics:
- after explicit server-history sync:

### 500-km sanity
- value / distance / energy / trip_count / complete:

### Small local repair, if any
- none / exact report

### Remaining observation
- whether another HA LTS sum reset occurs is intentionally left for observation
```

Then STOP. No `main` update.
