# Changelog

All notable user-facing changes are recorded here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and uses [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- Added canonical Stellantis trip history with paginated server synchronisation,
  server-trip IDs, zero-distance event retention, SOC-based energy fallbacks and
  vehicle metadata.
- Added canonical charge history that combines split Home Assistant/Recorder
  charging sessions with SOC-rise windows between server trips. Reconstructed
  windows retain their standstill interval without inventing charging duration,
  power, type or a curve.
- Added restart-safe charge samples with Stellantis source timestamps,
  received-time fallbacks, residual-energy priority and compact curve samples
  for the frontend.
- Added a manual server-history synchronisation button and a dedicated trip
  history view using the canonical server data.
- The Vehicle view now uses a compact trip-history filter preset: last 30 days,
  trips up to 1 km hidden and zero-distance events hidden. The full Trips view
  retains the complete filter controls.
- Added a persistent observed-charge archive. Recorder data is refreshed within
  90 days but appended to the local server-history Store, so older observed
  sessions and their SOC samples remain available after Recorder expiry.
- Expanded the full Trips view with a larger scroll window and incremental
  client-side loading of older server trips. The view now keeps the complete
  server history available instead of stopping at a 250-row display limit.
- Added a server-trip GeoJSON overlay to the GPS view. Historical Stellantis
  start/stop positions are shown alongside HA Recorder history; connecting
  lines are explicitly marked as start/stop approximations.
- Moved the server-history sync action into the full Trips view and aligned it
  with the standard dashboard action-button layout.

- Added a Long-term statistics view for SOH capacity/resistance, odometer
  state and weekly driven distance, plus the rolling 500 km consumption.
  The relevant Vehicle cards now navigate to this view.
- Added a dedicated, localised Functions & usage view explaining dashboard
  interactions, expandable trip rows, charging-session navigation, controls,
  GPS history and the interpretation of estimated values.
- Trip-history rows can be opened directly in place to show start and end
  odometer values, with keyboard support for the expandable detail row.
- A dashboard-card preflight is shown before vehicle selection. It reports the
  registered Lovelace resources for Bubble Card, Button Card, ha-map-card and
  layout-card; the dashboard retains its definitive browser-side module check.
- The Vehicle view now uses the compact, responsive `layout-card` horizontal
  layout from the maintained reference dashboard while retaining portable,
  per-config-entry entity mapping.
- A dedicated e-C3 dashboard is created automatically after a successful
  config-entry setup. It is isolated, per-vehicle, created only once and never
  overwritten or deleted by the package.
- First-start reconciliation for the distance since charge: the package
  derives the last-charge odometer baseline from the upstream **Last charge**
  timestamp plus Recorder history.

### Changed

- Changed all long-term statistics plots from monthly to weekly aggregation
  and hid the value legend below each plot to keep the view compact.

- Raised the integration version to 0.5.8 while retaining the develop
  long-term statistics view alongside the canonical history migration.
- Replaced the oversized package brand asset with a 256×256 local integration
  icon, compatible with Home Assistant's custom-integration Brands API.
- Removed the technical `ready` status badge from the Vehicle view. The
  diagnostic status entity remains available only in the System view.
- Removed the short-lived historic Last trip import. That native sensor is a
  last-result value and Recorder duplicates it after restarts, which can make
  a rolling consumption value look falsely low. Existing imported rows are
  removed automatically.

### Fixed

- Fixed the charge-curve selector being forced back to the first previously
  stored session after every render. The latest charge is now selected by
  default when no explicit history-link selection is present, and changing
  the dropdown updates the displayed curve.

- Fixed stale current charge power after an upstream charging sensor recovered
  from `unavailable` directly to `off`. The active local charge is now
  finalized in that case, its transient power is cleared, and the Vehicle
  charging card shows `-` whenever charging is not active instead of retaining
  the last derived kW value.
- Fixed the vehicle picture marker showing a black square in browser/HA dark
  mode. The e-C3 package now ships a scoped runtime compatibility shim that
  applies `background` and `background-color: transparent !important` directly
  to the `ha-map-card` shadow-DOM picture marker. Only e-C3 markers opt in;
  other `ha-map-card` markers are untouched.
- Fixed the LIVE hero vehicle picture being empty until a browser reload when
  the upstream tracker exposes `entity_picture` only after the Lovelace
  strategy has already rendered. The hero is now tracker-bound and updates
  reactively, including on the initial strategy-registration race, while the
  map-marker transparency workaround remains independent.
- Removed the duplicate Trips view. Trip history remains available in the
  Vehicle view, where it is already part of the latest-activity section.
- The charge-selection query parameter is now removed automatically when the
  dashboard leaves the Charging view, so it does not remain visible on the
  Vehicle, Trips or GPS views.
- The Vehicle view's charging-status card now matches the maintained YAML
  dashboard for unavailable charging type, charge-end and charging-power
  values (`-` and `0 kW` fallbacks, with consistent one-decimal formatting).
- Selected charging sessions are now carried in the charging-view URL as well
  as session storage. This survives Lovelace strategy view reconstruction and
  keeps the selected session deterministic after navigation.
- The charging-session selector now marks the selected option explicitly,
  avoiding the native select element falling back to its first option while
  the detail values already show the requested session.
- Charge-history selection is now reapplied when the charging view was
  already instantiated before navigation. The list sends a scoped selection
  event and the curve browser updates its selected session immediately.
- Vehicle and charging views now share one charging-session reconstruction,
  including historical local-result sensor attributes, stable session IDs and
  explicit handling when a requested session cannot be resolved.
- Charge-history rows now navigate to the charging view through Home
  Assistant's SPA history mechanism (`pushState` plus `location-changed`) after
  persisting the selected session, instead of relying on a manually bubbled
  `hass-navigate` event.
- Trip history now merges the upstream last-trip sensor with the package's
  locally observed trip-result sensor. This preserves a just-finished drive
  when the Stellantis API has not yet published its next last-trip payload.
- Trip-history rows retain metadata when Recorder returns compact state rows
  without repeating unchanged attributes.
- Consecutive short drives no longer merge when the next motor-on event occurs
  before the previous drive's delayed odometer update. Each drive retains its
  motor-off timestamp, SOC endpoint and odometer candidate independently.
- Local trip duration now ends at the motor-off event rather than including
  the post-drive odometer wait.
- Corrected the generated dashboard strategy type and migrate the dashboard
  generated by version 0.4.8 automatically.
- Declare the Lovelace dependency and config-entry-only schema required by the
  automatic dashboard setup.
- Portable configuration flow, entity mapping, Community Dashboard strategy,
  trip/charging/GPS views, local estimates, optional notifications, and
  wake-up diagnostics.
- German and English localisation for setup, dashboard cards, notifications,
  and Logbook messages.
- Release, security, privacy, and contributor documentation.

### Changed

- Removing a config entry now clears only its package-owned persistent metric
  and notification state.
