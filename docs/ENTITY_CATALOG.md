# Entity catalog and data quality

## Scope and naming

`e_c3_dashboard` never recreates or renames entities from
[Stellantis Vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles).
It reads only entities belonging to the vehicle selected during setup and adds
the seven sensors in this catalog.

Home Assistant derives the visible entity IDs from the selected vehicle name.
They therefore vary between installations. Treat the patterns below as
descriptions, not IDs to copy. The **Dashboard status** sensor exposes the
actual package entity IDs in its `metric_entities` attribute.

All local session data is stored per dashboard config entry and survives Home
Assistant restarts. The package retains up to 250 local trip rows and 250
local charge rows. Recorder retention and InfluxDB are not changed by this
integration.

## Quality scale

| Grade | Meaning |
| --- | --- |
| **Diagnostic** | Configuration and compatibility information, not a physical measurement. |
| **High** | Direct difference of upstream odometer readings. It is still limited by when the upstream API publishes a new value. |
| **Medium** | A useful derived aggregate, but dependent on delayed or incomplete upstream updates. |
| **Low** | A coarse estimate from integer SOC changes and timestamps. Suitable for orientation and trends, not billing or efficiency certification. |

## Package-owned entities

| Entity name / ID pattern | Function and source | Quality and limitations |
| --- | --- | --- |
| **Dashboard status**  `sensor.<vehicle>_dashboard_dashboard_status` | Diagnostics for the selected upstream device, mapped upstream entities, enabled modules, compatibility result, and the package-owned metric entity IDs. | **Diagnostic.** `ready` means the package found a compatible selected device and its required mapping. It does not prove that the remote Stellantis API is currently reachable or that every optional upstream value is fresh. |
| **Trailing consumption (500 km)**  `sensor.<vehicle>_dashboard_trailing_consumption_500_km` | Rolling consumption over the most recent locally completed trips, capped at 500 km. The sensor attributes report covered distance, contributing energy, trip count, and whether the full 500 km are available. | **Medium to low.** Distance is based on odometer changes, but energy is estimated from SOC decrease × reported battery capacity (or 43.4 kWh fallback). It excludes charging losses and may be quantised because upstream SOC can be whole percentages. Before 500 km of qualifying local trips exist, it is a partial-window value; check `complete: false`. |
| **Distance since last charge**  `sensor.<vehicle>_dashboard_distance_since_last_charge` | Current upstream odometer minus the odometer recorded after the last locally completed charge. Attributes contain the charge-end odometer and time. | **High for the distance delta, with a semantic boundary.** It becomes available only after the package has observed and completed a charge session. A charge that ended before package installation, or while the integration was not running, cannot establish the baseline. The value waits for the upstream odometer to update. |
| **Current trip energy**  `sensor.<vehicle>_dashboard_current_trip_energy` | Live battery-side energy used since the package observed engine-on: start SOC minus current SOC × reported battery capacity (or 43.4 kWh fallback). Available only while the engine entity is on. | **Low.** This is intentionally a practical live approximation. It updates only when SOC changes, is affected by SOC granularity and delayed API delivery, and is not a measurement of energy drawn at the plug or motor terminals. |
| **Last local trip result**  `sensor.<vehicle>_dashboard_last_local_trip_result` | One locally recorded trip row after engine-off. State is the travelled distance; attributes include start/end times, distance, odometer values, duration, average speed, SOC, capacity, energy, and consumption. | **Mixed.** Distance is **high** when the upstream odometer arrived. Energy and consumption are **low** SOC/capacity estimates. End processing deliberately waits at least five minutes after engine-off for delayed odometer data; duration may therefore include that wait and average speed is only an orientation value. Only trips whose start and end were observed by the package are present. |
| **Current charge power**  `sensor.<vehicle>_dashboard_current_charge_power` | Battery-side charging-power estimate from the energy represented by the latest SOC increase divided by the elapsed time since the previous SOC sample. Available only while the upstream charging entity is on. | **Low.** This is not a charger telemetry value. It can remain unchanged or unavailable until a new SOC percentage arrives, and it is affected by whole-percent SOC, irregular update intervals, capacity fallback, and delayed API delivery. It is useful as a coarse AC/DC charging trend only. |
| **Last local charge result**  `sensor.<vehicle>_dashboard_last_local_charge_result` | One locally recorded completed charging row. Attributes include AC/DC type as reported upstream, start/end SOC, duration, battery capacity, estimated energy, average/maximum estimated power, and sample data. | **Mixed.** Charge type is the upstream-reported value. Energy, average power, and maximum power are **low** battery-side estimates derived from SOC and time; they exclude charging losses and are not suited for billing. Finalisation waits two minutes after charge-off, so duration can include a small post-charge delay. Only charges observed by the package are recorded. |

