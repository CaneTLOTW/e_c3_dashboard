# Codex Runtime-Handoff – e-C3 Dashboard 0.5.50

Canonical issue: `CaneTLOTW/e_c3_dashboard#24`

This run is **deployment + runtime acceptance + read-only data forensics**. The source implementation is prepared in the repository. Do not start a broad implementation pass.

## 1. Preconditions / branch discipline

- Repository: `CaneTLOTW/e_c3_dashboard`
- Source branch: `develop`
- Runtime target: the exact SHA named in the latest `## ChatGPT → Codex Handoff` comment on `CaneTLOTW/e_c3_dashboard#24`.
- `main` stays unchanged.
- `/homeassistant` is intentionally dirty. Never run broad `reset --hard`, `clean -fd`, `restore .` or equivalent cleanup.
- Make a package-only backup of `/homeassistant/custom_components/e_c3_dashboard` before sync.
- Sync only the package source required for the exact candidate.

If a tiny execution-local defect blocks the run (e.g. typo/import/cache string/narrow guard), Codex may repair it only when the correction is unambiguous. Report **file + exact change + reason + repeated test**. If the required change affects feature semantics, architecture, persistence, statistics semantics or data model, STOP and report the finding instead of implementing it.

## 2. Normal deployment flow

1. Verify repository working tree/branch and exact candidate SHA.
2. Run the repository's normal static checks before deployment.
3. Create package-only runtime backup.
4. Synchronize the exact candidate into `/homeassistant/custom_components/e_c3_dashboard`.
5. Verify the served Lovelace resource is `/e_c3_dashboard/frontend.js?v=0.5.50`.
6. Request **one normal HA Core restart** because Python entity metadata changed.
7. Wait the normal startup interval, then continue directly with the functional checks below.

The restart call losing its own connection is expected. MCP/8123/Supervisor/Registry/management probes are not separate acceptance gates. Use transport diagnostics only if an actual required functional step cannot be performed. Do not restart again or roll back merely because a management transport is temporarily unavailable.

## 3. Runtime UI acceptance

### Vehicle

Confirm:

- `Tageslicht erkannt` is not shown.
- `Alarmanlage` is not shown.
- the old separate `Fahrzeug`/vehicle-details section is gone.
- `Kilometerstand` is the first item under `Verbrauch & Nutzung`.
- `Datenschutz / Datenfreigabe` is no longer in Vehicle.
- under `Batteriegesundheit`, Hochvolt-Batterie and 12-V-Batterie are side by side at half width; the 12-V value is no longer in the Live block.
- `Letzte Ladung` displays a relative age (`vor … Min./Std./Tagen`) rather than a raw date-time when a canonical charge end timestamp exists.
- Hero, range, charging card, quick actions and map are otherwise unchanged.

### Wake-up

Confirm:

- `Fahrzeug jetzt aufwecken` still calls the package-owned manual wake-up button.
- the card displays the existing upstream command-status value in its second line (e.g. an accepted wake-up status) so a tap gives visible feedback.
- hourly wake-up, availability probe and charge wake-up remain independent switches.
- package-owned control names do not carry a vehicle/VIN-like `… Dashboard` prefix in visible entity/control names.

Do **not** manufacture repeated wake-ups. One user-requested/manual test is enough if needed.

### Notifications

Only perform a visual regression check in this run:

- existing settings/groups remain present and readable;
- package-owned switch/Number/Time/button names do not get a vehicle/VIN-like device-name prefix;
- recipient management remains explicit opt-in.

Do not broaden this run into the full notification event-matrix; that acceptance stays separate in `CaneTLOTW/e_c3_dashboard#23`.

### System / views

Confirm:

- System contains its own `Datenschutz & Freigabe` section with the privacy control.
- existing status/mapped-entity/settings/ABRP sections remain functional.
- tab order remains left-to-right:
  `Vehicle → Charging → Statistics → Trips → GPS → Wake-up → Notifications → System → Help`.

### GPS non-regression

Do not change GPS colors in this candidate. Verify only that the already accepted picker behavior still works for at least today/yesterday and current marker remains visible.

The two colors intentionally represent two data sources:
- blue: HA Recorder tracker history (detailed recorded positions),
- orange: Stellantis server trip GeoJSON (start/stop-derived approximation).

## 4. Read-only trip forensics – anomalous ~25 Aug / ~13:14 row

Purpose: determine the **origin** of the anomalous row, not merely suppress it.

Known user-visible signature:
- date around 25 Aug 2026, around 13:14 local time;
- duration roughly 9 minutes;
- previously about 1,048 km and ~6,822 km/h;
- 0.5.49 keeps the archive row but suppresses implausible derived display/statistical values.

### Compare these layers

