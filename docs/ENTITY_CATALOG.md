# Entity catalog and data quality

## Scope and naming

`e_c3_dashboard` never recreates or renames entities from
[Stellantis Vehicles](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles).
It reads only entities belonging to the vehicle selected during setup and adds
the seven sensors and explicit-consent controls in this catalog.

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
| **Distance since last charge**  `sensor.<vehicle>_dashboard_distance_since_last_charge` | Current upstream odometer minus the odometer at the latest charge. The package reconciles the upstream **Last charge** timestamp with the local Recorder odometer around that time; attributes contain the baseline, timestamp and source. | **High for the distance delta, with a semantic boundary.** It survives package/Core restarts and can be established after installation when Recorder still has the relevant odometer state. During a charge observed live, the local result supplies the same baseline. If Recorder has already purged the matching time or the upstream timestamp is unavailable, the state deliberately remains unknown rather than inventing a distance. |
| **Current trip energy**  `sensor.<vehicle>_dashboard_current_trip_energy` | Live battery-side energy used since the package observed engine-on: start SOC minus current SOC × reported battery capacity (or 43.4 kWh fallback). Available only while the engine entity is on. | **Low.** This is intentionally a practical live approximation. It updates only when SOC changes, is affected by SOC granularity and delayed API delivery, and is not a measurement of energy drawn at the plug or motor terminals. |
| **Last local trip result**  `sensor.<vehicle>_dashboard_last_local_trip_result` | One locally recorded trip row after engine-off. State is the travelled distance; attributes include start/end times, distance, odometer values, duration, average speed, SOC, capacity, energy, and consumption. | **Mixed.** Distance is **high** when the upstream odometer arrived. Energy and consumption are **low** SOC/capacity estimates. Finished drives wait separately for a delayed odometer value, so a new drive does not merge into the preceding one; the recorded duration still ends at motor-off. Only trips whose start and end were observed by the package are present. |
| **Current charge power**  `sensor.<vehicle>_dashboard_current_charge_power` | Battery-side charging-power estimate from the energy represented by the latest SOC increase divided by the elapsed time since the previous SOC sample. Available only while the upstream charging entity is on. | **Low.** This is not a charger telemetry value. It can remain unchanged or unavailable until a new SOC percentage arrives, and it is affected by whole-percent SOC, irregular update intervals, capacity fallback, and delayed API delivery. It is useful as a coarse AC/DC charging trend only. |
| **Last local charge result**  `sensor.<vehicle>_dashboard_last_local_charge_result` | One locally recorded completed charging row. Attributes include AC/DC type as reported upstream, start/end SOC, duration, battery capacity, estimated energy, average/maximum estimated power, and sample data. | **Mixed.** Charge type is the upstream-reported value. Energy, average power, and maximum power are **low** battery-side estimates derived from SOC and time; they exclude charging losses and are not suited for billing. Finalisation waits two minutes after charge-off, so duration can include a small post-charge delay. Only charges observed by the package are recorded. |
| **Notification and wake-up switches** `switch.<vehicle>_dashboard_*` | Package-owned master/topic switches, optional automatic wake-up switches, and one switch per selected Notify recipient. | **Control.** All are off on first installation. They persist per config entry and never alter Notify or Stellantis entities. |
| **Wake vehicle now / Test notification** `button.<vehicle>_dashboard_*` | Package-owned actions. Wake-up presses the mapped upstream wake-up button; the test button sends only after a recipient and the notification master are explicitly enabled. | **Control.** Wake-up success means the command was requested, not that the vehicle has responded. |

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

### Observed ë-C3 upstream delivery

The following is a vehicle-specific observation from retained Recorder data,
not a Stellantis API guarantee. It complements the remote-control results in
the [ë-C3 capability matrix](STELLANTIS_EC3_CAPABILITY_MATRIX.en.md).

| Upstream data | Observed quality and timing | Consequence for package values |
| --- | --- | --- |
| **Position** | GPS updates were observed at sampled drive ends. No matching update was seen at drive starts; intermittent `unknown` tracker states while parked are not new location fixes. | The GPS view is a sparse route history, not live tracking. |
| **Temperature** | One completed wake-up was followed by a new temperature value after about one minute. Temperature was also regularly delivered during sampled charging and driving sessions, normally in irregular multi-minute intervals. | Show freshness. A wake-up may refresh it, but must not be represented as a guaranteed temperature read. |
| **Battery SOC** | Only full percentages were delivered in the sampled charge and drives. | SOC-derived trip energy, charging energy and power remain intentionally coarse estimates. |
| **Odometer** | Sampled updates arrived with drive-end/engine-off events rather than at drive start. | Local trip finalisation waits for the delayed odometer. Distance-based results are trustworthy only after that value arrived. |


