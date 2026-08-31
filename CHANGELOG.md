# Changelog

All notable user-facing changes to e-C3 Dashboard are recorded here.

This project uses semantic package versions and keeps `develop` as the integration/acceptance branch while `main` represents the last accepted publishable state.

## Unreleased

### Documentation

- Removed superseded version-specific bug notes, Codex runbooks, migration matrices and temporary forensic handoff documents from the current repository tree. Their history remains available through Git.
- Consolidated still-open notification QA and Home Assistant LTS work into GitHub Issues #23 and #25 as the canonical work records.
- Refreshed the README, architecture concept, installation guide, entity catalog, notification guide and release checklist to match the current 0.5.53 architecture.
- Added a clear third-party trademark/affiliation notice and contributor rules that keep manufacturer names descriptive and avoid unlicensed official logos, badges or promotional artwork.

No runtime behavior changes are included in this documentation cleanup.

## 0.5.53 — 2026-08-30

### Added

- Generated multi-view dashboard with dedicated Vehicle, Charging, Statistics, Trips, GPS, Wake-up, Notifications and System views.
- Reusable `custom:e-c3-dashboard-vehicle-overview-card` for existing dashboards, sharing the canonical LIVE hero implementation.
- Canonical Stellantis trip history with server-history synchronization, zero-distance event retention and explicit data-quality metadata.
- Canonical/persistent charging history with observed sessions, SOC/time curves and reconstructed fallback windows where source data permits.
- Server-trip GPS start/stop history alongside Home Assistant Recorder history and the separate current vehicle position.
- Package-owned notification thresholds/delays (`number` entities), quiet hours (`time` entities), explicit recipient controls and notification/reachability diagnostics.
- Manual server-history synchronization, manual wake-up and notification test buttons.
- Long-term-statistics presentation for available mileage/SOH metrics and trailing 500-km consumption.
- German and English integration/frontend localization and a portable multi-vehicle config-entry model.

### Changed

- Consolidated all package frontend loading under one Home Assistant Lovelace resource: `/e_c3_dashboard/frontend.js`. Internal cards/strategy are ES modules loaded by that entry point.
- Separated current Vehicle/LIVE information from detailed historical views and kept package administration in System.
- Notification recipient discovery is selection-only; newly discovered `notify.*` services are never silently opted in.
- Reachability uses proven vehicle freshness, preferring the temperature/source heartbeat, instead of the newest timestamp among arbitrary static mapped entities.
- Charge-start ETA logic prefers a valid upstream charge-end time, then an active configured charge limit, otherwise 100%; local fallback estimates use only recent plausible active-charge power samples.
- Trip-derived metrics consume canonical quality-controlled history rather than trusting every raw server row.

### Fixed

- LIVE vehicle image/layout lifecycle and browser reload races while retaining a single canonical overview-card implementation.
- GPS date/range filtering so Recorder history and canonical server geometry use a coherent selected time window.
- Charging-session selection/navigation and stale charge-power display behavior.
- Trip finalization/continuity behavior around delayed odometer updates and consecutive short drives.
- Impossible server-trip presentation/data-quality handling so severe outliers are not treated as plausible statistics input.
- Canonical odometer continuity repair for a retained raw trip with a zero/sentinel start mileage: raw source remains unchanged, while sufficiently supported derived continuity can be repaired and annotated with provenance.
- Notification Store compatibility by retaining the existing backwards-compatible Store major version.
- Package/entity naming, notification settings visibility and current view structure.

### Known limitations

- SOC-derived energy, charging power and consumption remain estimates, not meter-grade measurements.
- Stellantis position history can be sparse and server-trip geometry may contain only start/stop points rather than a complete driven route.
- A malformed pre-existing Home Assistant long-term-statistics `sum` history is not silently rewritten by the integration. The confirmed mileage-statistics reset repair remains tracked in Issue #25.
- Full real-event functional QA for recipients, quiet hours, heartbeat outage/recovery and charge-start notifications remains tracked in Issue #23; the current UI/settings presentation is already accepted.

Earlier development details remain available in Git history and closed GitHub Issues instead of being duplicated as permanent version-specific runbooks in `docs/`.