1. retained `server_trips_raw` row in the package server-history Store;
2. corresponding `canonical_trips` normalized row;
3. local metrics Store (`trips`, `pending_trips`, `last_trip`) only if a matching time window exists;
4. current read-only Stellantis trip endpoint result for the same row/window if the existing upstream client exposes it safely.

For the matching record record only sanitized values necessary for the diagnosis:

- local start/end timestamps (minute precision is enough in the Issue report),
- raw `distance`,
- raw `startMileage`,
- raw kinetic `avgSpeed`/`averageSpeed` if present,
- raw duration / startedAt / stoppedAt,
- normalized `distance_km`, `start_mileage`, `end_mileage`, `average_speed`, `speed_source`, `valid_for_statistics`, `quality_flags`,
- whether a local pending/reconciled trip exists for the same interval.

Answer explicitly:

- Is `distance ≈ 1048` already supplied by Stellantis raw/API data, or introduced locally?
- Is `startMileage = 0` already supplied by Stellantis raw/API data, or introduced locally?
- Was the impossible speed supplied by the API, or derived from distance/time fallback?
- Is the current upstream API still returning the same anomalous row?
- Is there evidence of a unit mismatch, sentinel/missing-value encoding, row mismatch, or local reconciliation error?

Do not delete, rewrite or repair the raw Store/API history in this run.

### Privacy

Do not post VIN, coordinates, addresses, complete trip IDs or full Store/API dumps. If a stable row reference is useful, use only a short suffix/hash and the coarse time window.

## 5. Read-only HA statistics forensics – negative mileage change

User observed a bar around 10–17 Aug showing approximately `-329 km` in `Gefahrene Strecke`.

The dashboard currently feeds the upstream mapped `mileage` entity to Home Assistant's `statistics-graph` with `period: week` and `stat_types: ["change"]`. Determine where the negative change originates before changing code.

1. Resolve the exact mapped mileage entity from the e-C3 status mapping. Keep its private entity ID out of the public Issue report.
2. Inspect the entity's Recorder states around 9–18 Aug 2026 and locate any downward/reset jump.
3. Inspect corresponding HA long-term statistics metadata and statistics rows for the same period, read-only.
4. Correlate the negative `change` with raw state changes and any integration restart/entity-unavailable/recovery event visible in history.
5. Report whether the negative value is caused by:
   - upstream odometer state decrease/reset,
   - Recorder/statistics reset semantics,
   - a unit/entity mapping change,
   - dashboard aggregation only,
   - or another evidenced cause.

Do not edit statistics tables, Recorder data or entity history in this run.

## 6. Read-only 500-km consumption validation

Current user-visible value was roughly `15.6 kWh/100 km`. Do not assume it is wrong.

Read the package metric `trailing_consumption_500km` and report sanitized diagnostics:

- state/value,
- `source`,
- `distance_km`,
- `energy_kwh`,
- `trip_count`,
- `complete`.

Then verify from canonical trip data that rows with `valid_for_statistics == false` are excluded. In particular confirm whether the anomalous ~25-Aug row contributes zero distance/energy to this rolling window.

If practical, calculate a sanitized aggregate cross-check over the same valid canonical rows. Do not post private trip IDs or positions.

## 7. Charging timestamp contract – confirm only

No source change is expected here. Confirm the running source still follows this order for charge samples:

1. upstream battery attribute `Last updated` parsed as `source_time` → `timestamp_source = stellantis`;
2. HA state `last_updated` only if upstream source timestamp is absent;
3. local receive time only as final fallback.

Report this as a confirmation. Do not alter it unless runtime evidence contradicts the contract.

## 8. Result format

Post to `CaneTLOTW/e_c3_dashboard#24`:

```md
## Codex → ChatGPT Ergebnis

### Candidate
- exact SHA / version
- static tests

### Runtime
- exact synced SHA
- resource version
- one restart requested
- no rollback / no main

### UI acceptance
- Vehicle: PASS/FAIL + concise observations
- Wake-up: PASS/FAIL + command-status feedback result
- Notifications visual regression: PASS/FAIL
- System/tab/GPS non-regression: PASS/FAIL

### Trip forensics
- raw source finding
- normalized finding
- local reconciliation finding
- upstream re-read finding
- evidenced root-cause assessment

### Mileage statistics forensics
- source entity/statistic class (sanitized)
- downward/reset event finding
- reason for ~-329 km

### 500-km validation
- value/source/distance/energy/trip_count/complete
- invalid-row contribution = yes/no
- aggregate cross-check

### Charging timestamp confirmation
- source-first / HA fallback / receive-time fallback confirmed yes/no

### Small local repair, if any
- file / exact repair / reason / repeated test

### Remaining user acceptance
- concise list only
```

Then STOP. Do not update `main`. Do not perform a second implementation pass.