## Upstream entities used by the dashboard

The dashboard also displays values such as battery SOC, range, mileage, vehicle
position, engine/charging state, climate state, and remote-command controls.
Those are **not** package-owned entities: their meaning, update interval, and
accuracy are defined by Stellantis Vehicles and the Stellantis API.

The strategy resolves their IDs dynamically from the selected device. This
keeps the package VIN-free and avoids any dependency on a household's existing
helpers, legacy dashboards, or manually created sensors.

## Practical interpretation

- Prefer upstream odometer and direct state values whenever the dashboard shows
  them; the package does not alter those values.
- Use local energy and power values for trip/charge comparison and trend
  analysis, not for electricity cost settlement.
- A blank local metric immediately after installation is expected. It begins
  once a qualifying trip or charge is observed.
- Check the timestamp/freshness of the underlying Stellantis entity whenever a
  value looks surprising. The package does not wake the vehicle or increase
  upstream polling.


## Components that do not create Home Assistant entities

The entities above are only one part of the package. The following components
provide the dashboard behaviour without adding automations, scripts, helpers,
buttons, services, or event types to Home Assistant.

| Component | What it does | Data source, persistence, and limitations |
| --- | --- | --- |
| **Trip history card** | Renders the 90-day trip table and details in the dashboard. | Uses the Home Assistant WebSocket history API to read Recorder history for the upstream **Last trip** sensor and the package **Last local trip result** sensor. It does not create one entity per trip. Historical availability is limited by the user's Recorder retention and by trips observed after package installation for local energy fields. |
| **Charging history card and curve browser** | Reconstructs completed AC/DC charge sessions and shows a selectable charge curve. | Reads Recorder history for the selected vehicle's upstream charging state, SOC, charging type, capacity, and the package current-charge-power/last-charge-result sensors. Curves are reconstructed in the browser from timestamped SOC samples. They are not raw BMS or charger telemetry and can be sparse when the upstream API reports infrequently. |
| **GPS history view** | Shows the selected global date range as route lines and dots, plus current coordinates and data age. | Delegates historical rendering to `ha-map-card` using the selected upstream vehicle tracker. It creates no tracker or route entity. GPS history exists only where the tracker was retained in Recorder; API positions can be sparse and separate trips can be joined by straight lines. |
| **Local metrics manager** | Starts and finalises local trip/charge sessions, samples SOC during charging, and refreshes the seven sensors. | An event listener watches only the selected upstream engine, charging, and SOC entities. It does not poll Stellantis, schedule a recurring job, wake the vehicle, or alter the upstream integration's refresh interval. The five-minute post-drive and two-minute post-charge waits are one-shot local callbacks to allow delayed upstream data to arrive. |
| **Restart-safe local store** | Keeps active sessions, the last result, and compact trip/charge buffers across restarts. | Uses Home Assistant's private storage under a config-entry-specific `e_c3_dashboard_<slug>_metrics` key. It retains at most 250 local trip rows and 250 charge rows. This is supporting data, not an entity and not a replacement for Recorder or InfluxDB. |
| **Community Dashboard strategy and cards** | Registers the e-C3 dashboard views and package-owned trip/charge custom cards. | Registers versioned Lovelace JavaScript resources under `/e_c3_dashboard/`. It reads the selected-device mapping from **Dashboard status** and has no fixed VIN, tracker ID, image, or household helper. |
| **Remote-action controls** | Exposes wake-up, charging, climate, locks, horn, and lights where the upstream device provides them. | The dashboard calls `button.press` on the existing upstream Stellantis button entity. It does not wrap it in a package script, duplicate the button, or create a new remote-command service. |

### Explicit non-entities

The current release deliberately creates **none** of the following:

- Home Assistant automations;
- scripts;
- input helpers (`input_boolean`, `input_number`, `input_select`, or
  `input_text`);
- package-owned buttons, switches, number controls, calendars, device trackers,
  services, events, webhooks, polling timers, or notification routes.

This boundary keeps installation self-contained. Removing the config entry
removes the seven package-owned entities; it does not alter the selected
Stellantis device, its Recorder history, or any household configuration. The
current foundation release does not yet purge its private local session-store
file on removal. Reinstalling with the same slug can therefore reuse that local
cache; explicit cache cleanup is planned before a public release.

