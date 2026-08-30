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

![Compact e-C3 vehicle overview card](docs/assets/vehicle-overview-card.png)

The card uses the same canonical card implementation as the generated LIVE
hero (`variant: live` internally). It shows the vehicle picture, range,
temperature or charge state, SOC/battery bar, cable and driving indicators and
preconditioning. Tapping the vehicle opens the generated `/vehicle` view;
range and contextual status pills open native Home Assistant More Info. With
multiple vehicles, set the optional `entry_id` explicitly. See [the vehicle
overview card guide](docs/VEHICLE_OVERVIEW_CARD.md) for navigation and heading
configuration.

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
5. Select the desired modules. If notifications are wanted, enable the
   notification/recipient controls and explicitly select the Home Assistant
   Notify services that may be used.
6. The integration creates a new **e-C3** dashboard automatically. Open it
   from the sidebar after setup.

The initial preflight checks that the required Lovelace resources are available
before a vehicle is selected. The config flow discovers mapped upstream
entities instead of asking for a VIN or fixed entity IDs. With multiple
vehicles, create one entry per vehicle; each entry owns its generated dashboard
and can be named independently. Later options remain available through Home
Assistant; operational controls are grouped in the generated System view.

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

The generated dashboard keeps day-to-day vehicle use and administration
separate. All screenshots below are current, anonymized runtime examples.
Location/map content, history rows, recipients and private integration
identifiers are omitted or covered by opaque redaction.

### Vehicle / LIVE

The everyday cockpit uses the same canonical overview-card foundation as the
portable start-page card. Its LIVE hero combines range, temperature or charging
information, SOC/battery, remote connection and preconditioning quick actions.
Below it are usage/consumption, mileage, charging/range, high-voltage battery
health, 12-V information and the latest trip/charge. Vehicle and maintenance
data share one popup so administration does not crowd the driving view.

![LIVE vehicle view](docs/assets/vehicle-live.png)

### Charging

Completed AC/DC sessions can be selected with available start/end SOC, duration,
energy and average power. The displayed curve is reconstructed from vehicle
SOC/time history: it is useful for comparison, but is not a meter-grade wallbox
power measurement.

![Historical e-C3 charging curves](docs/assets/charging-history.png)

### Statistics

Statistics shows available SOH capacity and resistance, mileage, driven
distance and the trailing 500-km consumption. Distance charts use Home
Assistant long-term statistics; pre-existing source-statistics anomalies remain
visible until repaired through a supported Home Assistant statistics path.

![e-C3 long-term statistics](docs/assets/statistics.png)

### Trips

Trips are rendered from canonical server history, with a refresh action and
filters for zero- and short-trip handling. Plausibility checks protect
downstream statistics. A derived odometer boundary is repaired only when there
is strong continuity evidence; the original raw record remains available for
diagnostics.

![Trip history with private rows redacted](docs/assets/trips-history.png)

### GPS

GPS history supports Today, Yesterday, a native Home Assistant date/range
selector and All. It combines Recorder points with canonical server history;
the current vehicle location remains a separate live marker rather than an
archived point. The public example deliberately redacts map and position data.

![GPS history with map and position redacted](docs/assets/gps-history.png)

### Wake-up

Wake-up controls include manual and hourly wake-up, wake-up while charging and
an optional reachability probe. A command reported as `accepted` or `forwarded`
is not proof of recovery: only fresh vehicle data counts as a new heartbeat.

![Wake-up controls](docs/assets/wakeup.png)

### Notifications

Notifications provide a master switch, vehicle warnings, trip and charging
reports, explicit opt-in recipients, tests, warning/reset thresholds,
reachability/probe parameters, quiet hours and diagnostics. Discovery of a
Home Assistant Notify service never enables it automatically.

![Notification switches without recipient rows](docs/assets/notifications.png)

### System

System contains setup/connection status, detected upstream entities,
privacy/data-sharing state, refresh interval, battery-value correction and ABRP
controls. This administrative separation keeps the Vehicle view focused on the
car.

![System controls](docs/assets/system.png)

### Integration, entities and configuration

The Home Assistant integration/device view is the technical companion to the
dashboard. A config entry maps entities dynamically instead of hard-coding a
VIN or household entity IDs. The config flow and options handle vehicle/module
selection and explicit notification opt-in; ongoing integration administration
lives in System. This also supports one independently configured entry and
dashboard per vehicle.

![Integration and entity overview with private identifiers redacted](docs/assets/integration-entities.png)

For detailed data contracts, capability notes and privacy guidance, see
[Dashboard features](docs/DASHBOARD_FEATURES.md), the
[entity catalog](docs/ENTITY_CATALOG.md) and the
[vehicle overview card guide](docs/VEHICLE_OVERVIEW_CARD.md).

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
