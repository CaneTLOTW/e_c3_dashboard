# Codex Runtime Handoff – e-C3 Dashboard 0.5.42

## Status

Repository: `CaneTLOTW/e_c3_dashboard`

Branch: `develop`

This handoff supersedes the 0.5.41 handoff. The 0.5.41 runtime still reproduced Home Assistant's Strategy registration timeout and is **not validated**.

Observed live error:

> `Error loading the dashboard strategy: Error: Timeout waiting for strategy element ll-strategy-dashboard-e-c3-dashboard to be registered`

Do **not** promote to `main` before explicit user acceptance.

## Root cause and canonical fix

0.5.41 improved the old 10-second dependency gate but still kept a 3-second gate before importing `e_c3_dashboard.js`:

```js
await Promise.race([readinessGate, registrationDeadline]);
await import("./e_c3_dashboard.js?v=0.5.41");
```

Runtime evidence shows that Home Assistant can time out before those three seconds have elapsed. Therefore any readiness gate in front of Strategy registration is architecturally wrong.

0.5.42 makes Strategy registration the first package-loading action after the narrow map compatibility shim:

```js
await import("./e_c3_dashboard.js?v=0.5.42");
```

Only **after** that import has registered `ll-strategy-dashboard-e-c3-dashboard` do package-card imports and external dependency observation start.

Consequences:

- no 10-second dependency wait before Strategy registration;
- no 3-second Strategy registration deadline;
- no `readinessGate` or `registrationDeadline` in the loader;
- internal package modules still use `Promise.allSettled(...)` and cannot suppress Strategy registration;
- external dependency observation still exists as a non-blocking background promise;
- exactly one package-owned Lovelace entry resource remains.

Version/cache is bumped to **0.5.42** so an old 0.5.40/0.5.41 browser module cannot be mistaken for the new loader.

## Exact candidate rule

Deploy the exact `develop` SHA that contains this handoff file, not an earlier intermediate 0.5.42 commit.

Before deployment verify GitHub Actions `Validate` for that exact SHA is completely PASS:

- Python compile
- frontend `node --check`
- Node regression tests
- JSON validation
- whitespace/diff checks
- Hassfest
- HACS validation

## Runtime deployment

The current Home Assistant runtime may contain 0.5.41 files/resource registration. Replace only package-owned e-C3 files with the exact final handoff SHA.

Rules:

- `/homeassistant` is intentionally dirty; no broad reset, restore or clean.
- Synchronize only `custom_components/e_c3_dashboard` package-owned files.
- Keep exactly one package-owned Lovelace resource: `/e_c3_dashboard/frontend.js?v=0.5.42`.
- Do not touch unrelated Home Assistant resources/configuration.
- Do not add a diagnostic post-patch or second resource.

After synchronization:

1. confirm runtime `manifest.json` reports `0.5.42`;
2. confirm `const.py` reports `FRONTEND_VERSION = "0.5.42"`;
3. confirm the active Lovelace resource is exactly `/e_c3_dashboard/frontend.js?v=0.5.42`;
4. perform one controlled Home Assistant Core restart/reload as required;
5. wait for HA to return fully;
6. then perform the cold-start test below.

If restart is blocked by permissions, report the blocker and stop rather than claiming Runtime PASS.

## Mandatory Strategy cold-start test

Do not mask the result with repeated F5/reloads.

1. After HA restart, open the e-C3 dashboard normally.
2. Verify the dashboard renders on the first normal load.
3. Verify **no** `Timeout waiting for strategy element ll-strategy-dashboard-e-c3-dashboard` error occurs.
4. Navigate `vehicle → charging → gps → statistics → system → vehicle`.
5. Verify Strategy registration and navigation require no F5.

Any recurrence of the Strategy timeout is a hard FAIL.

## Continue functional acceptance on the same 0.5.42 runtime

0.5.42 contains the previously prepared Vehicle/System UX work. After Strategy cold-start PASS, continue:

- LIVE Hero vehicle image visible without F5 and stable across internal navigation;
- Range badge opens native HA More-Info/history for mapped autonomy entity;
- Temperature badge opens native HA More-Info/history when temperature is displayed;
- preconditioning Tap = Start, Hold = Stop; capture exact sanitized error if HA/upstream rejects it;
- info popup order = Maintenance first, Vehicle second;
- no standalone `Fahrzeuginformationen` card in Vehicle;
- maintenance values are never fabricated when upstream data is empty;
- `Einstellungen` and `ABRP` absent from Vehicle and present/functioning in System.

## Reporting contract

Post the result using:

`## Codex → ChatGPT Ergebnis`

Keep Candidate / Runtime / Validated distinct and report at minimum:

- exact handoff SHA deployed;
- runtime version `0.5.42`;
- runtime file comparison result;
- active Lovelace resource URL;
- HA restart/reload result;
- Strategy cold-start PASS/FAIL;
- Hero image/navigation PASS/FAIL;
- Range More-Info PASS/FAIL;
- Temperature More-Info PASS/FAIL;
- preconditioning Start/Stop PASS/FAIL with sanitized error if applicable;
- popup/order/maintenance result;
- System Settings/ABRP result;
- relevant browser/app console errors.

## Stop condition

After reporting, STOP.

Do **not**:

- update `main`;
- create a stable tag/release;
- close runtime issues solely because static CI passed;
- hide a remaining Strategy timeout using repeated refreshes;
- introduce a temporary Strategy wrapper/post-patch or second Lovelace resource.