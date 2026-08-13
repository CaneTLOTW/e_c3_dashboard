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
- A Community Dashboard strategy: no VIN, entity IDs, or dashboard YAML must be copied.
- A UI that requires Bubble Card, Button Card, and ha-map-card.
- Portable local metrics for trips, charging, GPS history, wake-up and optional notifications.
  On first start, the distance since charge and the partial 500-km consumption
  window are reconciled from compatible Stellantis Recorder history when it is
  still available.
- German and English user interfaces: native HA translations for setup/options,
  a shared frontend catalog for dashboard cards, and a backend catalog for
  notifications and Logbook messages.

## Required HACS dependencies

Install **and fully configure** these before creating the dashboard:

1. [Stellantis Vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles)
2. [Bubble Card](https://github.com/Clooos/Bubble-Card)
3. [Button Card](https://github.com/custom-cards/button-card)
4. [ha-map-card](https://github.com/nathan-gs/ha-map-card)

The integration verifies prerequisites and displays an explicit setup status
instead of creating a dashboard with missing custom elements.

In particular, finish the Stellantis Vehicles login and vehicle setup first.
Only add e-C3 Dashboard after the selected vehicle is visible in Home Assistant
with usable battery, mileage and vehicle-tracker entities. Installing the
upstream repository alone is not sufficient. Bubble Card, Button Card and
ha-map-card must likewise be loaded as Lovelace resources (not merely shown as
downloaded in HACS).

## Installation flow

1. Add this repository in HACS as an **Integration**.
2. Download it and restart Home Assistant.
3. Add **e-C3 Dashboard** in **Settings → Devices & services**.
4. Select the upstream Stellantis vehicle and desired modules.
   Enable **Notification and recipient controls**, choose one or more existing
   Home Assistant Notify services, and submit the options form if you want to
   use vehicle notifications.
5. The integration creates a new **e-C3** dashboard automatically. Open it from
   the sidebar after setup. It is created once, never overwrites an existing
   dashboard, and is not deleted with the integration.

Installation never sends a notification and never performs an automatic
wake-up. The generated **Notifications** and **Wake-up** views contain all
package switches, initially off. Turn on the master switch, the desired report
category and each selected recipient deliberately; automatic wake-up is
controlled separately.

Documentation is maintained in English. See [the architecture concept](docs/CONCEPT.md)
and the [entity catalog with data-quality notes](docs/ENTITY_CATALOG.md). Notification
and wake-up semantics are described in
[the notification guide](docs/NOTIFICATIONS_AND_WAKEUP.en.md). The current
ë-C3 remote-action audit and the difference between a visible button and a
confirmed vehicle capability are documented in
[the ë-C3 capability matrix](docs/STELLANTIS_EC3_CAPABILITY_MATRIX.en.md).
For support, contribution and automation guidance, see
[SUPPORT.md](SUPPORT.md), [CONTRIBUTING.md](CONTRIBUTING.md), and
[AGENTS.md](AGENTS.md).

## Development

The runtime integration is located in `custom_components/e_c3_dashboard/`.
It is deliberately independent of Stellantis API internals: it only reads
Home Assistant entities created by the upstream integration.

## Privacy and trademark notice

This is an independent community project and is not affiliated with, endorsed
by, or supported by Citroën, Stellantis, or their affiliates. The integration
does not send vehicle data to this repository or any project-operated service.
Do not include VINs, vehicle locations, credentials, account IDs, or raw Home
Assistant exports in issues, discussions, or pull requests.

## License

[MIT License](LICENSE) © 2026 CaneTLOTW.