## Recorder retention: required user check

The **History display window** option is a dashboard query limit, not a data
retention setting. It defaults to 2,160 hours (90 days) and can be changed in
**Settings → Devices & services → e-C3 Dashboard → Configure**.

Before relying on a chosen window, the user must verify the Home Assistant
Recorder configuration:

1. `purge_keep_days` must be at least as long as the desired history window.
   Home Assistant's default is 10 days, so the default 90-day package view
   cannot show 90 days unless the user increases Recorder retention.
2. If Recorder uses an `include` allowlist, it must include the selected
   Stellantis vehicle tracker and the upstream battery, charging state,
   charging type/capacity, and last-trip entities used by the views, as well as
   the package-owned local result sensors.
3. The user should size database retention for their storage and backup
   capacity. This package never changes Recorder retention, filters, database,
   or purge schedule.

If less history exists than the display window, the cards show the available
subset without creating an error or attempting to reconstruct missing data.
InfluxDB remains optional for long-term analysis outside this package.

## Supporting components

The entities above are only one part of the package. The following components
provide dashboard behaviour without adding automations, scripts, or input
helpers to Home Assistant.

| Component | What it does | Data source, persistence, and limitations |
| --- | --- | --- |
| **Trip history card** | Renders the 90-day trip table and details in the dashboard. | Uses the Home Assistant WebSocket history API to read Recorder history for the upstream **Last trip** sensor and the package **Last local trip result** sensor. It does not create one entity per trip. Historical availability is limited by the user's Recorder retention and by trips observed after package installation for local energy fields. |
| **Charging history card and curve browser** | Reconstructs completed AC/DC charge sessions and shows a selectable charge curve. | Reads Recorder history for the selected vehicle's upstream charging state, SOC, charging type, capacity, and the package current-charge-power/last-charge-result sensors. Curves are reconstructed in the browser from timestamped SOC samples. They are not raw BMS or charger telemetry and can be sparse when the upstream API reports infrequently. |
| **GPS history view** | Shows the selected global date range as route lines and dots, plus current coordinates and data age. | Delegates historical rendering to `ha-map-card` using the selected upstream vehicle tracker. It creates no tracker or route entity. GPS history exists only where the tracker was retained in Recorder; API positions can be sparse and separate trips can be joined by straight lines. |
| **Local metrics manager** | Starts and finalises local trip/charge sessions, samples SOC during charging, refreshes the seven sensors, and emits package completion events for the optional report module. | An event listener watches only the selected upstream engine, charging, and SOC entities. It does not poll Stellantis or alter the upstream integration's refresh interval. The five-minute post-drive and two-minute post-charge waits are one-shot local callbacks to allow delayed upstream data to arrive. |
| **Notification and wake-up manager** | Stores opt-in consent/markers, sends selected Notify messages, evaluates warnings and performs only explicitly enabled automatic wake-ups. | A one-minute local timer evaluates package logic; it never polls the Stellantis API. All routes and switches are off after installation. Exact behaviour and messages are documented in `NOTIFICATIONS_AND_WAKEUP.en.md`. |
| **Restart-safe local store** | Keeps active sessions, the last result, and compact trip/charge buffers across restarts. | Uses Home Assistant's private storage under a config-entry-specific `e_c3_dashboard_<slug>_metrics` key. It retains at most 250 local trip rows and 250 charge rows. This is supporting data, not an entity and not a replacement for Recorder or InfluxDB. |
| **Community Dashboard strategy and cards** | Registers the e-C3 dashboard views and package-owned trip/charge custom cards. | Registers versioned Lovelace JavaScript resources under `/e_c3_dashboard/`. It reads the selected-device mapping from **Dashboard status** and has no fixed VIN, tracker ID, image, or household helper. |
| **Remote-action controls** | Exposes wake-up, charging, climate, locks, horn, and lights where the upstream device provides them. | The dashboard calls `button.press` on existing upstream buttons. Its package-owned manual wake-up control only adds persistent activity tracking; it does not duplicate Stellantis commands. |

### Explicit non-entities

The current release deliberately creates **none** of the following:

- Home Assistant automations;
- scripts;
- input helpers (`input_boolean`, `input_number`, `input_select`, or
  `input_text`);
- package-owned number controls, calendars, device trackers, services, webhooks,
  direct Stellantis API clients, or third-party notification credentials.

This boundary keeps installation self-contained. Removing the config entry
removes package-owned entities and its private local metric/notification store;
it does not alter the selected Stellantis device, its Recorder history, or any
household configuration.
