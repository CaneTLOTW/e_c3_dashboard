# GPS history: server archive overlay ignores selected date

Status: implementation prepared on `develop` for runtime validation.

## Symptom

The GPS view date selector can be set to a single day, but the orange Stellantis server-trip overlay continues to draw start/stop lines from the complete canonical trip archive. The selected-day HA Recorder route briefly/independently appears, while the orange archive remains visible.

No user screenshot is stored in this repository because the evidence contains private GPS coordinates and travel tracks.

## Root cause

Commit `7ebaed681817566a8aba8ccca2c07051992336c0` added `Ec3ServerGpsHistorySensor` and a `geojson` attribute built from all `canonical_trips` with non-zero distance. The dashboard adds that entire GeoJSON collection as an always-present orange map entity. The Home Assistant date selector affects the Recorder history layer, but it is not applied to the server GeoJSON overlay.

Therefore the current result is internally inconsistent: blue/Recorder data is date-scoped, orange/server data is archive-scoped.

There is also a compatibility problem in the implicit `energy-date-selection` → `ha-map-card history_date_selection` path on current Home Assistant/map-card combinations. The runtime symptom that a selected route appears briefly and the mixed GeoJSON/history view then changes again is consistent with relying on that implicit contract. The portable integration must not require this fragile coupling for correctness.

## Required behavior

The primary GPS map must use one coherent selected time window. When the user selects a day:

- Recorder route points/lines are filtered to that day;
- server start/stop positions and approximate connecting lines are filtered to the same day;
- old archive trips must not remain permanently visible behind the selected-day route;
- current position remains visible;
- canonical server history remains complete and untouched.

An optional future explicit `Gesamtes Fahrtenarchiv` mode may show the full server archive, but it must be deliberate and visually separate from the date-scoped default.

## Prepared implementation – 0.5.34 candidate

The fix deliberately filters **presentation only** and does not delete, truncate or duplicate canonical trip data.

### `static/gps-history-core.js`

Pure date/filter helpers:

- local `YYYY-MM-DD` date keys;
- no future-day selection;
- selected local-day start/end window;
- today uses `now` as the open end;
- GeoJSON features are retained only when their `start_time`/`end_time` overlap the selected window.

### `static/gps-history-fix.js`

Package-owned compatibility layer installed before the dashboard strategy is generated:

1. replaces the generic `energy-date-selection` in the e-C3 GPS view with `custom:e-c3-dashboard-gps-date-card`;
2. stores the selected day per e-C3 config entry in browser `sessionStorage`;
3. wraps the generated `custom:map-card` in `custom:e-c3-dashboard-gps-map-card`;
4. supplies explicit `history_start`/`history_end` to the real vehicle tracker so Recorder history uses the selected day;
5. supplies a shallow, display-only HA-state view to the nested map card in which only the server GPS entity's `geojson` attribute is filtered;
6. keeps the actual backend `Ec3ServerGpsHistorySensor`, canonical trip store and Recorder database unchanged;
7. disables the map card's implicit global `history_date_selection` coupling for this view.

This also prevents the server GeoJSON entity from inheriting the tracker's history query. Recorder history is requested only for the real tracker; server geometry remains a current-state attribute whose displayed FeatureCollection is date-filtered client-side.

## Validation

Static tests:

- `node --check custom_components/e_c3_dashboard/static/gps-history-core.js`
- `node --check custom_components/e_c3_dashboard/static/gps-history-fix.js`
- `node --test tests/gps-history-core.test.mjs`
- full existing `node --test tests/*.test.mjs`

Runtime acceptance:

1. open GPS view on today;
2. confirm no old orange archive routes remain;
3. select previous day and confirm both blue Recorder history and orange server start/stop geometry move to that day;
4. switch back to today;
5. confirm current vehicle marker remains visible;
6. reload/navigate away and back; selected day may persist for the browser session but must never alter stored trip history;
7. confirm no whole-archive data has been deleted from Trips/server history.

## Acceptance

- Selecting one day shows only that day's server-trip geometry plus that day's Recorder geometry.
- Changing the day updates both sources together.
- No permanent full-archive orange overlay in normal GPS history view.
- Current position remains visible.
- Canonical/archive data remains complete.
- No private GPS evidence is committed to the repository.
