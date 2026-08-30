# e-C3 Dashboard for Home Assistant

A HACS integration that builds a multilingual e-C3 dashboard on top of
[Stellantis Vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles).

> Development status: pre-release. The integration is intended for HACS custom
> repositories and requires a public GitHub repository.

[![Open the e-C3 Dashboard repository in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=CaneTLOTW&repository=e_c3_dashboard&category=integration)

Use this button to open the repository directly in HACS. It must be added as an
**Integration**, not as a Dashboard element.

## What it provides

- A Home Assistant setup flow that discovers a connected Stellantis vehicle.
- A package-owned Community Dashboard strategy: no VIN, entity IDs, or dashboard YAML must be copied.
- A generated vehicle dashboard with dedicated **Vehicle**, **Charging**, **Statistics**, **Trips**, **GPS**, **Wake-up**, **Notifications**, and **System** views.
- A LIVE vehicle hero with range, temperature/charging state, SOC, remote-connection state, preconditioning and compact quick actions.
- Vehicle usage, mileage, charging/range, battery-health and 12-V information plus recent trip/charge activity.
- Historical AC/DC charging-session views with reconstructed SOC/time curves.
- Canonical trip history with server-history refresh, filtering and explicit data-quality handling.
- GPS history that combines Home Assistant Recorder data with canonical Stellantis server history and keeps the current vehicle position separate.
- Wake-up/reachability controls with conservative recovery semantics: a forwarded command is not treated as fresh vehicle data.
- Optional Home Assistant notifications with explicit opt-in recipients and configurable thresholds, quiet hours and diagnostics.
- Administrative controls in the System view, including upstream status, privacy/share state, refresh interval, battery-value correction and ABRP.
- A reusable compact Home Assistant card,
  `custom:e-c3-dashboard-vehicle-overview-card`, for dashboards such as a home
  or mobility overview. With one configured e-C3 entry it is zero-config.
- Multi-vehicle support: one config entry creates one dashboard, visible dashboard names can be customized, and the compact card can be bound to a specific `entry_id` when more than one vehicle is configured.
- German and English user interfaces: native HA translations for setup/options,
  a shared frontend catalog for dashboard cards, and a backend catalog for
  notifications and Logbook messages.

For a view-by-view description and data-quality notes, see
[Dashboard features](docs/DASHBOARD_FEATURES.md).

## Compact vehicle overview card

For a single configured vehicle, the portable card only needs:

```yaml
type: custom:e-c3-dashboard-vehicle-overview-card
```

It shows the same core mobility information as the LIVE hero: vehicle picture,
range, temperature or charging information, preconditioning, cable/driving
state and the battery/SOC bar. Range and the right-hand status pill open native
Home Assistant More Info for the value currently shown. Tapping the vehicle
opens the generated e-C3 `/vehicle` view.

![Compact e-C3 vehicle overview card](docs/assets/vehicle-overview-card.webp)

See [the vehicle overview card guide](docs/VEHICLE_OVERVIEW_CARD.md) for optional
`entry_id`, navigation and heading configuration.

## Required HACS dependencies

Install **and fully configure** these before creating the dashboard:

1. [Stellantis Vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles)
2. [Bubble Card](https://github.com/Clooos/Bubble-Card)
3. [Button Card](https://github.com/custom-cards/button-card)
4. [ha-map-card](https://github.com/nathan-gs/ha-map-card)
5. [layout-card](https://github.com/thomasloven/lovelace-layout-card)

The integration verifies prerequisites and displays an explicit setup status
instead of creating a dashboard with missing custom elements.

Finish the Stellantis Vehicles login and vehicle setup first. Only add e-C3
Dashboard after the selected vehicle is visible in Home Assistant with usable
battery, mileage and vehicle-tracker entities. Installing the upstream
repository alone is not sufficient. Bubble Card, Button Card, ha-map-card and
layout-card must likewise be loaded as Lovelace resources, not merely shown as
downloaded in HACS. The config flow shows a resource preflight before vehicle
selection; the dashboard then verifies the cards in the browser before
rendering any custom-card view.

## Installation flow

1. Add this repository in HACS as an **Integration**.
2. Download it and restart Home Assistant.
3. Add **e-C3 Dashboard** in **Settings → Devices & services**.
4. Select the upstream Stellantis vehicle and desired modules.
5. If notifications are wanted, enable notification/recipient controls and select the Home Assistant Notify services that may be used.
6. The integration creates a new **e-C3** dashboard automatically. Open it from the sidebar after setup.

The dashboard is created once, never overwrites an existing dashboard, and is
not deleted with the integration.

Installation never sends a notification and never performs an automatic
wake-up. The generated **Notifications** and **Wake-up** views contain all
package switches, initially off. Notification recipients are opt-in: discovery
must not silently activate a recipient.

Documentation is maintained in English. See [the architecture concept](docs/CONCEPT.md)
and the [entity catalog with data-quality notes](docs/ENTITY_CATALOG.md). Notification
and wake-up semantics are described in
[the notification guide](docs/NOTIFICATIONS_AND_WAKEUP.en.md). The current
e-C3 remote-action audit and the difference between a visible button and a
confirmed vehicle capability are documented in
[the e-C3 capability matrix](docs/STELLANTIS_EC3_CAPABILITY_MATRIX.en.md).
For support, contribution and automation guidance, see
[SUPPORT.md](SUPPORT.md), [CONTRIBUTING.md](CONTRIBUTING.md), and
[AGENTS.md](AGENTS.md). Community rules and the difference between Issues and
Discussions are described in the [community guide](docs/COMMUNITY.en.md).

## Look & Feel

### Vehicle

The Vehicle view is the everyday cockpit. Its LIVE hero surfaces range,
temperature or active charging information, SOC, remote connectivity and quick
actions. Below it, the dashboard groups consumption and usage, mileage,
charging/range, battery health, 12-V status, position, the latest trip and
charge, plus trip and charging history. Vehicle and maintenance details share
one popup; integration administration is intentionally kept out of this view.

![LIVE vehicle view](docs/assets/vehicle-live.png)

### Charging

Completed AC/DC charging sessions can be selected in the Charging view. The
session summary includes the available SOC, duration, energy and average-power
information. Historical curves are reconstructed from the available SOC/time
history and are therefore derived vehicle-side history, not meter-grade wallbox
measurements.

![Historical e-C3 charging curves](docs/assets/charging-history.png)

Additional anonymized examples for every generated view, including history,
GPS, wake-up, notification and System screens, are collected in
[Dashboard features](docs/DASHBOARD_FEATURES.md). Public screenshots use
opaque redaction for vehicle history, location and recipient details.

### Statistics

The Statistics view presents battery SOH capacity/resistance, mileage, driven
distance and trailing 500-km consumption where the required source history is
available.

Long-term distance charts use Home Assistant statistics. Historical LTS source
anomalies can therefore remain visible until the affected Home Assistant
statistics are repaired; the project does not hide or silently rewrite such
stored history.

### Trips

Trips are built from a canonical history layer rather than rendering upstream
rows blindly. The view supports server-history refresh, filters and controls for
zero/short trips. Plausibility checks keep unusable records out of downstream
statistics. Where strong continuity evidence exists, the canonical layer may
repair an implausible odometer boundary while retaining the original upstream
record for diagnostics.

### GPS

GPS history provides native Home Assistant date selection with Today,
Yesterday, explicit ranges and All. It combines Recorder points with canonical
server-side history while treating the current vehicle position as a separate,
live marker.

### Wake-up

The Wake-up view contains manual wake-up, hourly wake-up, wake-up while charging
and an optional reachability probe. When the reliable vehicle heartbeat becomes
stale, the probe may send one wake-up and then wait. A command merely being
accepted or forwarded is not recovery; only fresh vehicle data counts as
recovered connectivity.

### Notifications

Notifications provide a master switch, vehicle warnings, trip reports, charging
reports, explicit recipients, recipient management, test notifications,
warning/reset thresholds, reachability settings, probe wait time, charging-start
delay, quiet hours and diagnostics. Recipients remain opt-in even when Home
Assistant Notify services are discovered.

### System

System groups connection/setup status, the number of detected upstream
entities, privacy/share state, refresh interval, battery-value correction and
ABRP controls. These administrative functions are intentionally separated from
the Vehicle view.

The screenshots show example runtime data. Vehicle values are dynamic and are
not part of the integration configuration.

## Development

The runtime integration is located in `custom_components/e_c3_dashboard/`.
It is deliberately independent of Stellantis API internals: it only reads
Home Assistant entities created by the upstream integration.

Home Assistant registers exactly one package-owned Lovelace resource:
`/e_c3_dashboard/frontend.js`. Package cards and compatibility helpers are
loaded as internal ES modules from that entry point. GPS and map-marker behavior
therefore do not require separate e-C3 Lovelace resources or a Strategy
post-patch chain.

## Privacy and trademark notice

This is an independent community project and is not affiliated with, endorsed
by, or supported by Citroën, Stellantis, or their affiliates. The integration
does not send vehicle data to this repository or any project-operated service.
Do not include VINs, vehicle locations, credentials, account IDs, private Notify
service names, config-entry IDs, or raw Home Assistant exports in issues,
discussions, screenshots or pull requests.

## License

[MIT License](LICENSE) © 2026 CaneTLOTW.
