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
  → Settings / Dashboards / Add dashboard
  → Community dashboard: e-C3 Dashboard
```

No vehicle identification number, raw entity ID or copied YAML is part of the
normal user workflow.

## Required dependencies

The following HACS repositories are intentionally mandatory:

- `andreadegiovine/homeassistant-stellantis-vehicles`
- `Clooos/Bubble-Card`
- `custom-cards/button-card`
- `nathan-gs/ha-map-card`

HACS cannot automatically install another repository as a transitive
dependency. The setup and dashboard onboarding therefore report missing
dependencies explicitly and do not render partially broken custom-card
configurations.

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
3. registers `custom:e-c3-dashboard` as a Community Dashboard strategy.

The strategy creates the dashboard's views dynamically. This avoids modifying
Home Assistant's internal Lovelace storage files and allows a user to add the
dashboard through the normal UI. A tiny YAML strategy dashboard is documented
as a safe local fallback for HA frontend versions where the Community Dashboard
picker fails to advance after selection.

## Vehicle mapping

The config flow stores a selected Home Assistant device ID and a stable,
user-chosen vehicle slug. It verifies that the device belongs to a
`stellantis_vehicles` config entry.

Entity mapping is resolved from the selected device's entity-registry entries,
not guessed from a VIN prefix. Each dashboard config entry owns its own derived
entities, persistent storage, events and services under its slug. This permits
more than one vehicle in a Home Assistant installation.

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

Upstream recorder history may still be used to display native Stellantis
states such as charge state, SOC, last trip and position. Older rows can
therefore be shown where the upstream integration provides them, but package
derived energy values start with the package installation. This is preferable
to silently binding a shared dashboard to non-portable, installation-specific
helpers.

## Modules

| Module | V1 role | Data retention |
| --- | --- | --- |
| Live vehicle | battery, range, climate, charging, remote status | current state |
| Trips | trip table, drive energy, consumption | Recorder; optional InfluxDB |
| Charging | charge table, AC/DC curves, estimates | Recorder; optional InfluxDB |
| GPS | current location and selectable history map | Recorder |
| Wake-up | manual action, schedule and activity diagnostics | Recorder/logbook |
| Notifications | vehicle events through a user-provided route adapter | optional |

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

## Implemented V1 dashboard views\n\nThe portable core currently creates the following VIN-free views from the\nselected device mapping:\n\n- vehicle overview with battery, range, vehicle state, charging, climate,\n  remote connection and current map;\n- 90-day trip history and local ride-result data;\n- 90-day AC/DC charging history reconstructed from Recorder;\n- seven-day GPS history plus current map;\n- manual wake-up plus an integration/system diagnostics view.\n\nTrip and charging history cards are bundled under the project's namespaced\nstatic path. They use the browser locale for German/English labels and remain\nindependent from the original Stellantis vehicle card.\n\n## Notifications

Notifications are deliberately decoupled from a particular household. The
integration exposes a notification event/service contract; a user's automation
or adapter chooses recipients and channels. No person, mobile-app device,
Telegram token or home-presence entity is included in the project.

## Languages

All project-owned user-facing strings are provided in German and English.

- Backend config/options flows: Home Assistant translation files.
- Dashboard strategy and bundled cards: frontend translation bundle.
- Documentation: English README plus German installation guide.

Home Assistant's selected UI language determines the display language; English
is the fallback. Upstream raw data stays unmodified.

## Privacy and sanitisation

The repository must never include VINs, account/customer IDs, GPS history,
vehicle images, live exports, household recipients or credentials. Generic
icons and upstream `entity_picture` are used where a vehicle image is
available.

## Supported Home Assistant versions

The first release targets Home Assistant 2026.5 or later because Community
Dashboard strategy discovery is part of the intended installation flow. The
actual minimum version is validated during the first compatibility test matrix.

## Release model

The repository is developed privately first. Before public HACS distribution it
needs a license, public repository visibility, a repository description and
topics, issue tracking, release tags, HACS validation and Hassfest checks.
