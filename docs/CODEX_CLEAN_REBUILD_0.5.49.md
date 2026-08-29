# Codex runtime handoff – e-C3 Dashboard 0.5.49 clean rebuild

This runbook is the executable runtime acceptance for the clean 0.5.49 rebuild.
The exact candidate SHA is supplied in the GitHub Issue handoff comment. Do not
substitute the current branch HEAD if it has moved since that comment.

Authoritative requirements: `docs/CLEAN_REBUILD_0.5.49_REQUIREMENTS.md`.

## Role boundary

The source implementation, feature contract and regression tests are prepared
before this handoff. Codex is the runtime executor for this pass.

Codex may correct only a small, obvious local defect that is necessary to
continue and that does not change feature semantics or architecture (for example
a typo, missing import, one cache-version string, one-line mapping or narrow
guard). If this happens, report the file, exact change, reason and repeated
focused test. If a finding needs broader source generation, refactoring, a data
model change or a different feature design, stop and return the finding to
ChatGPT instead of implementing a replacement solution.

## Deployment

1. Confirm the handoff's exact candidate SHA and version 0.5.49.
2. Create a package-only backup of the current e-C3 runtime.
3. Synchronize exactly that candidate into
   `/homeassistant/custom_components/e_c3_dashboard`.
4. Verify the served package resource is `frontend.js?v=0.5.49`.
5. Perform one normal Home Assistant Core restart because Python/platform source
   changed.
6. Allow the normal startup interval, then continue directly with the first
   task-specific functional check below.

A dropped/timeout restart request is not itself a failure. MCP, port 8123,
Supervisor, registry and generic health endpoints are diagnostic tools only if
a real task step below cannot be performed; they are not separate preflight or
acceptance gates. Do not restart repeatedly merely because a management path is
unavailable.

## A. Basic regression / UI acceptance

Without changing vehicle state artificially:

- Open the generated e-C3 dashboard and confirm normal Vehicle/Hero/Charging
  operation has not regressed.
- Confirm tab order left to right is exactly:
  `Vehicle → Charging → Statistics → Trips → GPS → Wake-up → Notifications → System → Help`.
- Confirm Help is the rightmost view.
- Confirm the GPS details no longer display the constant `GPS-Genauigkeit ±10 m`.
- Confirm Wake-up has the hourly and availability-probe controls readable/full
  width rather than cramped side-by-side; manual `Fahrzeug jetzt aufwecken`
  remains a button action. Do not press it solely for visual acceptance.
- Confirm System shows a readable setup/status presentation and
  `Zugeordnete Upstream-Entitäten` displays an actual count, not another `ready`.
- Confirm Help content covers current trips/data quality, charging history and
  curves, GPS period selection, notifications/recipients, wake-up and System
  diagnostics.

## B. German entity labels and notification settings

- In Settings → Devices & services → e-C3 Dashboard → device/entities, verify
  the package-owned Sensor entities are German in a German HA UI, including the
  server history, vehicle information, 500-km consumption, distance since
  charge, current trip energy/current charge power and last local result
  sensors.
- In the Notifications view verify the package-owned controls are visible and
  editable in readable groups:
  - range warn/reset;
  - home SOC warn/reset;
  - 12-V warn/reset;
  - home warning delay;
  - stale timeout home/away;
  - probe wait;
  - charge-start delay;
  - quiet start/end.
- Change one harmless Number value and one Time value, note the new values,
  restore both to their original values and verify state is retained through
  the entity round-trip. Do not deliberately create warning conditions.

## C. Notification recipients / safe test

- Open `Empfänger verwalten` from the Notifications view and verify the
  integration options offer the currently available Notify targets as a
  multiple selection.
- Verify a newly discovered target is only a choice and is not implicitly
  selected/enabled.
- Select the desired test target(s) explicitly if needed.
- Verify only selected targets get package recipient switches and those switches
  remain opt-in.
- With the master notification switch and the selected test recipient enabled,
  trigger the package's safe test-notification button/path once.
- Confirm the test reaches only the selected/enabled recipient(s).
- Confirm Last notification type/time/message diagnostics update.
- Restore any temporary test switch state requested by the maintainer.

Do not manufacture low range, low SOC-at-home, low 12-V or a real charging event
solely to test alerts.

## D. Known 25-August trip – forensic evidence before conclusion

