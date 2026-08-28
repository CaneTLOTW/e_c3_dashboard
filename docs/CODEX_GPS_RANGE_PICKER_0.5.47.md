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
  `CaneTLOTW/e_c3_dashboard#23`.

Do not describe 0.5.46 or 0.5.47 as runtime-validated until the exact SHA is
actually running and the functional checks below have passed.

## Important 0.5.46 startup correction included in 0.5.47

0.5.45 used notification Store major version **1**. 0.5.46 changed
`_STORE_VERSION` to **2**, although its new notification settings/markers are
backwards-compatible and are already populated with `setdefault()` during
initialization. Home Assistant's `Store` requires a migration callback when the
major version changes; without one an existing v1 store cannot be loaded.

0.5.47 therefore deliberately keeps `_STORE_VERSION = 1` and adds a regression
test. Do not delete or manually rewrite the user's notification Store. The
existing v1 file should load and gain missing keys through the normal
initialization path.

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
The eC3 wrapper reads the same Home Assistant energy collection directly and
applies its `start`/`end` interval itself.

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

The small **All** action beside the native selector sets the same native HA
period collection to:

- start: local midnight of the earliest timestamp in the canonical server GPS
  GeoJSON;
- end: current day.

Recorder naturally contributes only history it still retains; server history
contributes the complete available canonical GPS archive.

## Repository validation

Before runtime deployment, run the normal repository checks from `AGENTS.md`:

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

## Runtime procedure — intentionally simple

Do **not** use direct `8123`, MCP, Supervisor, registry, Core-health, CLI-token,
or similar helper checks as deployment gates. They are not part of the eC3
acceptance and have repeatedly interrupted otherwise normal deployment work.

Use the same simple procedure as for previous successful eC3 updates:

1. Take/retain an eC3 package-only rollback copy.
2. Synchronize only `custom_components/e_c3_dashboard` from the exact candidate.
3. Verify the Lovelace package resource is
   `/e_c3_dashboard/frontend.js?v=0.5.47`.
4. Perform **one normal Home Assistant Core restart** because this candidate
   includes Python/platform changes.
5. A restart request may itself time out when Core goes down. Do not interpret
   that as a failed restart.
6. Wait a normal startup interval before continuing. Do not poll LAN port 8123,
   MCP, Supervisor, registry state, or management APIs as an acceptance gate.
7. Continue with the actual eC3 functional acceptance below.
8. If Home Assistant genuinely does not come back for the user, then the restart
   failed. At that point diagnose/recover normally. Do not invent a separate
   `RUNTIME_STATUS_UNCERTAIN` or transport-health state just because Codex cannot
   reach one of its helper endpoints.
9. No repeated restart loop. No rollback merely because a Codex-side helper
   probe is unavailable.

In short: restart once, wait, then test the eC3 functionality. If HA really does
not start, that is a real failure; otherwise helper-probe reachability is
irrelevant.

## Notification/backend smoke acceptance inherited from `CaneTLOTW/e_c3_dashboard#23`

After Home Assistant has restarted, check the eC3 functionality itself:

1. e-C3 config entry is loaded; no false "Einrichtung erforderlich" state after
   entities settle.
2. Existing notification switches/state survive the upgrade.
3. New package-owned number/time controls exist.
4. Existing v1 notification Store loads without migration exception.
5. No push or wake-up is triggered merely by deployment/restart.

Do not manufacture a real warning condition just for this acceptance run.

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
- exact SHA / version actually deployed
- one Core restart performed

### Validated
- repository checks
- notification Store/platform smoke test
- native date-range selector
- day/range/All behavior
- Recorder/server range synchronization
- current marker
- browser/app result

### Blocker
- only a real functional/runtime blocker
```

STOP after reporting. Do not update `main` until explicit user PASS.
