# Installation

> This package is installed as a HACS custom repository. It is not yet part of
> the default HACS repository list.

## Prerequisites

Install and configure these HACS projects first:

1. Stellantis Vehicles
2. Bubble Card
3. Button Card
4. ha-map-card
5. layout-card

A vehicle must already be visible in **Settings → Devices & services →
Stellantis Vehicles** with its battery, mileage and vehicle-tracker entities.
Finish the Stellantis Vehicles login and vehicle setup before proceeding. The
e-C3 Dashboard config flow deliberately rejects a selected upstream device
until these real entities exist: downloading the HACS repository is not a
functional setup.

After installing Bubble Card, Button Card, ha-map-card and layout-card, make
sure they are loaded as Lovelace **JavaScript modules**. HACS may show a card
as downloaded before the browser has loaded its resource; restart Home Assistant
if HACS asks for it and then hard-refresh the browser. The config flow reports
the registered-resource state before vehicle selection; the dashboard performs
the definitive browser-side check when opened.

## Install

1. Open HACS and select **Custom repositories**.
2. Add `CaneTLOTW/e_c3_dashboard` as type **Integration**.
3. Download **e-C3 Dashboard**.
4. Restart Home Assistant.
5. Go to **Settings → Devices & services → Add integration**.
6. Select **e-C3 Dashboard**, select the vehicle and provide a unique local
   slug.
7. The package creates a dedicated **e-C3** dashboard automatically. Refresh
   the browser once and open it from the sidebar.

## More than one vehicle

You can add one e-C3 Dashboard config entry for each Stellantis vehicle; every
entry has its own selected device, slug, derived entities, private state, and
notification controls. The package creates one dashboard per entry and stores
the explicit config-entry ID in that dashboard's strategy, so multiple vehicles
never depend on dashboard order or a guessed vehicle.

Notifications are inactive by default. To use them, open the e-C3 Dashboard
**Configure** dialog after setup, enable notification controls, select one or
more available Notify services, and then enable the desired package switches
in the generated dashboard view.

If a required custom card is missing, the dashboard displays a setup page with
the exact missing card. Install it through HACS, restart Home Assistant and
reload the browser page.

### Vehicle picture marker in dark mode

The package includes its own `map-marker-fix.js` compatibility resource for
the e-C3 vehicle picture marker. It is registered automatically with the other
package-owned Lovelace modules. No `card-mod`, browser extension or manual CSS
override is required.

After installing or updating the package:

1. Restart Home Assistant so the integration registers the new versioned
   resource.
2. Reload the dashboard. On a desktop browser use a hard reload; on the HA
   mobile app close and reopen the app if the old JavaScript is still cached.
3. Open the Vehicle or GPS view in dark mode. The e-C3 vehicle picture marker
   should have a transparent background while the LIVE vehicle picture keeps
   its existing appearance.

The compatibility code is opt-in. It affects only marker hosts carrying the
private `--ec3-transparent-picture-marker: 1` property. Other maps and
markers in the Home Assistant installation are not modified.

## History modules

Trip, charging and GPS history require Home Assistant Recorder history. The
package's default history display window is 90 days, but it cannot create or
retain history itself.

Before using that window, verify that Recorder `purge_keep_days` is at least
90 (or at least the configured **History display window**) and that all
required vehicle/package entities are included when using a Recorder allowlist.
The integration never changes Recorder retention, filters, database, or purge
schedule. If less data is retained, the dashboard shows only the available
subset. InfluxDB is optional and remains the user's separate configuration.

See the [entity catalog](ENTITY_CATALOG.md#recorder-retention-required-user-check)
for the exact user check.
