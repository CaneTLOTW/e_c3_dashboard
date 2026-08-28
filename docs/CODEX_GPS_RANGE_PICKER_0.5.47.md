# Codex runtime handoff — GPS range picker 0.5.47

## Scope

Repository: `CaneTLOTW/e_c3_dashboard`

Primary work item: `CaneTLOTW/e_c3_dashboard#16`

This candidate restores the Home Assistant-native period/date-range selector for
GPS history and makes the same selected interval drive both history sources:

1. the real vehicle track from Home Assistant Recorder; and
2. the canonical Stellantis server-trip GeoJSON overlay.

It also keeps an explicit **All** action for the complete available GPS archive.

## Baselines

- Accepted `main`: `ba1f59650fd670b613c5073f4b8f99d9a10c9fdc` / 0.5.45.
- Parent `develop` before this GPS delta:
  `2f00e3442c0fc8e19e7cb8414856a163c3ade7b5` / 0.5.46.
- 0.5.46 contains the notification rework from
  `CaneTLOTW/e_c3_dashboard#23`, but Codex could not complete its runtime
  acceptance: after the first controlled restart Home Assistant stopped
  responding through Codex's management/transport paths and Codex restored the
  previous package rather than issuing blind restart loops.

Do not describe 0.5.46 or 0.5.47 as runtime-validated until the exact SHA is
actually running and the checks below have passed.

## Important 0.5.46 startup correction included in 0.5.47

The restart blocker exposed one concrete compatibility defect in the 0.5.46
source that must be removed before another runtime attempt.

0.5.45 used notification Store major version **1**. 0.5.46 changed
`_STORE_VERSION` to **2**, although its new notification settings/markers are
backwards-compatible and are already populated with `setdefault()` during
initialization. Home Assistant's `Store` requires a migration callback when the
major version changes; without one an existing v1 store cannot be loaded.

0.5.47 therefore deliberately keeps `_STORE_VERSION = 1` and adds a regression
test. This is a source-level correction based on Home Assistant's Store
contract. It is a plausible contributor to a failed e-C3 config-entry setup,
but a config-entry setup exception by itself is not evidence that the complete
HA HTTP service has failed.

Do not delete or manually rewrite the user's notification Store. The existing
v1 file should load and gain missing keys through the normal initialization
path.

## Why the native picker is restored this way

The old working KFZ dashboard used exactly:

```yaml
type: energy-date-selection
```

The interim eC3 GPS implementation replaced that Home Assistant control with a
package-owned single-day `<input type="date">`. That fixed the full-archive
overlay bug, but regressed multi-day selection and changed the UI.

The eC3 date wrapper now instantiates the same native HA
`energy-date-selection` card again and assigns a dedicated `collection_key`
beginning with `energy_`, isolated per eC3 config entry. The package does **not**
reimplement Home Assistant's day/week/month/custom-range picker.

Do **not** re-enable `ha-map-card`'s `history_date_selection: true` bridge.
There is an upstream regression for HA 2026.4+ where that bridge no longer
follows the date picker (`nathan-gs/ha-map-card#185`). The eC3 wrapper therefore
reads the same Home Assistant energy collection directly and applies its
`start`/`end` interval itself.

This restores the familiar native HA period selector while avoiding the broken
map-card date bridge.

## Canonical implementation

Changed files for the GPS feature are intentionally narrow:

- `custom_components/e_c3_dashboard/static/gps-history-card.js`
- `custom_components/e_c3_dashboard/static/gps-history-core.js`
- `custom_components/e_c3_dashboard/static/frontend.js`
- `custom_components/e_c3_dashboard/const.py`
- `custom_components/e_c3_dashboard/manifest.json`
- `tests/gps-history-core.test.mjs`
- `tests/frontend-architecture.test.mjs`
- `tests/dashboard-naming.test.mjs`

The inherited 0.5.46 startup compatibility correction additionally touches:

- `custom_components/e_c3_dashboard/notifications.py`
- `tests/notification-storage.test.mjs`

No change is intended in:

- the Strategy's vehicle/Hero rendering;
- `vehicle-overview-card.js`;
- loader/bootstrap logic other than cache-version strings;
- notification behavior/threshold logic beyond Store compatibility;
- GPS backend/store contents;
- canonical trip history.

### Range contract

For every selected HA period:

- the real tracker gets `history_start` and `history_end` for the same range;
- the server GeoJSON is filtered in-memory with the same range;
- the canonical server history remains untouched;
- if the selected interval includes today, its display end is clamped to `now`;
- the current vehicle marker stays visible independently of the historical
  interval.

### All-history action

The small **All** action beside the native selector does not introduce a second
map mode. It sets the same native HA period collection to:

- start: local midnight of the earliest timestamp in the canonical server GPS
  GeoJSON;
- end: current day.

The standard HA selector should therefore display a custom range after **All**
is selected. Recorder naturally contributes only history it still retains;
server history contributes the complete available canonical GPS archive.

## Repository validation

Before runtime deployment, run the full checks from `AGENTS.md`, especially:

```sh
python3 -m py_compile custom_components/e_c3_dashboard/*.py
node --check custom_components/e_c3_dashboard/static/frontend.js
node --check custom_components/e_c3_dashboard/static/e_c3_dashboard.js
node --check custom_components/e_c3_dashboard/static/gps-history-card.js
node --check custom_components/e_c3_dashboard/static/gps-history-core.js
node --test tests/*.test.mjs
python3 -m json.tool custom_components/e_c3_dashboard/manifest.json
git diff --check
```

