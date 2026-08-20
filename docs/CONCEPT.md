# Architecture concept: e-C3 Dashboard

## Goal

`e_c3_dashboard` is a HACS **integration**, not a copyable Lovelace YAML
configuration. It creates a reusable, multilingual e-C3 dashboard on top of
the upstream [Stellantis Vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles)
integration.

The upstream integration remains solely responsible for authentication, API
requests, vehicle data and remote commands. This project never calls the
Stellantis API directly and does not import the upstream integration's private
Python code.

## User experience

```text
HACS install
  → Home Assistant restart
  → Settings / Devices & services / e-C3 Dashboard
  → Select connected Stellantis vehicle and modules
  → Dedicated e-C3 dashboard appears in the sidebar
```

No vehicle identification number, raw entity ID or copied YAML is part of the
normal user workflow.

## Required dependencies

The following HACS repositories are intentionally mandatory:

- `andreadegiovine/homeassistant-stellantis-vehicles`
- `Clooos/Bubble-Card`
- `custom-cards/button-card`
- `nathan-gs/ha-map-card`
- `thomasloven/lovelace-layout-card`

HACS cannot automatically install another repository as a transitive
dependency. The setup and dashboard onboarding therefore report missing
dependencies explicitly and do not render partially broken custom-card
configurations.

Dependencies must be functional, not only downloaded. In particular, the user
must complete the upstream Stellantis login and vehicle setup and wait until
Home Assistant exposes the vehicle's battery, mileage and tracker entities.
The config flow enforces that minimum readiness check. The four frontend
dependencies must be loaded as Lovelace resources; a HACS download without a
loaded JavaScript module is still a missing dashboard dependency.

The config flow provides a best-effort early preflight by inspecting the
registered resource URLs. This helps catch a forgotten HACS card before a
vehicle is selected, but cannot prove a browser actually loaded its JavaScript.
The Community Dashboard strategy therefore retains the authoritative
browser-side `customElements` check and shows an explicit setup page rather
than attempting to render a broken dashboard.

## Upstream compatibility

The config flow verifies the locally installed `stellantis_vehicles` manifest
before it accepts a vehicle. The initial supported baseline is version
`2026.7.2`, the version used to establish this dashboard's entity mapping.

It then verifies that the chosen HA device belongs to a live upstream config
entry and exposes a vehicle tracker. These checks do not poll the Stellantis
API. An older, missing or unversioned upstream integration blocks setup; an
existing dashboard switches to a clear compatibility state after a downgrade
instead of rendering unknown entity IDs. Further capability checks are added
per module as the mapping is implemented.

## Package type and frontend

HACS manages this project as one **integration**. Runtime Python and frontend
assets live below `custom_components/e_c3_dashboard/`, satisfying HACS'
single-integration repository structure.

During setup the integration:

1. serves its bundled frontend module from a namespaced static path;
2. registers the module with Home Assistant;
3. registers `custom:e-c3-dashboard` as a Community Dashboard strategy;
4. creates a new storage dashboard once for each completed package setup.

The strategy creates the dashboard's views dynamically. Home Assistant does
not currently expose a public integration API for dashboard creation, so the
package uses the same Lovelace storage path used internally by Home Assistant
and pins that behavior to the supported HA baseline. It never modifies,
replaces, recreates, or removes a user dashboard. A persistent per-entry marker
prevents recreating a dashboard after a user intentionally deletes it. A tiny
YAML strategy dashboard remains a safe local fallback for frontend versions
where the Community Dashboard picker is preferred.

## Vehicle mapping

The config flow stores a selected Home Assistant device ID and a stable,
user-chosen vehicle slug. It verifies that the device belongs to a
`stellantis_vehicles` config entry.

Entity mapping is resolved from the selected device's entity-registry entries,
not guessed from a VIN prefix. Each dashboard config entry owns its own derived
entities, persistent storage, events and services under its slug. This permits
more than one vehicle in a Home Assistant installation: every automatically
created dashboard contains the explicit config-entry ID in its strategy and
therefore never guesses a vehicle from dashboard order.

## Data contract and entity ownership

The package has a strict portability boundary:

- It reads vehicle data only from entities that belong to the selected
  `stellantis_vehicles` device.
- Every calculated value, result row and persistent session record is created
  by `e_c3_dashboard` itself and is namespaced by its config entry.
- It must never reference a household helper, a manually created sensor, or a
  legacy entity from the original dashboard as a fallback.

This applies in particular to trip energy, charge energy, charge power and
their history. New local result entities are intentionally the only source for
those package-derived values:

```text
sensor.<vehicle>_dashboard_last_local_trip_result
sensor.<vehicle>_dashboard_current_charge_power
sensor.<vehicle>_dashboard_last_local_charge_result
```

Upstream Recorder history is used for a bounded, best-effort first-start
reconciliation of the distance since charge: the native **Last charge**
timestamp is paired with the odometer at that time. Trip-energy and rolling
consumption values deliberately start with sessions observed by the package,
because the native **Last trip** sensor is a last-result value rather than a
reliable historic event stream. Rich charge rows, charging curves and future
live sessions likewise begin when the package observes them itself. This
remains portable because only the selected upstream device and the user's own
Recorder are read; no household helper is used.

## Modules

| Module | V1 role | Data retention |
| --- | --- | --- |
| Live vehicle | battery, range, climate, charging, remote status | current state |
| Trips | trip table, drive energy, consumption | Recorder; optional InfluxDB |
| Charging | charge table, AC/DC curves, estimates | Recorder; optional InfluxDB |
| GPS | current location and selectable history map | Recorder |
| Wake-up | manual action, opt-in schedule and activity diagnostics | private store + Logbook |
| Notifications | opt-in vehicle messages via selected Notify services | private store |

