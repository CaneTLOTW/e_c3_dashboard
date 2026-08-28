# Codex Runtime Handoff – e-C3 Dashboard 0.5.41

## Status

Repository: `CaneTLOTW/e_c3_dashboard`

Branch: `develop`

This handoff supersedes the 0.5.40 runtime handoff for the current recovery cycle.

Observed live failure after deploying/restarting 0.5.40:

> `Error loading the dashboard strategy: Error: Timeout waiting for strategy element ll-strategy-dashboard-e-c3-dashboard to be registered`

Do **not** promote to `main` before explicit user acceptance.

## Root cause fixed in 0.5.41

`static/frontend.js` previously waited for the full external dependency grace period before importing/registering the dashboard Strategy. The dependency wait is 10 seconds, while Home Assistant itself uses a bounded wait for the custom Strategy element. On cold start this could consume HA's registration window and produce the observed timeout even though the package itself was present.

0.5.41 changes the loader contract:

- external dependency observation still starts immediately and may run for up to 10 seconds;
- internal package modules still start immediately;
- package module loading uses `Promise.allSettled(...)` so one card-module failure cannot suppress Strategy registration;
- the Strategy import is released by a separate 3-second registration deadline at the latest;
- `ll-strategy-dashboard-e-c3-dashboard` therefore registers before Home Assistant's own Strategy wait expires;
- dependency readiness remains available as `window.__ec3DashboardDependencyReadiness` and the Strategy's normal missing-dependency UI remains the user-facing fallback.

Version/cache was bumped from `0.5.40` to `0.5.41` in canonical source and tests.

## Repository validation

The final handoff SHA is the commit containing this file. Before runtime deployment, verify that exact `develop` SHA and its GitHub Actions `Validate` run are PASS for:

- Python compile
- frontend `node --check`
- Node regression tests
- JSON validation
- `git diff --check`
- Hassfest
- HACS validation

Do not deploy an earlier 0.5.41 intermediate commit if a later docs-only handoff commit exists; deploy the exact handoff SHA.

## Runtime deployment

The current Home Assistant runtime may contain the broken 0.5.40 package. Replace package-owned files only with the exact final `develop` handoff SHA.

Rules:

- `/homeassistant` is intentionally dirty: no broad reset/restore/clean.
- Synchronize only `custom_components/e_c3_dashboard` package-owned files.
- Keep exactly one package-owned Lovelace resource: `/e_c3_dashboard/frontend.js?v=0.5.41`.
- Remove only obsolete e-C3 package files/resources when canonical 0.5.41 no longer contains them.
- Do not touch unrelated HA configuration/resources.

After file synchronization:

1. confirm runtime `manifest.json` = `0.5.41`;
2. confirm package files match the exact handoff SHA;
3. confirm/allow the integration to update its Lovelace resource to `/e_c3_dashboard/frontend.js?v=0.5.41`;
4. perform one controlled Home Assistant Core restart/reload as required;
5. wait until HA is fully back before browser testing.

If shell/Supervisor restart is blocked by permissions, report the blocker and stop rather than claiming Runtime PASS.

## Mandatory cold-start test

Use browser/HA app without first masking the failure with repeated reloads.

1. Open the e-C3 dashboard after the HA restart.
2. Verify there is **no** `Timeout waiting for strategy element ll-strategy-dashboard-e-c3-dashboard` error.
3. Verify the dashboard renders on first normal load.
4. Navigate between `vehicle`, `charging`, `gps`, `statistics`, `system`, then back to `vehicle`.
5. Verify no F5 is required for Strategy registration or normal internal navigation.

The old 0.5.40 timeout is a hard FAIL if it appears even once in a clean test cycle.

## Continue 0.5.40 functional acceptance on the same 0.5.41 runtime

0.5.41 includes the previously prepared Vehicle/System UX fixes, so after the loader passes, continue the existing acceptance set:

- LIVE Hero vehicle image visible without F5 and stable across internal navigation;
- range badge opens native HA More-Info/history for mapped autonomy entity;
- temperature badge opens native HA More-Info/history when temperature is actually displayed;
- preconditioning Tap = Start and Hold = Stop using mapped button entities; record exact error if upstream/HA rejects the command;
- info popup order is Maintenance first, Vehicle second;
- no standalone `Fahrzeuginformationen` card in the normal Vehicle section;
- empty maintenance data is treated as upstream availability, never fabricated;
- `Einstellungen` and `ABRP` are absent from Vehicle and present/functioning in System.

## Reporting contract

Post results in the relevant GitHub Issue using:

`## Codex → ChatGPT Ergebnis`

and keep **Candidate / Runtime / Validated** separate.

Report at minimum:

- exact handoff SHA deployed;
- version `0.5.41`;
- runtime file SHA comparison result;
- active Lovelace resource URL;
- HA restart/reload result;
- Strategy cold-start PASS/FAIL;
- Hero image/navigation PASS/FAIL;
- Range More-Info PASS/FAIL;
- Temperature More-Info PASS/FAIL;
- preconditioning Start/Stop PASS/FAIL with sanitized error evidence if applicable;
- popup/order/maintenance result;
- System Settings/ABRP result;
- browser/app console errors relevant to e-C3.

## Stop condition

After reporting, STOP.

Do **not**:

- update `main`;
- create a stable release/tag;
- close runtime Issues solely because static CI passed;
- hide a remaining Strategy timeout with repeated F5/reloads;
- introduce a temporary Strategy post-patch or second Lovelace entry point.