Also confirm GitHub Validate is fully green for the exact candidate SHA.

## Runtime control policy — HA health vs. Codex transport

The previous attempts were over-constrained by Codex-side transport checks.
`192.168.20.10:8123`, HA-MCP and a Supervisor/management API are useful probes,
but they are **not interchangeable with the user's actual Home Assistant UI**.
A failed probe from Codex can mean that Codex's network/proxy path is unavailable
while Home Assistant itself is healthy.

Likewise, a management call that triggers `ha core restart` can time out because
the service intentionally disappears while the request is still open. Such a
timeout is evidence that the control connection was interrupted, **not** by
itself that the restart failed.

Therefore use this policy:

1. **Before sync/restart**, record at least one available health signal. Prefer
   the user's currently working HA UI/app or HA-MCP/API. Direct TCP/8123 from the
   Codex execution environment is diagnostic only; do not make it a mandatory
   gate when that network path is known to be unreliable.
2. `ha core check` / Supervisor status are useful when available, but missing
   CLI API credentials are not by themselves a deployment blocker.
3. Take an eC3 package-only rollback copy, then synchronize only
   `custom_components/e_c3_dashboard` from the exact candidate.
4. Verify the Lovelace package resource is
   `/e_c3_dashboard/frontend.js?v=0.5.47`.
5. If the inherited Python/platform delta requires a Core restart, issue
   **exactly one** controlled restart and record the timestamp. Treat an immediate
   timeout from the restart call as expected/indeterminate, not as FAIL.
6. **Do not mutate or roll back package files while Core is still in an unknown
   restarting state.** Wait at least 90 seconds before making a failure
   decision. During that interval only passive probes are allowed.
7. After 90 seconds, poll passive health signals every roughly 15–30 seconds for
   up to 5 minutes. Any of the following is sufficient evidence that Core is
   back:
   - user can open the HA UI/app;
   - HA-MCP/API responds normally;
   - Supervisor reports Core running;
   - the served eC3 resource/dashboard can be opened.
8. A Codex-side `8123 timeout` or MCP `502` alone is **not** a rollback trigger,
   especially during the restart window. If the user can access HA normally,
   classify the failed probe as `CODEX_TRANSPORT_LIMITATION` and continue the
   functional acceptance.
9. If after 5 minutes Codex still has no authoritative signal, report
   `RUNTIME_STATUS_UNCERTAIN` and ask the user whether HA is reachable. Do not
   overwrite the package merely because Codex cannot see the LAN endpoint.
10. Roll back only with affirmative evidence that Core did not recover, for
    example the user confirms the UI/app is down, Supervisor reports Core
    stopped/crashed, or startup logs show a blocking exception. Before rollback,
    capture the relevant sanitized evidence if possible.
11. If rollback is genuinely required, restore only the eC3 package and perform
    at most one deliberate Core start/restart through a known working control
    path. No blind restart loop.

This policy supersedes the earlier requirement that direct 8123 reachability
from Codex is itself an acceptance condition.

## Notification/backend smoke acceptance inherited from #23

Before judging GPS, first prove that the 0.5.46 backend delta now starts safely:

1. Home Assistant is usable after the restart according to at least one
   authoritative health signal above.
2. e-C3 config entry reaches loaded/ready state; no false "Einrichtung
   erforderlich" page after entities settle.
3. Existing notification switches/state survive the upgrade.
4. New package-owned number/time controls exist.
5. Existing v1 notification Store loads without migration exception.
6. No push or wake-up is triggered merely by deployment/restart.

Do not attempt to manufacture a real warning condition just for this GPS
acceptance run.

## GPS acceptance

Browser plus HA app where practical:

1. GPS view shows the **native Home Assistant period/date-range selector**, not
   the interim eC3 single-day browser `<input type="date">`.
2. Day selection works.
3. A free multi-day range (for example 2–3 days) works.
4. Native presets such as week/month work if offered by the installed HA
   frontend.
5. Blue Recorder history and orange server geometry always follow the exact
   same selected interval.
6. A day/range view never silently shows the complete server archive.
7. **All** expands the same selector to the complete available GPS archive.
8. Current vehicle marker remains visible.
9. Switch day → range → All → today without browser reload.
10. Navigate away/back and confirm the GPS controls and map remain functional.
11. No canonical history/store data is deleted or truncated.

Do not put screenshots containing coordinates, GPS tracks or private vehicle
data into the repository or Issue.

## Result format

Post backend/notification findings to `CaneTLOTW/e_c3_dashboard#23` and GPS
acceptance to `CaneTLOTW/e_c3_dashboard#16`. The same exact candidate SHA must
be named in both.

```md
## Codex → ChatGPT Ergebnis

### Candidate
- exact SHA / version

### Runtime
- exact SHA / version actually served
- restart timestamp/result
- authoritative HA health signal(s)
- Codex transport status separately
- e-C3 config-entry result

### Validated
- repository checks
- notification Store/platform smoke test
- native date-range selector
- day/range/All behavior
- Recorder/server range synchronization
- current marker
- browser/app result

### Blocker
- only if applicable; distinguish `CODEX_TRANSPORT_LIMITATION`,
  `RUNTIME_STATUS_UNCERTAIN`, and actual `BLOCKED_RUNTIME`
```

STOP after reporting. Do not update `main` until explicit user PASS.
