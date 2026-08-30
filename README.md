# e-C3 Dashboard for Home Assistant

A HACS custom integration that builds a multilingual, vehicle-focused Home Assistant experience on top of [Stellantis Vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles).

Current stable package version: **0.5.53**.

[![Open the e-C3 Dashboard repository in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=CaneTLOTW&repository=e_c3_dashboard&category=integration)

Install this repository as an **Integration**, not as a standalone Lovelace dashboard card repository.

## What it provides

- A Home Assistant config flow that discovers a configured Stellantis vehicle and maps its entities dynamically; no VIN-derived entity IDs or copied household YAML are required.
- One generated e-C3 dashboard per config entry with dedicated **Vehicle**, **Charging**, **Statistics**, **Trips**, **GPS**, **Wake-up**, **Notifications**, and **System** views.
- A reusable compact card, `custom:e-c3-dashboard-vehicle-overview-card`, for an existing home page or mobility dashboard.
- Canonical Stellantis trip history with server-history refresh, data-quality guards and continuity repair without rewriting retained raw source rows.
- Persistent charging history with observed sessions, reconstructed SOC/time curves and explicit distinction between observed values and battery-side estimates.
- GPS history combining Home Assistant Recorder data, canonical Stellantis start/stop history and the current vehicle position.
- Derived metrics such as trailing consumption over approximately 500 km and distance since the last charge.
- Home Assistant long-term-statistics views for available mileage/SOH data without silently rewriting malformed historical statistics.
- Optional notifications, explicit recipient opt-in, configurable warning thresholds, quiet hours and reachability diagnostics.
- Wake-up/reachability controls with conservative recovery semantics: an accepted or forwarded command is not treated as fresh vehicle data.
- German and English integration/frontend strings.
- Multi-vehicle support: each config entry owns its mapping, package state and generated dashboard.

For screenshots and a view-by-view description, see [Dashboard features](docs/DASHBOARD_FEATURES.md).

## Requirements

The integration currently targets Home Assistant **2026.5.0 or later** and validates against the Stellantis Vehicles integration baseline defined by the package.

Install and configure these dependencies first:

1. [Stellantis Vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles)
2. [Bubble Card](https://github.com/Clooos/Bubble-Card)
3. [Button Card](https://github.com/custom-cards/button-card)
4. [ha-map-card](https://github.com/nathan-gs/ha-map-card)
5. [layout-card](https://github.com/thomasloven/lovelace-layout-card)

The Stellantis integration must already expose a real vehicle with battery, mileage and tracker entities. Downloading the upstream repository without completing its login/vehicle setup is not enough.

See [Installation](docs/INSTALLATION.en.md) for the full setup and troubleshooting flow.

## Dashboard structure

| View | Purpose |
| --- | --- |
| **Vehicle** | Current vehicle state, LIVE hero, current charging/range/climate, latest trip/charge and quick actions. |
| **Charging** | Completed charging sessions and reconstructed historical charge curves. |
| **Statistics** | Aggregated/long-term metrics such as mileage, driven distance, SOH and trailing consumption. |
| **Trips** | Canonical driving history, filters, data-quality handling and server-history refresh. |
| **GPS** | Date/range-based position history plus the separate current vehicle marker. |
| **Wake-up** | Manual/optional reachability controls and remote-connection state. |
| **Notifications** | Explicit recipient controls, notification topics, thresholds, quiet hours and diagnostics. |
| **System** | Integration/runtime administration and mapped upstream diagnostics. |

Detailed trip, charge and GPS history is intentionally kept out of the Vehicle view. Vehicle stays the day-to-day cockpit; history and administration have their own views.

## Compact vehicle overview card

The package also registers a compact card through the same frontend entry point:

```yaml
type: custom:e-c3-dashboard-vehicle-overview-card
```

With one configured e-C3 entry the card is zero-config. With multiple entries, bind the card to a specific config entry with `entry_id`.

The generated Vehicle/LIVE hero uses the same canonical card implementation (`variant: live`), so the home-page card and full dashboard do not maintain two independent visual implementations.

See [Vehicle overview card](docs/VEHICLE_OVERVIEW_CARD.md).

## Frontend architecture

Home Assistant registers exactly **one package-owned Lovelace resource**:

```text
/e_c3_dashboard/frontend.js
```

`frontend.js` imports the package-owned strategy and card modules as ES modules. Historical e-C3 resource URLs from older versions are retained only as migration cleanup targets; users should not manually register the old resources.

A frontend change increments the package frontend/cache version so Home Assistant and browsers do not keep serving an older module graph.

## Data ownership and quality

The project has a strict boundary:

- **Stellantis Vehicles** owns authentication, upstream polling/API access, native vehicle entities and remote commands.
- **e-C3 Dashboard** reads only the selected upstream device, creates its own derived/canonical data and never calls the Stellantis API directly.
- **Canonical server history** keeps retained trip/charge history and quality metadata. Raw source values are not overwritten merely to make a row look plausible.
- **Home Assistant Recorder** remains the source for local state history such as detailed tracker history and other HA-side history windows.
- **Package stores** hold restart-safe local sessions, canonical history and notification/wake-up state per config entry.

Energy, charge-power and consumption values derived from SOC/time are estimates, not billing-grade measurements. The UI and entity attributes keep that distinction explicit.

An existing malformed Home Assistant long-term-statistics segment is also not silently hidden. The current open LTS repair work is tracked in [Issue #25](https://github.com/CaneTLOTW/e_c3_dashboard/issues/25).

See [Entity catalog and data quality](docs/ENTITY_CATALOG.md).

## Notifications and wake-up

Notifications are opt-in at every layer:

1. choose recipients in the integration options;
2. enable the notification master switch;
3. enable the desired topic switch;
4. enable the selected recipient switch.

Warning/reset thresholds, delays and quiet hours are package-owned Home Assistant entities. Reachability uses a proven fresh vehicle heartbeat rather than treating arbitrary unchanged telemetry as connection proof. `accepted`/`forwarded` command status alone is not recovery evidence.

The source implementation is complete; focused real-event QA remains tracked in [Issue #23](https://github.com/CaneTLOTW/e_c3_dashboard/issues/23).

See [Notifications and wake-up](docs/NOTIFICATIONS_AND_WAKEUP.en.md).

## Remote capabilities

The upstream integration can expose generic remote-command entities even when a specific vehicle does not support the corresponding physical action. The dashboard therefore does not equate “entity exists” with “vehicle capability confirmed”.

For the tested ë-C3 behavior and the distinction between upstream entity availability, command lifecycle and observed vehicle effect, see the [ë-C3 capability matrix](docs/STELLANTIS_EC3_CAPABILITY_MATRIX.en.md).

If ordinary telemetry works but remote-oriented entities suddenly become unavailable, first verify the Stellantis Vehicles authentication/session before changing e-C3 mappings.

## Development and release flow

Development happens on `develop`. `main` is the last accepted publishable state. Runtime acceptance may intentionally run an exact `develop` SHA; only the exact validated SHA is fast-forwarded to `main` after maintainer/user acceptance.

See [Branch and deployment workflow](docs/BRANCH_AND_DEPLOYMENT_WORKFLOW.md), [Release checklist](docs/RELEASE_CHECKLIST.md), [Contributing](CONTRIBUTING.md), and [AGENTS.md](AGENTS.md).

## Support and privacy

Use [SUPPORT.md](SUPPORT.md) and [Community guidance](docs/COMMUNITY.en.md) for setup/questions and reporting rules.

Do not publish VINs, account/customer IDs, exact locations, GPS tracks, Notify recipient names, credentials, tokens or raw Home Assistant `.storage`/Store exports. Public screenshots in this repository are intentionally anonymized with opaque redaction.
