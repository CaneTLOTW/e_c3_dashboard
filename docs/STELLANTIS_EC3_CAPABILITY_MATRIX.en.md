# ë-C3 capability matrix

## Scope and method

This table separates three things that are often confused:

1. a control entity being created by the upstream integration;
2. the upstream MQTT connection accepting a command request; and
3. the actual ë-C3 completing that command.

The upstream integration creates most remote-control buttons whenever its
global *Remote commands* option and MQTT connection are available. It does not
have a reliable per-model capability manifest. A visible button is therefore
not evidence that a particular ë-C3 supports it.

This matrix was checked on **2026-08-13** against the local ë-C3, upstream
Stellantis Vehicles **2026.7.2**, its current source code, current entity
states, and the locally retained command-status history from 2026-08-08 to
2026-08-13. The historical tests were deliberate local tests; this package
does not run remote-command tests automatically.

`Completed` is an upstream command-lifecycle result. It proves that the
request was accepted and completed by the upstream command path, **not** that
the vehicle-side effect was observed. The only remote vehicle function
verified in regular local use is preconditioning.

## Live result

| Function | Upstream entity / mechanism | Local ë-C3 observation | Classification for this dashboard | Notes |
| --- | --- | --- | --- | --- |
| Vehicle status, SOC, range, odometer, temperature, position | Native Stellantis sensors and device tracker | Present and populated; latest vehicle payload was about 2 h 20 min old at the audit. | **Use, with freshness indicator** | Direct upstream values, but updates are event/API driven rather than live telemetry. |
| Last trip / last charge | Native Stellantis sensors | Present with distance, duration/average speed respectively charging start data. | **Use** | The package supplements energy only as a local SOC-based estimate. |
| Wake-up | `button…_aufwecken`, MQTT `/VehCharge/state` | Several requests reached **`Abgeschlossen`** in the retained command history. | **Use carefully** | It requests a data refresh; it is not proof of an immediate vehicle response. Upstream rate-limits wake-up to six requests per 20 minutes. |
| Start preconditioning | `button…_vorklimatisierung_starten`, MQTT `/ThermalPrecond` | Repeated command records reached **`Abgeschlossen`**; this is the remote function verified in regular local use. | **Confirmed working** | The upstream integration also requires engine off, doors locked, and at least 20% SOC or active charging. |
| Stop preconditioning | `button…_vorklimatisierung_stoppen` | Command records reached **`Abgeschlossen`**. It belongs to the locally verified preconditioning function. | **Confirmed working** | It uses the same thermal-preconditioning command family as start. |
| Lock / unlock doors | `button…_türen_verriegeln` / `…entriegeln`, MQTT `/Doors` | Both lock and unlock returned **`Nicht kompatibel`** in local ë-C3 command history. | **Not compatible on the tested ë-C3** | The entities are generic upstream controls. Keep them out of portable actionable controls. |
| Horn | `button…_hupe`, MQTT `/Horn` | Returned **`Nicht kompatibel`** in local ë-C3 command history. | **Not compatible on the tested ë-C3** | Do not offer it as a functioning ë-C3 feature. |
| Flash / parking lights | `button…_standlicht`, MQTT `/Lights` | Returned **`Nicht kompatibel`** in local ë-C3 command history. | **Not compatible on the tested ë-C3** | Do not offer it as a functioning ë-C3 feature. |
| Start charging | `button…_fahrzeug_laden_starten`, MQTT `/VehCharge` | **`unavailable`**. | **Not usable currently** | The integration additionally needs a recognised scheduled-charge start time and compatible charge state. A `00:00:00` time entity alone does not make the command available. |
| Stop charging | `button…_fahrzeug_laden_stoppen`, MQTT `/VehCharge` | The command history contains both **`Fehler`** and one **`Abgeschlossen`** result; the current button is **`unavailable`** and no physical charge interruption was verified. | **Not usable currently** | Do not interpret one lifecycle completion as proof that charging stopped. The dashboard must not present it as an operable control. |
| Charging limit | `number` + `switch` for charge limit | Both controls are available (`85%`, switch off); no command completion test was performed. | **Configuration available, effect unverified** | The upstream integration can enforce its own limit by issuing a delayed charge-stop command; that still depends on the unavailable charging command path. |
| Scheduled charging time | `time…_start_des_batterieladevorgangs` | Present as `00:00:00`. | **Display/config only** | Its presence does not establish that the ë-C3 accepts remote start/stop. |
| ABRP sync | `switch…_abrp_sync` | **`unavailable`**. | **Not configured** | Requires a valid 36-character ABRP token. It is not a Stellantis vehicle control. |
| Battery-value correction | `switch…_korrektur_der_batteriewerte` | Present, off. | **Local integration option** | It corrects an upstream residual-battery interpretation; it does not change vehicle data or vehicle behaviour. |

