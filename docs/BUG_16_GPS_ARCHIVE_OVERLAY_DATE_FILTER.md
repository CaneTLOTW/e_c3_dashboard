# GPS history: server archive overlay ignores selected date

Status: confirmed design bug observed in the live Home Assistant dashboard on 2026-08-28.

## Symptom

The GPS view date selector can be set to a single day, but the orange Stellantis server-trip overlay continues to draw start/stop lines from the complete canonical trip archive. The selected-day HA Recorder route briefly/independently appears, while the orange archive remains visible.

No user screenshot is stored in this repository because the evidence contains private GPS coordinates and travel tracks.

## Root cause

Commit `7ebaed681817566a8aba8ccca2c07051992336c0` added `Ec3ServerGpsHistorySensor` and a `geojson` attribute built from all `canonical_trips` with non-zero distance. The dashboard adds that entire GeoJSON collection as an always-present orange map entity. The Home Assistant date selector affects the Recorder history layer, but it is not applied to the server GeoJSON overlay.

Therefore the current result is internally inconsistent: blue/Recorder data is date-scoped, orange/server data is archive-scoped.

## Required behavior

The primary GPS map must use one coherent selected time window. When the user selects a day/range:

- Recorder route points/lines are filtered to that range;
- server start/stop positions and approximate connecting lines are filtered to the same range;
- old archive trips must not remain permanently visible behind the selected-day route.

An optional future explicit `Gesamtes Fahrtenarchiv` mode may show the full server archive, but it must be deliberate and visually separate from the date-scoped default.

## Implementation direction

Prefer filtering the server overlay against the same Lovelace date-selector range rather than deleting server position history. The canonical history/store remains unchanged; only the map projection is date-scoped.

If the current `ha-map-card`/date-selector contract cannot filter a GeoJSON attribute dynamically, a small package-owned date-aware frontend layer or bounded backend response should be used. Do not create a second source of trip truth.

## Acceptance

- Selecting one day shows only that day's server-trip geometry plus that day's Recorder geometry.
- Changing day/range updates both sources together.
- No permanent full-archive orange overlay in normal GPS history view.
- Current position remains visible.
- No private GPS evidence is committed to the repository.
