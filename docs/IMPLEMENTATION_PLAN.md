# Implementation plan

## Status

Started on 2026-08-13. The project has a HACS integration foundation; no
personal Home Assistant configuration is copied into this repository.

## Phase 1 — Foundation

- [x] Define HACS integration architecture.
- [x] Define mandatory external HACS dependencies.
- [x] Define German/English localisation policy.
- [x] Implement config-entry setup and vehicle selection.
- [x] Register a Community Dashboard strategy (plus YAML-strategy fallback for picker issues).
- [x] Provide an explicit missing-prerequisite view.
- [x] Add HACS validation workflow.

## Phase 2 — Portable data layer

- [x] Move the rolling 500-km consumption and distance-since-charge metrics
      from YAML to the config entry.
- [x] Add per-vehicle persistent session storage.
- [x] Add safe discovery/mapping of upstream Stellantis entities.
- [x] Expose an integration status entity with mapping and history diagnostics.
- [ ] Test restart recovery and missing/upstream-unavailable states.

## Phase 3 — Dashboard strategy

- [x] Vehicle overview: battery, charging, climate, position and status.
- [x] Trip history view using the bundled trip-history card.
- [x] Charge history view (active curve remains a separate next increment).
- [x] GPS-history view.
- [x] Manual wake-up and remote-connection diagnostics view.
- [ ] Responsive tablet/mobile verification.

## Phase 4 — Optional modules

- [ ] Wake-up scheduling and activity log.
- [ ] Notification event/service adapter contract.
- [ ] Recorder/InfluxDB diagnostic hints.
- [ ] Multi-vehicle dashboard selection.

## Phase 5 — Quality and release

- [ ] Unit tests with anonymised fixtures.
- [ ] HACS Action and Hassfest workflows.
- [ ] English and German installation/update/troubleshooting guides.
- [ ] License decision.
- [ ] Public repository review and first `v0.1.0` release.
- [ ] Optionally submit to the default HACS repository after stable releases.

## Acceptance criteria for first public release

1. Installation needs only HACS, the four documented dependencies, a restart,
   the config flow and Dashboard picker.
2. No dashboard YAML, VIN or raw entity mapping is copied by a normal user.
3. Missing dependencies display a clear setup status rather than a
   `Custom element doesn't exist` error.
4. All project-owned UI strings work in German and English.
5. Upstream Stellantis API communication remains completely outside this
   project.
6. The test repository and releases contain no personal data.
