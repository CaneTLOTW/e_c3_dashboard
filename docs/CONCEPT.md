# Architecture concept: e-C3 Dashboard

## Purpose

`e_c3_dashboard` is a Home Assistant custom **integration** distributed through HACS. It is not a copied Lovelace YAML bundle and it is not a replacement for the upstream Stellantis integration.

The package turns a configured Stellantis vehicle into a portable Home Assistant experience consisting of:

- one generated multi-view dashboard per config entry;
- package-owned derived/canonical history and controls;
- a reusable compact vehicle-overview card for other dashboards.

## Upstream boundary

[Stellantis Vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles) remains solely responsible for:

- authentication;
- Stellantis API/MQTT communication;
- native vehicle entities;
- upstream polling/update behavior;
- native remote commands.

`e_c3_dashboard` never calls the Stellantis API directly and does not import private upstream Python implementation code. It consumes only Home Assistant entities belonging to the vehicle selected during config flow.

This boundary is deliberate: a dashboard update must not become an alternative Stellantis client or increase vehicle polling.

## Config-entry and vehicle mapping model

Each e-C3 config entry stores a selected upstream Home Assistant device plus a stable local slug. Mapping is resolved from the selected device's entity-registry entries rather than guessed from VIN-prefixed entity IDs.

Every config entry owns its own:

- dynamic upstream mapping;
- generated dashboard;
- derived sensors and controls;
- metrics/session state;
- canonical server-history store;
- notification/wake-up state.

This provides multi-vehicle support without relying on dashboard order or household-specific entity names.

## User experience

```text
HACS custom repository
  → install e-C3 Dashboard
  → Home Assistant restart
  → Settings / Devices & services / Add integration
  → select configured Stellantis vehicle and modules
  → dedicated e-C3 dashboard appears
  → optional compact card can be added to another dashboard
```

The normal setup does not require copying VINs, raw entity IDs or dashboard YAML.

## Generated dashboard

The current generated view order is:

1. Vehicle
2. Charging
3. Statistics
4. Trips
5. GPS
6. Wake-up
7. Notifications
8. System

The separation is intentional:

- **Vehicle / LIVE** contains current state and the most relevant recent activity;
- **Charging**, **Trips** and **GPS** own detailed history;
- **Statistics** owns aggregates/long-term metrics;
- **Wake-up** owns reachability actions;
- **Notifications** owns communication policy and diagnostics;
- **System** owns integration/runtime administration.

The generated LIVE hero and the standalone compact card share one canonical `vehicle-overview-card` implementation.

## Frontend resource model

Home Assistant knows exactly **one** package-owned Lovelace resource:

```text
/e_c3_dashboard/frontend.js
```

That entry point:

1. installs the narrowly scoped ha-map-card picture-marker compatibility hook;
2. loads package-owned history/overview cards as ES modules;
3. verifies required third-party custom elements;
4. loads the Community Dashboard strategy.

Internal package modules are not independently registered as Lovelace resources. This avoids resource-order races and keeps browser cache invalidation tied to one frontend version.

Historical resource URLs such as `map-marker-fix.js`, `gps-history-fix.js`, old card resources and the former strategy entry remain only in the backend legacy-resource cleanup list. They are migration targets, not current architecture.

## Third-party Lovelace dependencies

The generated dashboard deliberately depends on maintained HACS cards instead of vendoring them:

- Bubble Card
- Button Card
- ha-map-card
- layout-card

Config flow performs a best-effort registered-resource preflight. The frontend performs the definitive browser-side custom-element readiness check before generating the normal dashboard views.

## Dashboard creation and ownership

After successful setup, the integration creates one dedicated storage dashboard for the config entry and records its ownership marker. The strategy configuration contains the explicit config-entry ID, so the frontend does not guess which vehicle belongs to the dashboard.

The package does not treat arbitrary user dashboards as disposable package state. A user-created dashboard is never globally replaced just because the e-C3 integration reloads.

## Data model

### Upstream current state

