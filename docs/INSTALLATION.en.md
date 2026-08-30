# Installation

## Prerequisites

`e-C3 Dashboard` is installed as a HACS **custom integration repository**.

Required Home Assistant baseline: **2026.5.0 or later**.

Install and configure these projects first:

1. [Stellantis Vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles)
2. [Bubble Card](https://github.com/Clooos/Bubble-Card)
3. [Button Card](https://github.com/custom-cards/button-card)
4. [ha-map-card](https://github.com/nathan-gs/ha-map-card)
5. [layout-card](https://github.com/thomasloven/lovelace-layout-card)

The Stellantis Vehicles integration must already be logged in and expose the selected vehicle's real Home Assistant device/entities, including battery, mileage and vehicle tracker. A downloaded but unconfigured upstream integration is not a functional prerequisite.

The four frontend dependencies must also be loaded as Lovelace JavaScript modules. HACS may show a card as downloaded before the browser has actually loaded its custom element.

## Install through HACS

1. Open **HACS → Integrations → Custom repositories**.
2. Add `CaneTLOTW/e_c3_dashboard` as category **Integration**.
3. Download **e-C3 Dashboard**.
4. Restart Home Assistant.
5. Open **Settings → Devices & services → Add integration**.
6. Select **e-C3 Dashboard**.
7. Select the configured Stellantis vehicle, choose the desired modules and provide the local dashboard/vehicle settings requested by config flow.
8. Complete setup. The package creates a dedicated e-C3 storage dashboard for that config entry.
9. Refresh the browser/app once and open the generated dashboard from the sidebar.

## Frontend resource model

Current versions register exactly one package-owned Lovelace resource:

```text
/e_c3_dashboard/frontend.js
```

All e-C3 cards and the dashboard strategy are internal ES modules loaded by that entry point. Do **not** manually add old resources such as:

- `/e_c3_dashboard/e_c3_dashboard.js`
- `/e_c3_dashboard/map-marker-fix.js`
- `/e_c3_dashboard/gps-history-fix.js`
- individual trip/charge/vehicle card resource URLs

The integration contains migration cleanup for historical resource registrations from older package versions.

After an update that changes frontend code:

1. restart/reload Home Assistant as required by the update;
2. hard-refresh the browser, or fully close/reopen the HA mobile app if it still serves an older module graph.

## More than one vehicle

Add one e-C3 Dashboard config entry for each Stellantis vehicle. Each entry has its own selected device, slug, generated dashboard, derived/canonical data and notification/wake-up state.

The generated dashboard strategy stores the explicit config-entry ID, so multiple vehicles do not depend on dashboard order or VIN-shaped entity-name guesses.

The compact card can also be bound to a specific entry:

```yaml
type: custom:e-c3-dashboard-vehicle-overview-card
entry_id: YOUR_CONFIG_ENTRY_ID
```

With only one e-C3 entry, `entry_id` is optional.

## Notifications

Notifications remain inactive after installation.

To use them:

1. open **Settings → Devices & services → e-C3 Dashboard → Configure**;
2. enable the notification/recipient module if needed;
3. explicitly select one or more available Notify services;
4. reload the config entry if Home Assistant requests it;
5. in the generated **Notifications** view enable the notification master, desired topic(s) and the intended recipient switch(es).

A discovered Notify service is only a choice. Discovery never silently opts it in.

Thresholds, delays and quiet hours are package-owned Home Assistant Number/Time entities visible in the Notifications view. See `NOTIFICATIONS_AND_WAKEUP.en.md`.

## History and retention

The package combines several history sources:

- canonical Stellantis server history for retained trip/charge records;
- a restart-safe package store for local/observed session data;
- Home Assistant Recorder for HA-side state history such as detailed tracker history and local history reconstruction;
- Home Assistant long-term statistics for supported aggregate/statistics cards.

The **History display window** option defaults to 2,160 hours (90 days), but it is only a query/display limit. It does not change Recorder retention.

If you expect 90 days of Recorder-backed data, ensure your Recorder configuration retains the required entities for at least that long. The integration never changes `purge_keep_days`, Recorder include/exclude filters, database backend or purge schedule.

Canonical server history can remain available beyond the local Recorder window, but that does not manufacture missing detailed GPS/HA state samples.

## Data quality expectations

The package deliberately distinguishes direct upstream values from derived estimates:

- mileage/odometer deltas are used when valid;
- energy from SOC × capacity is an estimate;
- charging power derived from SOC/time is an estimate;
- server-trip GPS lines can be start-to-stop approximations rather than complete routes.

If an upstream server row is implausible, the canonical layer can mark it invalid or, where strong evidence exists, repair only a derived boundary while retaining the raw source value for diagnostics.

## Troubleshooting

### Missing custom card / setup page

If the generated dashboard reports a missing dependency, verify that Bubble Card, Button Card, ha-map-card and layout-card are installed **and loaded** as Lovelace resources. Restart Home Assistant if HACS requests it, then hard-refresh the browser.

### Dashboard still shows an old frontend

Confirm the current package version is installed, then hard-refresh. Current e-C3 versions use only `/e_c3_dashboard/frontend.js`; manually registered historical e-C3 resources should be removed by migration cleanup.

### Vehicle cannot be selected

Verify Stellantis Vehicles is configured, compatible and currently exposes battery, mileage and tracker entities for that Home Assistant device.

### Normal telemetry works but remote values are unavailable

Check the upstream Stellantis Vehicles authentication/session/config-entry health first. A previous live incident showed ordinary vehicle telemetry continuing while the remote channel was unavailable because the upstream module needed re-authentication. That is not by itself evidence of an e-C3 dashboard mapping regression.

### History is shorter than the configured window

Check Recorder retention and include filters. The integration reports/uses the available data; it does not recreate Recorder history that has already been purged.

## Updating

Install the new version through HACS. For Python/platform or frontend changes, follow the release notes and restart Home Assistant when requested. Browser/app cache should be refreshed after frontend version changes.

The project's acceptance workflow validates exact `develop` SHAs before stable promotion; published `main` remains the accepted line rather than an independent hotfix branch.
