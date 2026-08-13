# Installation

> This guide applies from the first public release onward. The repository is
> currently private and therefore cannot yet be installed by HACS users.

## Prerequisites

Install and configure these HACS projects first:

1. Stellantis Vehicles
2. Bubble Card
3. Button Card
4. ha-map-card

A vehicle must already be visible in **Settings → Devices & services →
Stellantis Vehicles**.

## Install

1. Open HACS and select **Custom repositories**.
2. Add `CaneTLOTW/e_c3_dashboard` as type **Integration**.
3. Download **e-C3 Dashboard**.
4. Restart Home Assistant.
5. Go to **Settings → Devices & services → Add integration**.
6. Select **e-C3 Dashboard**, select the vehicle and provide a unique local
   slug.
7. Open **Settings → Dashboards → Add dashboard**.
8. Choose **e-C3 Dashboard** under **Community dashboards**.

If a required custom card is missing, the dashboard displays a setup page with
the exact missing card. Install it through HACS, restart Home Assistant and
reload the browser page.

## History modules

Trip, charging and GPS history require Home Assistant Recorder history. This
project never changes Recorder retention. InfluxDB is optional and remains the
user's separate configuration.