Battery SOC, range, mileage, climate state, tracker position, charging state, service-battery values and remote-command entities remain upstream Stellantis entities. Their accuracy and refresh cadence are defined by the upstream integration/API.

### Canonical server history

The package maintains retained canonical history for Stellantis trip/charge data. Canonical processing can add normalization, quality classification and derived fields while preserving the retained raw source record.

Trip quality rules cross-check available distance, duration, speed and odometer evidence. Severe invalid rows do not feed statistics. If a zero/sentinel start mileage can be repaired from sufficiently strong continuity evidence, only the **derived canonical boundary** is repaired; raw source values remain unchanged and repair provenance is recorded.

### Recorder history

Home Assistant Recorder is still used for HA-side state history, especially detailed tracker history and other local timeline reconstruction. The configured “history window” is a query/display boundary, not a Recorder retention setting.

### Package stores

Restart-safe package stores retain:

- local trip/charge sessions and derived metrics;
- canonical server history and observed charge archive data;
- notification switches, settings, markers and wake-up diagnostics.

Stores are namespaced by config entry/slug and are not user-created helpers.

## Derived values and quality

The package distinguishes direct values from estimates:

- odometer deltas can provide high-quality distance once the delayed upstream mileage update arrives;
- SOC × capacity energy is an estimate;
- SOC/time charging power is an estimate;
- charge curves reconstructed from sparse SOC samples are historical orientation, not charger-meter traces;
- server GPS start/stop points are not claimed to be a complete driven route.

The frontend/entity attributes preserve these distinctions rather than manufacturing false precision.

## Long-term statistics

Statistics view data can include Home Assistant long-term statistics for mileage/SOH sources. The package does not silently rewrite malformed existing LTS history.

A confirmed case where Home Assistant `sum` reset while odometer `state` remained monotonic is tracked separately in GitHub Issue #25. That problem is different from canonical trip continuity and is not a reason to add a generic vehicle odometer guard.

## Notifications and wake-up

Notification and automatic wake-up behavior is opt-in.

The integration provides:

- notification master/topic switches;
- explicitly selected recipient switches;
- package-owned Number settings for thresholds/delays;
- package-owned Time settings for quiet hours;
- manual wake-up and notification-test buttons;
- persisted episode/diagnostic state.

Vehicle recovery requires a proven fresh vehicle heartbeat; command `accepted`/`forwarded` alone is never treated as recovery. Quiet-hours availability warnings are deferred rather than discarded. Charge-start end-time logic prefers a valid upstream end time and only falls back to a defensible local estimate.

Focused real-event QA remains tracked in Issue #23.

## Remote capabilities

An upstream command entity being present does not prove the selected vehicle supports the physical action. The dashboard therefore keeps native availability/command results intact and does not run automatic capability tests.

The tested ë-C3 capability interpretation is documented in `STELLANTIS_EC3_CAPABILITY_MATRIX.en.md`.

## Compatibility and migration

The backend checks the installed upstream integration version and required entity mapping. Existing config entries switch to a clear compatibility state rather than guessing unknown entities after an incompatible upstream change.

Migration compatibility intentionally includes:

- cleanup of historical e-C3 Lovelace resource registrations;
- recognition of the legacy automatic-dashboard strategy identifier;
- backwards-compatible package Store data where practical.

Legacy cleanup constants are therefore not dead code merely because the old frontend files no longer exist.

## Privacy

The repository must never contain household-specific VINs, account/customer IDs, exact GPS history, Notify recipient names, credentials, tokens or raw private exports.

Vehicle-specific values may exist at runtime inside the user's Home Assistant instance. Public documentation/screenshots must redact those values opaquely.

## Development and release model

All source, test and documentation changes are prepared on `develop`. The designated acceptance instance may run an exact `develop` SHA. `main` remains the last accepted publishable state.

Only the exact validated SHA is fast-forwarded to `main` after maintainer/user acceptance; no squash, rebase or cherry-pick is used for stable promotion. See `BRANCH_AND_DEPLOYMENT_WORKFLOW.md` and `RELEASE_CHECKLIST.md`.
