# e-C3 Dashboard for Home Assistant

A HACS integration that builds a multilingual e-C3 dashboard on top of
[Stellantis Vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles).

> Development status: foundation. The project is private while it is being
> sanitised and tested. HACS installations require a public repository.

## What it will provide

- A Home Assistant setup flow that discovers a connected Stellantis vehicle.
- A Community Dashboard strategy: no VIN, entity IDs, or dashboard YAML must be copied.
- Required UI based on Bubble Card, Button Card, and ha-map-card.
- Portable local metrics for trips, charging, GPS history, wake-up and optional notifications.
- German and English user interfaces.

## Required HACS dependencies

Install these before creating the dashboard:

1. [Stellantis Vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles)
2. [Bubble Card](https://github.com/Clooos/Bubble-Card)
3. [Button Card](https://github.com/custom-cards/button-card)
4. [ha-map-card](https://github.com/nathan-gs/ha-map-card)

The integration verifies prerequisites and displays an explicit setup status
instead of creating a dashboard with missing custom elements.

## Planned installation flow

1. Add this repository in HACS as an **Integration**.
2. Download it and restart Home Assistant.
3. Add **e-C3 Dashboard** in **Settings → Devices & services**.
4. Select the upstream Stellantis vehicle and desired modules.
5. Open **Settings → Dashboards → Add dashboard** and choose **e-C3 Dashboard**
   from Community dashboards.

See [the architecture concept](docs/CONCEPT.md) and the
[implementation plan](docs/IMPLEMENTATION_PLAN.md).

## Development

The runtime integration is located in `custom_components/e_c3_dashboard/`.
It is deliberately independent of Stellantis API internals: it only reads
Home Assistant entities created by the upstream integration.

## License

To be selected before the first public release.