The UI previously showed one impossible row around 25 August ~13:14 with roughly
9 minutes duration, ~1,048 km and ~6,822 km/h, with an apparent start mileage of
0. Determine where the bad value originated. Do not delete or edit archive data.

Inspect the live local evidence that already exists and report a **sanitized
field matrix**, not a raw dump. Correlate the same trip across as many of these
layers as are available:

1. raw Stellantis trip record retained by the e-C3 server-history Store;
2. normalized canonical server-history row;
3. compact HA server-trip-history entity row shown to the frontend;
4. local metrics trip/pending-trip data if a matching row exists;
5. upstream Stellantis `last_trip` entity/history only when it can be correlated
   to the same event.

Report only these non-sensitive fields:

| Field | Raw server | Normalized server history | Local/other |
| --- | --- | --- | --- |
| start/end time | | | |
| duration seconds | | | |
| distance value | | | |
| start mileage | | | |
| explicit end mileage, if actually present | | | |
| raw kinetic avgSpeed | | | |
| normalized speed | | | |
| speed source | | | |
| SOC start/end | | | |
| energy source/value | | | |
| valid_for_statistics | | | |
| quality_flags | | | |

Also answer explicitly:

- Is the ~1,048 km value already present in the raw Stellantis `distance`, or is
  it introduced later?
- Is `startMileage: 0` already present in the raw trip, or introduced/restored
  locally?
- Does the raw trip contain an independent end-mileage field? If not, do not
  treat `startMileage + distance` as an independent odometer cross-check.
- Is raw `kinetic.avgSpeed` plausible when interpreted as m/s × 3.6?
- Was the displayed ~6,822 km/h the source speed or the distance/duration
  fallback?
- Does a matching local pending/completed trip exist, and if yes was it merged
  or merely a separate fallback row?

Never paste VIN, trip IDs in full, exact GPS coordinates, street/address data,
credentials, tokens, account IDs or raw Store/API payloads into the public Issue.
Use a short/redacted ID suffix only if correlation requires one.

The 0.5.49 candidate must leave questionable raw data in the local archive while
suppressing impossible derived distance/speed/consumption from user-facing
statistics. If runtime evidence shows that the permanent guard needs a semantic
change, report the finding and stop that part; ChatGPT will prepare the source
follow-up.

## E. 500-km consumption validation

Read the `Ø Verbrauch 500 km` sensor state and its safe diagnostic attributes.
Report:

- value;
- source (`canonical server trip history` or local fallback);
- accepted distance;
- accepted energy;
- contributing trip count;
- whether the 500-km window is complete.

Then verify from the canonical rows that:

- the known invalid/outlier trip is not contributing;
- only rows with usable positive distance and energy are included;
- the boundary trip is proportionally included when the rolling window reaches
  500 km rather than counting the entire excess distance.

Do not assume the previous ~13.8 kWh/100 km value is wrong. State whether the
underlying valid rows support the resulting value. If they do, record that as a
valid result; if not, return the discrepancy for a source fix.

## F. GPS acceptance

No archive/store mutation is allowed.

- Today/day selection: both blue Recorder history and orange server overlay use
  the selected day; current vehicle marker remains visible.
- Arbitrary 2–3 day range: both sources use the same interval.
- Native week/month preset where offered by HA.
- `Alle`: full available server archive is displayed while current marker stays
  visible.
- Switch from `Alle` back to today and verify no archive leakage/stuck range.
- Navigate away and back without F5; picker/map remain functional.
- Check browser and HA app where practical.
- `ha-map-card history_date_selection` bridge remains disabled; the native
  `energy-date-selection` collection is authoritative.

## Result contract

Post separate results to the relevant issues:

- `CaneTLOTW/e_c3_dashboard#23`: notifications, translations, layouts,
  recipient behavior, trip forensics and 500-km consumption.
- `CaneTLOTW/e_c3_dashboard#16`: GPS period/navigation acceptance.

Use heading `## Codex → ChatGPT Ergebnis` and distinguish:

- **Candidate** – exact handoff SHA/version;
- **Runtime** – exact SHA/version actually synchronized;
- **Validated** – which checks above passed, failed or remain naturally pending.

Include every small local correction explicitly if any was made. Otherwise state
that runtime source was unchanged.

STOP after reporting. Do not update `main`, create a release, delete/mutate the
GPS/trip/notification Stores, or start a second implementation pass.