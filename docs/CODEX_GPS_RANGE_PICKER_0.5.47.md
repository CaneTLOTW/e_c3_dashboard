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
- Important: 0.5.46 contains the notification rework from
  `CaneTLOTW/e_c3_dashboard#23`, but its runtime acceptance is still blocked.
  During the first controlled restart HA became unreachable; Codex restored the
  previous eC3 runtime package and intentionally did not issue further blind
  restarts.

Do not describe 0.5.46 or 0.5.47 as runtime-validated until the exact SHA is
actually running and the checks below have passed.

## Why the native picker is restored this way

The previous eC3 GPS implementation replaced the old range selector with a
package-owned single-day `<input type="date">`. That fixed the full-archive
overlay bug, but regressed multi-day selection and changed the UI.

The desired control is Home Assistant's own Lovelace card:

```yaml
type: energy-date-selection
```

The eC3 date wrapper now instantiates that exact native card and assigns a
dedicated `collection_key` beginning with `energy_`, isolated per eC3 config
entry. The package does not reimplement Home Assistant's day/week/month/custom
range picker.

Do **not** re-enable `ha-map-card`'s `history_date_selection: true` bridge.
There is an open upstream regression for HA 2026.4+ where that bridge no longer
follows the date picker (`nathan-gs/ha-map-card#185`). The eC3 wrapper therefore
reads the same Home Assistant energy collection directly and applies its
`start`/`end` interval itself.

This gives the user the native HA day/week/month/custom-range UX while keeping
the package independent of the broken map-card bridge.

## Canonical implementation

Changed files are intentionally narrow:

- `custom_components/e_c3_dashboard/static/gps-history-card.js`
- `custom_components/e_c3_dashboard/static/gps-history-core.js`
- `custom_components/e_c3_dashboard/static/frontend.js`
- `custom_components/e_c3_dashboard/const.py`
- `custom_components/e_c3_dashboard/manifest.json`
- `tests/gps-history-core.test.mjs`
- `tests/frontend-architecture.test.mjs`
- `tests/dashboard-naming.test.mjs`

No change is intended in:

- the Strategy's vehicle/Hero rendering;
- `vehicle-overview-card.js`;
- loader/bootstrap logic other than cache-version strings;
- notification logic from 0.5.46;
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

The small **All** action beside the native selector does not introduce a
separate map mode. It simply sets the same native HA period collection to:

- start: local midnight of the earliest timestamp in the canonical server GPS
  GeoJSON;
- end: current day.

The standard HA selector should therefore display a custom range after **All**
is selected. Recorder naturally contributes only the history it still retains;
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

## Runtime sequence — account for the 0.5.46 restart blocker

1. **First establish HA health before touching the package.**
   - Port 8123/UI reachable.
   - Supervisor/Core status sensible.
   - Record the currently served eC3 runtime version/SHA if recoverable.
2. If the CLI/API path is working, run `ha core check` before any restart.
3. Take/retain an eC3 package-only rollback copy before sync.
4. Synchronize only `custom_components/e_c3_dashboard` from the exact candidate.
5. Verify the Lovelace package resource is the candidate cache version.
6. Use one controlled reload/restart only if required by the backend platform
   delta inherited from 0.5.46.
7. If HA again becomes unavailable:
   - do not issue repeated blind restarts;
   - capture sanitized Core/Supervisor evidence first where possible;
   - restore only the eC3 package from the known rollback copy;
   - report `BLOCKED_RUNTIME` and STOP.

If 0.5.46 can be runtime-validated separately before deploying 0.5.47, do so.
That isolates the notification/backend delta from the GPS frontend delta.

## GPS acceptance

Browser plus HA app where practical:

1. GPS view shows the **native Home Assistant period/date-range selector**, not
   the old eC3 single-day browser `<input type="date">`.
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

Post to `CaneTLOTW/e_c3_dashboard#16`:

```md
## Codex → ChatGPT Ergebnis

### Candidate
- exact SHA / version

### Runtime
- exact SHA / version actually served
- HA health/restart result

### Validated
- repository checks
- native date-range selector
- day/range/All behavior
- Recorder/server range synchronization
- current marker
- browser/app result

### Blocker
- only if applicable
```

STOP after reporting. Do not update `main` until explicit user PASS.
