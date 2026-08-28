# Codex runtime handoff — e-C3 Dashboard 0.5.40

## Scope

Repository: `CaneTLOTW/e_c3_dashboard`

Issues:

- `CaneTLOTW/e_c3_dashboard#21` — Vehicle-View interactions, preconditioning, vehicle/maintenance popup
- `CaneTLOTW/e_c3_dashboard#22` — Settings and ABRP moved to System view
- Runtime regression check also covers `CaneTLOTW/e_c3_dashboard#5` — LIVE hero vehicle image

Branch: `develop`
Version: `0.5.40`

This document is the authoritative runtime runbook for the next Codex execution. The GitHub Issue handoff comment should only reference this commit/file plus the exact Candidate SHA.

## Non-negotiable workflow

- Develop/deploy from `develop` only.
- `main` stays unchanged until explicit user acceptance.
- Do not squash, rebase or cherry-pick the accepted candidate for promotion.
- `/homeassistant` is intentionally dirty. Never use `reset --hard`, `clean -fd`, broad `restore .`, or equivalent destructive cleanup.
- Touch only package-owned e-C3 runtime files during deployment.
- Do not create a temporary frontend patch or a second Hero implementation.
- Keep exactly one package-owned Lovelace entry resource through `frontend.js`.
- Candidate, Runtime and Validated are different states. Do not claim deployment/validation from GitHub state alone.

## 1. Establish exact Candidate

Before deployment:

1. Fetch/pull `develop` without discarding local work.
2. Verify HEAD is the exact handoff commit referenced by the Issue comment.
3. Verify `custom_components/e_c3_dashboard/manifest.json` reports `0.5.40`.
4. Record:
   - Candidate SHA/version
   - Runtime SHA/version before deploy, if determinable from the actual HA copy
   - current `git status --short --branch` in `/homeassistant`

If the referenced commit cannot be obtained by fast-forward/safe checkout without overwriting intentional local changes, STOP and report the blocker.

## 2. Deploy exact Candidate to Home Assistant

Use the established e-C3 deployment path to synchronize the package-owned runtime files from the exact Candidate into `/homeassistant`.

After copy:

- verify deployed manifest/version from the actual HA files;
- verify frontend/cache version from the actual deployed files;
- restart/reload Home Assistant as required for both Python and frontend code;
- verify the e-C3 config entry loads successfully;
- do not infer Runtime from the current GitHub branch — establish it from the deployed copy.

## 3. LIVE hero / vehicle image — regression check for #5

Test from a fresh browser/app state after HA restart.

1. Open the generated e-C3 dashboard.
2. Navigate to `/vehicle` without first pressing F5.
3. Confirm the large vehicle image is present.
4. Navigate internally several times, e.g. `vehicle -> charging/GPS/system -> vehicle`.
5. Confirm the image remains visible without an F5 dependency and without a black rectangle.

PASS requires that normal internal navigation no longer makes the image disappear. If an initial manual F5 is still required, report the exact sequence and keep `CaneTLOTW/e_c3_dashboard#5` unvalidated.

## 4. Vehicle-view interactions — #21

### Range

Tap the LIVE range badge.

Expected:

- native Home Assistant More-Info opens;
- it targets the mapped `autonomy` entity;
- the HA history plot is available.

### Temperature

Tap the LIVE temperature badge while temperature is actually displayed.

Expected:

- native Home Assistant More-Info opens;
- it targets the mapped `temperature` entity;
- the HA history plot is available.

When charging information replaces temperature in the right badge, there must be no misleading temperature action there.

### Preconditioning

First inspect runtime mapping for:

- `mapped.preconditioning_start`
- `mapped.preconditioning_stop`

Confirm both point to real Home Assistant button entities before judging the action.

Then test:

- tap = Start (`button.press` on mapped start entity)
- hold = Stop (`button.press` on mapped stop entity)

The frontend candidate uses Home Assistant's `perform-action` / `perform_action` contract with `target.entity_id`.

If Start/Stop fails, collect the exact sanitized error and determine whether the failure is:

- e-C3 dashboard mapping/action,
- Home Assistant service execution,
- upstream `stellantis_vehicles`, or
- Stellantis remote backend/API.

Do not fake success or add a runtime-only workaround.

## 5. Vehicle and maintenance popup — #21

Open the LIVE information popup.

Expected order:

1. **Wartung**
2. **Fahrzeug**

Confirm:

- the former separate `Fahrzeuginformationen` card is gone from the main vehicle section;
- vehicle information is present in the combined popup;
- available public `vehicle_info` fields render there.

### Diagnose missing maintenance data

If maintenance remains empty, inspect the actual `sensor.*vehicle_information` entity and its attributes.

Backend support already exists through the optional maintenance path (`get_vehicle_maintenance` -> public maintenance info -> vehicle information sensor). Determine whether:

- the upstream method exists;
- the call returns data, an empty payload or an error;
- maintenance attributes reach the HA entity.

If Stellantis/upstream provides no maintenance data, `—`/not available is correct. Do not invent values. If attributes exist but the popup omits them, report as an e-C3 frontend bug.

## 6. System view — #22

In `/vehicle` verify there is no separate:

- Einstellungen section
- ABRP section

In `/system` verify both are present and still functional, including the existing relevant controls such as:

- refresh/update interval
- battery correction
- ABRP sync/live-data controls
- ABRP token control/info

No functionality should be lost by the move.

## 7. Result contract

Post the result to `CaneTLOTW/e_c3_dashboard#21` under:

`## Codex → ChatGPT Ergebnis`

Cross-reference `CaneTLOTW/e_c3_dashboard#22` where appropriate.

Minimum result:

```text
Candidate SHA/version: <sha> / 0.5.40
Runtime before deploy: <sha/version or UNKNOWN>
Runtime after deploy: <sha> / 0.5.40
served frontend/cache version: <version>
HA restart/load: PASS|FAIL
LIVE image cold start: PASS|FAIL
LIVE image internal navigation: PASS|FAIL
Range More-Info/history: PASS|FAIL
Temperature More-Info/history: PASS|FAIL
Preconditioning Start: PASS|FAIL + exact cause if failed
Preconditioning Stop/Hold: PASS|FAIL + exact cause if failed
Maintenance popup order: PASS|FAIL
Maintenance data source: PRESENT|UPSTREAM_EMPTY|ERROR|UNKNOWN
Separate vehicle-info card removed: PASS|FAIL
Settings/ABRP in System: PASS|FAIL
Browser/HA logs: <relevant sanitized findings>
Validated SHA/version: <sha/version or NOT_VALIDATED>
```

Also report any intentionally remaining local modifications in `/homeassistant`.

## STOP

After deployment, runtime tests and result comment:

- STOP.
- Do **not** update `main`.
- Do **not** close #21/#22 based only on static tests.
- Do **not** mark #5 validated if the browser still needs an F5 to obtain/retain the Hero image.

ChatGPT + user will review the runtime result and decide follow-up or exact fast-forward promotion.