## Dashboard policy

The e-C3 Dashboard package may show all mapped upstream values, but it treats
remote actions differently:

- **Primary actionable controls:** wake-up and preconditioning start/stop.
- **Unavailable controls:** start/stop charging are shown disabled by Home
  Assistant and must not be described as functioning.
- **Incompatible generic controls:** the locally tested ë-C3 returned `Not
  compatible` for doors, horn, and lights. They are not advertised as ë-C3
  capabilities.
- **No automatic command tests:** a package must never test locks, horn,
  lights, preconditioning, or charging merely to discover compatibility.

The upstream project documents that remote commands require E-remote or
Connect Plus and warns that frequent wake-ups can affect the service battery.
It also lists its generic capability matrix; this document is the stricter
vehicle-specific interpretation for the local ë-C3. See the upstream
[Stellantis Vehicles documentation](https://github.com/andreadegiovine/homeassistant-stellantis-vehicles#features).

## How to confirm another control safely

1. Verify **Remote connection** is on and the latest vehicle-data timestamp is
   reasonably fresh.
2. Trigger exactly one safe, deliberate command from Home Assistant.
3. Wait for the upstream **Last remote command** sensor to settle.
4. Record `Completed`, `Not compatible`, timeout, or no update in this table.
5. If the upstream reports `not_compatible`, it disables that button for the
   current coordinator session; do not work around that guard in the dashboard.

This keeps the portable project honest: it can automate and display only what
the selected vehicle has actually demonstrated.

## Observed ë-C3 telemetry behaviour

The following observations come from retained Recorder data on 2026-08-11 to
2026-08-13. They are useful operating expectations for this vehicle, not an
API contract and not a guarantee for another ë-C3, firmware version, or
privacy mode.

| Upstream value | Observed delivery behaviour | Dashboard implication |
| --- | --- | --- |
| GPS position | In the sampled drives, the device tracker changed at the drive endpoint/engine-off event. No corresponding position update was observed at engine-on. Tracker transitions through `unknown` while stationary are connectivity state changes, not evidence of a new GPS fix. | Treat GPS history as sparse. Describe the usual refresh as **after a drive**, not as live tracking or a guaranteed start-of-drive update. |
| Temperature | A successful wake-up at 22:24 CEST on 2026-08-13 was followed by a new temperature value about one minute later. During a sampled charge it changed roughly every 1–5 minutes; it was also regularly updated during sampled drives. | A wake-up can refresh temperature, but the dashboard must retain a freshness indicator and must not promise an update for every request. Temperature is regular event telemetry, not a live stream. |
| Battery SOC | A sampled charge moved from 47% to 100% as integer values, typically at multi-minute intervals. Sampled driving data was likewise quantised to full percentages. | All SOC-derived energy, power and consumption values are estimates. Never display artificial decimal precision or treat the result as metering data. |
| Odometer | In the sampled drives, the odometer updated exactly with the engine-off/trip-end events; no update was observed at the corresponding engine-on events. | Treat the odometer as a delayed end-of-drive value. Trip finalisation must wait for it, and dashboard copy must not claim an odometer update at drive start. |
