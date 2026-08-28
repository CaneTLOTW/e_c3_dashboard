# Codex handoff – Push notifications / availability / charge-start forecast

Repository: `CaneTLOTW/e_c3_dashboard`

Target branch: `develop`

Baseline before this work: `main` and `develop` are aligned at `ba1f59650fd670b613c5073f4b8f99d9a10c9fdc` (0.5.45). The accepted vehicle/UI changes must not regress.

## Goal

Bring the portable e-C3 notification package up to the useful configurability of the former household KFZ dashboard, while correcting two pieces of domain logic:

1. vehicle availability must no longer be inferred from arbitrary vehicle values that naturally remain unchanged while the car sleeps; use a verified vehicle-freshness/temperature heartbeat instead;
2. charge-start notifications must prefer the upstream Stellantis charge-end forecast and only estimate locally when that forecast is unavailable or stale.

Do not touch the frontend bootstrap/strategy loader, Hero image lifecycle, vehicle overview wrapper, GPS, trip/charge-history reconstruction, or remote-command semantics outside the explicit notification/wake-up scope.

## Source facts already established

### Charge limit is already safely mappable

`coordinator.py` deliberately preserves translation-key + domain addresses because upstream exposes the same translation key for both charge-limit entities. The expected mapping keys are:

- `battery_charging_limit_switch`
- `battery_charging_limit_number`

Upstream Stellantis currently exposes translation key `battery_charging_limit` as both a switch and a number.

### Upstream charge-end entity already exists

The selected upstream device can expose `battery_charging_end`. Upstream code also adjusts that value when its own charge-limit switch is enabled. The e-C3 package must therefore prefer the mapped upstream `battery_charging_end` when it is available, fresh and plausibly in the future.

### Current e-C3 fallback is too simplistic

`notifications.py::_evaluate_charge_start()` currently:

- waits a fixed 10 minutes;
- assumes a fixed target of 80%;
- uses one current derived power value;
- calculates its own finish time even when Stellantis already exposes a charge-end time.

This must change.

### Current availability source is unsuitable

`notifications.py::_latest_upstream_update()` scans `last_updated`-style attributes over all mapped upstream entities. Values such as mileage, SOC and position can legitimately remain unchanged for hours while a parked vehicle sleeps, so this can generate false offline episodes.

The upstream base sensor writes a source `last_updated` attribute only when its value changes. Therefore a constant temperature value cannot automatically be assumed to refresh that attribute. Runtime evidence is required before choosing the final heartbeat timestamp.

## Phase A – runtime audit BEFORE changing availability logic

Use the existing HA runtime/Recorder history to establish what really happens around normal polling and a wake-up.

Do not provoke repeated remote commands. One controlled wake-up is enough if historical data do not already prove the behavior.

Audit the mapped entities for the configured vehicle, especially:

- `temperature`
- `command_status`
- `wakeup`
- `vehicle` / tracker
- `battery`
- `autonomy`
- `battery_charging`
- `battery_charging_end`
- `battery_charging_limit_switch`
- `battery_charging_limit_number`

For the temperature entity compare, where available:

- state value;
- source attribute such as `last_updated` / localised equivalent;
- HA `last_updated`;
- HA `last_changed`;
- HA `last_reported` (if exposed by the installed HA version);
- Recorder timestamps across periods where the numeric temperature did not change.

Correlate those timestamps with the upstream command-status history around a wake-up. In particular distinguish statuses such as accepted/forwarded (`900` / `903`) from an actual fresh vehicle payload. A command being accepted or forwarded by Stellantis confirms the server path, not necessarily that the vehicle answered.

Questions the audit must answer explicitly:

1. When the temperature value remains numerically unchanged, is there still a timestamp/`last_reported` signal that proves a fresh vehicle payload?
2. After one wake-up, which timestamp/entity is the first reliable proof of a fresh vehicle response?
3. Does `command_status = completed` correlate with a fresh temperature/vehicle payload, or can it occur without one?
4. Is `battery_charging_end` actually populated during a real charge, and how fresh is it?
5. Are the charge-limit switch/number mappings present and do they reflect the configured upstream limit?

Post the sanitised audit result to the GitHub issue before/with implementation. Do not include VIN, GPS coordinates, account IDs or raw private exports.

## Phase B – notification settings become package-owned and configurable

Replace hard-coded notification thresholds/timers with package-owned persistent settings. They should be adjustable without editing YAML and should be visible from the generated Notifications view, comparable to the old KFZ notification view.

Preferred implementation: native e-C3 package entities (`number` and `time` platforms, or another equally HA-native package-owned mechanism) backed by the existing per-config-entry notification Store. Do not create household helpers or hard-coded entity IDs.

Required settings and defaults:

| Setting | Default | Notes |
| --- | ---: | --- |
| Low-range warning | 25 km | warn below |
| Low-range reset | 30 km | hysteresis reset above |
| At-home low-SOC warning | 30% | vehicle home, engine off, not charging |
| At-home low-SOC reset | 35% | hysteresis |
| At-home low-SOC delay | 20 min | candidate must persist |
| 12-V warning | 50% | service battery |
| 12-V reset | 55% | hysteresis |
| Availability stale threshold, inactive vehicle | 3 h | final source is decided by Phase A |
| Availability stale threshold, active/charging vehicle | 2 h | retain conservative old default unless runtime audit supports a better value |
| Availability probe wait | 15 min | after one wake-up probe |
| Charge-start notification delay | 10 min | allow forecast/power to stabilise |
| Quiet-hours start | 22:00 | applies to non-urgent availability warning |
| Quiet-hours end | 07:00 | queue one warning for delivery after quiet hours |

Validation requirements:

- reset thresholds must remain above their warning thresholds;
- percentages 0–100;
- times/durations bounded sensibly;
- changing a setting must not reset notification episode markers;
- existing installs migrate to these defaults without enabling any notification or wake-up switch.

The Notifications view should also show the already persisted last-notification diagnostic:

- type;
- title/message (sanitised normal user message);
- timestamp.

No new push is generated for this diagnostic; it is display only.

## Phase C – corrected availability / temperature heartbeat

The old `latest timestamp across arbitrary mapped entities` logic must be removed as the primary outage criterion.

Desired semantic contract:

- A parked vehicle is not offline merely because SOC, mileage, position or range have not changed.
- The primary heartbeat should represent a genuinely fresh vehicle response, with temperature preferred because runtime observations show it can still be retrieved while the vehicle is parked.
- The exact timestamp signal must come from the Phase-A audit. Prefer a source timestamp that advances on a fresh temperature payload even when the numeric temperature is unchanged. If the installed HA/upstream combination exposes a trustworthy `last_reported` only for actual fresh coordinator payloads, it may be used; do not assume this without audit evidence.
- If temperature freshness cannot be proven from an unchanged temperature value, use the narrowest proven vehicle-response timestamp discovered in Phase A. Document the fallback. Do not fall back to `max(last_updated)` over unrelated static entities.

Episode flow:

1. heartbeat exceeds the configured stale threshold;
2. mark outage candidate;
3. if availability probe is enabled, send **one** wake-up request for the episode;
4. wait configured probe interval;
5. only a proven fresh vehicle heartbeat clears the candidate;
6. if still stale, create exactly one `Fahrzeug nicht erreichbar` notification;
7. if warning time falls within quiet hours, persist it and deliver once after quiet-hours end if the vehicle is still stale;
8. when a proven fresh heartbeat returns after a reported outage, send exactly one `Fahrzeug wieder verbunden` notification and clear the episode.

`command_status` accepted/forwarded alone must not clear the outage. It can be recorded as probe diagnostics.

Keep restart-safe markers in the existing private Store.

## Phase D – charge-start end-time hierarchy

When the charge-start report is due, use the following hierarchy.

### 1. Preferred: Stellantis-provided end time

Use mapped `battery_charging_end` if:

- state is valid;
- timestamp is plausible and in the future;
- freshness is acceptable for the active charging episode.

The notification should identify it internally/diagnostically as source `stellantis_end_time` (user-visible wording does not need to expose implementation jargon).

### 2. Fallback target SOC

If no valid upstream end time is available:

- if `battery_charging_limit_switch` is ON **and** `battery_charging_limit_number` is valid and greater than current SOC, target that configured limit;
- otherwise target **100%**;
- never hard-code 80% as default.

If an active limit is already reached/below current SOC, do not produce a nonsensical remaining-time estimate.

### 3. Fallback charging power

Use recent derived charging power from the package's active-charge samples.

Preferred algorithm:

- collect the latest one or two positive, plausible `derived_power_kw` samples from the current charging episode;
- if two recent samples exist, use their arithmetic mean;
- if only one exists, use it;
- reject stale/zero/negative/implausible samples;
- do not average the whole session if that would hide a current AC/DC power change.

Then calculate remaining battery-side energy from current SOC to target SOC using the active capacity value (existing package fallback capacity only if the live capacity is unavailable), and derive duration/end time. Mark this as an estimate.

If neither upstream end time nor a defensible recent power sample exists, send a charge-start notification without a fabricated precise finish time, or wait until a later evaluation within the same episode. Do not spam repeated start notifications.

## Phase E – frontend / diagnostics

Notifications view:

- retain master switch, categories, recipients and test button;
- add a compact `Benachrichtigungseinstellungen` section for the package-owned threshold/time settings;
- add a compact `Letzte Meldung` diagnostic (type, timestamp, title/message where practical);
- add availability diagnostics useful for runtime verification: current heartbeat source, last proven heartbeat, outage/probe state, last probe result/status;
- keep Wake-up controls in the Wake-up view unless a read-only diagnostic is needed in Notifications.

Do not move unrelated System/ABRP settings back into Vehicle.

## Tests

Add regression coverage at minimum for:

- settings defaults and persistence;
- warning/reset hysteresis uses configured values;
- home low-SOC delay uses configured value;
- quiet-hour queue + one-time morning delivery;
- availability does not use arbitrary latest entity timestamp;
- forwarded/accepted wake-up status alone does not count as vehicle recovery;
- recovery only after proven fresh heartbeat;
- upstream charge-end time wins over local estimate;
- charge limit ON + valid number => limit is fallback target;
- charge limit OFF => 100% fallback target;
- invalid limit => 100% fallback target;
- two recent positive power samples are averaged; one sample is accepted; invalid samples do not produce a fake estimate;
- no duplicate charge-start push;
- existing notification opt-in remains OFF after migration;
- frontend displays settings/last-notification diagnostics without household-specific IDs.

Run all existing Python/Node/JSON/whitespace/Hassfest/HACS gates.

## Version / runtime acceptance

Target next frontend/integration candidate: **0.5.46** unless implementation requires a later version because another develop commit lands first.

Before runtime deployment:

- exact Candidate SHA recorded;
- GitHub Validate fully PASS;
- no `main` update.

Runtime acceptance must verify:

1. existing Vehicle/Home Hero behavior unchanged;
2. existing trip/charge completion notifications still work structurally;
3. new notification settings render and persist;
4. last-notification diagnostic renders;
5. one controlled availability/wake-up test follows the audited heartbeat semantics;
6. charge-start hierarchy can be verified from states without forcing unnecessary charging/remote actions;
7. browser and HA app remain functional.

Report `Candidate / Runtime / Validated` separately. STOP after runtime report. Promote to `main` only after explicit user PASS of the exact validated SHA.