Recorder history is required for the history modules. The integration must only
report this prerequisite; it must not alter a user's recorder retention or
database settings. InfluxDB remains optional and is not configured by this
project.

## Local calculations

The existing one-off `stellantis_drive_metrics` implementation is the
functional reference for rolling 500-km consumption and distance since the
last charge. It will be migrated to config-entry based, slugged entities:

```text
sensor.<slug>_average_consumption_500_km
sensor.<slug>_distance_since_last_charge
```

The calculations are now implemented inside the config entry. They listen only to
existing upstream engine/charging state changes, persist a compact local session
cache, wait five minutes after ignition-off for delayed mileage, and do not add
vehicle polling or alter upstream data.

## Implemented V1 dashboard views

The portable core currently creates the following VIN-free views from the
selected device mapping:

- vehicle overview with battery, range, vehicle state, charging, climate,
  remote connection and current map;
- 90-day trip history and local ride-result data;
- 90-day AC/DC charging history reconstructed from Recorder;
- GPS history using the Home Assistant global date selector, recorder-backed
  route lines and points, and the current-position details;
- manual wake-up plus an integration/system diagnostics view.

Trip and charging history cards are bundled under the project's namespaced
static path. They use the browser locale for German/English labels and remain
independent from the original Stellantis vehicle card.

## Bundled Lovelace resources

The strategy, map-marker compatibility shim, trip-history card and
charge-history/curve card are registered as four versioned, package-owned
JavaScript modules. They use package-specific
custom-element names. This prevents a fresh installation from relying on a
similarly named resource that happened to be installed for another dashboard,
and avoids clashes with the original household dashboard.

The same resource set includes `map-marker-fix.js`, a compatibility shim for
the picture-marker shadow DOM used by `ha-map-card`. In dark mode, the upstream
marker can provide a dark fallback background behind a transparent vehicle PNG.
The e-C3 strategy opts its own picture markers in with
`--ec3-transparent-picture-marker: 1`; the shim then sets both `background` and
`background-color` to transparent on the inner `.marker.picture` element.
Existing markers and Lit re-renders are handled, and the patch is idempotent.
Because the patch is package-owned, it does not modify or require a fork of
`ha-map-card` and it does not affect unrelated map markers.

## Reference-view fidelity

The portable vehicle view follows the established e-C3 reference layout:
Live vehicle card, consumption, quick actions, charging and range, vehicle
picture marker map, vehicle details, battery health, recent activities with
both history tables, settings/ABRP, and the standalone GPS history view. The GPS view mirrors the reference's two-column structure: date selector and current coordinates/data age on the left; the selectable Recorder route map on the right. The visual structure, spacing, card
types and marker styling are kept aligned with that reference while every
entity reference is resolved from the selected upstream vehicle or from this
package's own metrics. The original household dashboard itself is never
modified.

## Notifications and wake-up

Notifications are deliberately decoupled from a particular household. The
options flow lists existing Home Assistant `notify` services and lets the user
select zero or more recipients. After installation every package switch
is off: notification master, trip reports, charge reports, alerts, each chosen
recipient, hourly wake-up, charging wake-up, and availability probe. The
strategy renders these package-owned controls in dedicated Notifications and
Wake-up views.

This retains the reference dashboard’s trip/charge reports, low-range,
at-home charging reminder, service-battery, stale-data and recovery messages
without carrying over a person, mobile-app device, Telegram token or household
helper. Marker state and counters are config-entry private storage so one-time
warnings remain stable through restart. See
[`NOTIFICATIONS_AND_WAKEUP.en.md`](NOTIFICATIONS_AND_WAKEUP.en.md).

## Languages

All project-owned dashboard and setup strings are provided in German and
English.

- Backend config/options flows: Home Assistant translation files.
- Backend notifications and Logbook messages: a small Python message catalog,
  rendered in the Home Assistant instance language before they are delivered.
- Dashboard strategy and bundled cards: one frontend translation module. It
  uses the language of the viewing browser/UI (or an explicit card language),
  because standalone Lovelace JavaScript is not automatically connected to
  Home Assistant's backend translation loader.
- Documentation: English README, installation guide, entity catalog, and
  localisation guide.

Home Assistant's selected UI language determines the display language; English
is the fallback. Upstream raw data stays unmodified. New project-owned text
must be added to the applicable catalog rather than embedded in feature logic.

## Privacy and sanitisation

The repository must never include VINs, account/customer IDs, GPS history,
live exports, household recipients or credentials. Its brand artwork is
generic project artwork; it is not a photograph or image of a user's vehicle.
Vehicle-specific images are obtained only from the selected upstream device at
runtime, where available.

## Vehicle-specific remote capabilities

The upstream integration can create generic MQTT command entities for a
vehicle whose actual feature set is narrower. The dashboard therefore must not
equate a mapped button with a confirmed vehicle capability. It leaves native
availability intact, never performs automatic command tests, and documents
the known ë-C3 outcome separately in
[`STELLANTIS_EC3_CAPABILITY_MATRIX.en.md`](STELLANTIS_EC3_CAPABILITY_MATRIX.en.md).

## Supported Home Assistant versions

The first release targets Home Assistant 2026.5 or later because Community
Dashboard strategy discovery is part of the intended installation flow. The
actual minimum version is validated during the first compatibility test matrix.

## Release model

Before the first public HACS release, the repository needs public visibility, a
repository description and topics, issue tracking, a release tag, successful
HACS validation and Hassfest checks. See `RELEASE_CHECKLIST.md`.
