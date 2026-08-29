# e-C3 Dashboard 0.5.49 clean rebuild – consolidated requirements

Status: requirements freeze before source rebuild

## Baseline and rebuild boundary

- Rebuild from `531b2a28d1db995466dd5e87089c0fbc9bba4269`, i.e. the clean 0.5.48 source plus the corrected repository/runtime workflow documentation.
- Do not use `ae1d77d9c0d244ca29f43fae59928fecd02179b5` or its follow-up repair commits as the implementation base. They are reference material only.
- The currently deployed household runtime remains 0.5.48 until a new exact candidate is explicitly deployed.
- Preserve already accepted/stable areas unless a requirement below explicitly says otherwise: Hero/vehicle overview lifecycle, frontend loader/resource ownership, startup non-blocking behavior, native GPS period selector architecture, canonical GPS archive, notification Store major version 1.
- `main` remains unchanged until explicit maintainer PASS.

## 1. Notification configuration and recipients

### 1.1 Package-owned settings

The Notifications dashboard must expose and edit the package-owned controls, grouped and readable:

- Range warning / reset.
- At-home SOC charge recommendation warning / reset.
- 12-V warning / reset.
- At-home warning delay.
- Reachability stale timeout at home.
- Reachability stale timeout away/active.
- Probe wait time.
- Charge-start notification delay.
- Quiet-hours start / end.

Requirements:

- Values are real package-owned Number/Time entities and persist across restart.
- Warning/reset hysteresis remains validated and cannot be configured in an invalid order.
- German HA UI must show German entity names. The remaining English names in the device page `Sensoren` block must be translated as well.
- Dashboard labels must be short/readable; avoid clipped labels. Use sensible wrapping or shorter display labels rather than backend-key text.

### 1.2 Recipients

Target UX:

- Notify services may be discovered only as *available choices*.
- Discovery must never implicitly opt every discovered target into e-C3 notifications.
- User explicitly selects one or more recipients.
- Dashboard should provide a clear `Empfänger verwalten` / add-entry point rather than displaying a household-specific recipient as if hard-wired.
- Multiple selected recipients are supported.
- Selected recipients may have individual enable/disable switches if that remains the package control model.
- Existing legacy recipient state may only be preserved when there is evidence that the recipient was explicitly enabled/selected before migration; mere discovery is not sufficient.
- A newly discovered `notify.*` service must not receive notifications until explicitly selected and enabled.
- Test notification goes only to currently selected/enabled recipients.
- Failure of one recipient must not block delivery to other selected recipients.

### 1.3 Notification logic retained/validated

Preserve the existing notification families:

- trip completed;
- charge completed;
- low range;
- at-home charge recommendation;
- 12-V warning;
- charge-start report;
- availability outage and recovery.

Required semantics:

- Temperature/vehicle source freshness is the preferred proven vehicle heartbeat.
- `accepted` / `forwarded` command status alone is never recovery evidence.
- Optional wake-up probe may be used once in the availability flow, followed by the configured wait.
- Quiet-hours availability warning is defer-not-drop: only an otherwise eligible outage warning is buffered; it is sent after quiet hours if the outage still exists and cleared if genuine recovery occurs first.
- Charge-start forecast hierarchy:
  1. fresh upstream `battery_charging_end` belonging to the active charge episode;
  2. otherwise target = active valid upstream charge limit when the limit switch is on, else 100%;
  3. fallback power = latest one or two recent positive plausible active-charge derived-power samples, averaging two when both are usable;
  4. if there is no defensible end estimate, do not fabricate a precise end time.
- Last-notification diagnostics expose type, time and message.
- Availability diagnostics expose heartbeat source/time, outage state/time and probe state/time in human-readable form.

Real-world destructive or inconvenient states must not be manufactured solely for testing. Event-driven cases may be accepted progressively when they occur naturally.

## 2. Trip outlier – root-cause analysis first, guard second

Known problematic server/history row from the live dashboard:

- around 25 August, approx. 13:14;
- roughly 9 minutes duration;
- displayed distance about 1,048 km;
- displayed average speed about 6,822.4 km/h;
- observed indication that the calculation used a start odometer of 0.

This must not be treated merely as a display outlier. Before choosing the permanent guard, determine what actually happened.

### Required forensic comparison

For the affected trip, compare as far as the available runtime data allows:

- raw Stellantis server trip payload/fields;
- normalized `server_history` trip row;
- start/end timestamps and duration;
- raw distance and its unit/source;
- source/API average speed and any unit conversion;
- start/end odometer values;
- local metrics/pending-trip reconciliation if the row crossed that path;
- persisted server-history and metrics Store values relevant to the trip;
- whether `0` is a real odometer value, missing-data sentinel, restored value, mapping error or wrong row association;
- whether the distance came directly from the server or was derived from odometer difference;
- whether the speed came from an API field or from distance/duration fallback.

Capture only sanitized evidence. Do not commit VIN, coordinates, raw private exports or household identifiers.

### Permanent data-quality behavior

Once the cause is understood, implement the narrowest general protection that addresses the cause. At minimum:

- impossible/sentinel odometer values must not create a 1,000+ km journey;
- an implausible source speed must not be replaced by an equally implausible distance/time fallback;
- distance, duration, odometer delta and speed should be cross-checked where enough independent data exists;
- questionable raw server rows remain available for diagnostics/archive; do not delete/rewrite the canonical raw archive solely to make the UI look clean;
- invalid rows must not feed rolling consumption/statistics;
- UI should show `—`/diagnostic wording for invalid derived values instead of publishing a fake distance, speed or consumption;
- quality reason/source should be inspectable for debugging.

If the incident proves to be a one-off upstream data error, document that conclusion and keep only conservative guards that do not reject legitimate long trips.

## 3. 500-km average consumption

The live value around 13.8 kWh/100 km looked unexpectedly low and must be validated, not assumed wrong.

Required analysis:

- identify the exact source rows used by the rolling 500-km calculation;
- prove whether the calculation uses canonical server trips, local trips, or a mixture;
- show accumulated accepted distance and energy and number of trips/sessions contributing;
- prove that invalid/outlier trips cannot enter the result;
- verify the partial-trip/window boundary behavior when crossing 500 km;
- verify energy basis and SOC/capacity estimation assumptions;
- if 13.8 is supported by the underlying valid data, keep it and document why; if not, fix the calculation/source selection.

Useful diagnostics may be exposed as attributes such as source, accepted trip count, accepted distance and accepted energy, provided they do not expose private location data.

## 4. Dashboard/UI polish observed in runtime

### 4.1 Things that already work and should not regress

- Start page / main dashboard generally works.
- Last trip and total mileage display work.
- Charge-curve view loading on first entry is acceptable.
- GPS `Alle` and normal period selection are functional.
- Blue Recorder history plus orange server history are intentionally different data sources; do not remove one merely because both appear together.
- Current-trip energy being unavailable/grey while there is no usable active-trip value is not by itself a bug.
- Vorklimatisierung active-color behavior (red at <=20 C, blue above 20 C) is still pending natural user testing; preserve the accepted implementation rather than redesigning it now.

### 4.2 GPS view

- Remove the displayed `GPS-Genauigkeit ±10 m`; this value is not useful in this view and was observed as effectively constant.
- Preserve the native HA `energy-date-selection` period picker and explicit `Alle` action.
- Same selected interval must continue to drive blue Recorder history and orange server GeoJSON filtering.
- Current vehicle marker remains independent and visible.
- No archive deletion or backend GPS Store mutation.

### 4.3 Wake-up view

- The small `Stündlicher Wake-up` and `Erreichbarkeitsprobe mit Wake-up` cards are currently hard to read. Prefer full-width/stacked cards instead of two cramped side-by-side bubbles.
- `Fahrzeug jetzt aufwecken` should visually fit the Bubble-Card language better while remaining a real button action (`button.press`), not a state switch.
- Other wake-up controls should remain readable on desktop and mobile; do not force long labels into clipped one-line pills.

### 4.4 Notifications view

- Top notification/category cards need enough width and a solid/readable presentation; avoid cramped/translucent-looking cards.
- Recipient management must be clear and not look like a fixed household recipient.
- Settings groups should remain visible here even though the same entities also naturally exist on the HA device page; the dashboard is an intentional task-oriented mirror, not a second store of values.
- Diagnostics should remain easy to scan.

### 4.5 System view

- `Verbindungs- und Einrichtungsstatus` and the mapped-upstream count should look consistent with the Bubble-Card visual language.
- `Zugeordnete Upstream-Entitäten` must show the actual count, not duplicate `ready`.

### 4.6 Help view

- Update Help content to the current functionality: trips/data-quality semantics, charging history/curves, GPS period selection, notifications/recipient setup, wake-up controls, System diagnostics and relevant limitations.
- Help is the rightmost view.

### 4.7 View order

The user specified the order **from right to left** as:

`Help → System → Notifications → Wake-up → GPS → Trips → Statistics → Charging → Vehicle`

Therefore the actual Home Assistant tab order **left to right** must be:

`Vehicle → Charging → Statistics → Trips → GPS → Wake-up → Notifications → System → Help`

Do not reverse this interpretation again.

## 5. Startup and integration setup must stay non-blocking

Preserve the 0.5.48 startup fix:

- optional Stellantis server/maintenance history initialization may not block config-entry/bootstrap setup;
- do not reintroduce `await hass.async_block_till_done()` in config-entry setup;
- notification Number/Time/control publication must not require draining unrelated global HA tasks;
- Notification Store remains major version 1; do not delete or manually mutate the existing user Store as a migration shortcut.

## 6. Privacy for screenshots and debugging artifacts

Before screenshots or runtime evidence are committed/uploaded to a public repo/Issue:

- crop unrelated HA navigation/sidebar when not needed;
- remove/mask VIN;
- remove street names, exact addresses, coordinates and private map details when not needed;
- anonymize personal notify/mobile-app target names;
- remove credentials, tokens, account IDs and other private identifiers;
- strip image metadata where practical.

Keep only the minimum information needed to demonstrate the technical behavior.

## 7. Codex role for this rebuild and future work

For this workstream, ChatGPT owns the source rebuild, architecture, tests and durable documentation.

Codex is primarily the runtime executor:

- sync/deploy an exact prepared candidate SHA;
- backup the package when instructed;
- perform the required reload/restart once when source changes need it;
- continue directly with task-specific functional validation after the normal startup interval;
- inspect live entities/Stores/log evidence where the requirement explicitly needs runtime forensics;
- report sanitized observations back to ChatGPT.

Codex may make only a small, obvious local correction during execution when it is necessary to continue and does not change architecture/feature semantics (e.g. typo, missing import, wrong cache string, narrow guard). Any such change must be reported explicitly with file, exact change, reason and repeated test. If the fix changes feature behavior, data model, architecture or requires non-trivial code generation, Codex stops and returns the finding for ChatGPT implementation.

Routine restart handling is task-driven: one requested restart when required, normal wait, then the next real functional test. MCP/port/Supervisor/health endpoints are diagnostic tools only when the next actual task step fails or connectivity itself is under investigation; they are not separate acceptance gates.

## 8. Clean-rebuild validation plan

Before Codex receives a runtime handoff:

- compare the clean rebuild against baseline `531b2a28...` and account for every changed file;
- compare behavior against the current dirty/repair line only as a reference, never by blindly transplanting it;
- Python compile, all package JS syntax checks, Node regression tests, JSON validation and `git diff --check` PASS;
- HACS/Hassfest/Validate PASS for the exact candidate;
- frontend cache version bumped consistently for changed modules.

Runtime acceptance after deployment should cover, without artificial destructive vehicle states:

- German device/entity labels including the Sensor block;
- recipient selection/add/manage flow and no implicit recipient opt-in;
- safe test notification to the selected recipient(s) and diagnostics update;
- edit/persist/restore representative Number and Time settings;
- Notifications/Wake-up/System layout and text readability;
- View order on desktop/app;
- affected-trip forensic evidence and resulting UI/statistics behavior;
- 500-km consumption source/result validation;
- GPS day, arbitrary range, week/month preset where offered, `Alle`, return from `Alle` to today, marker persistence and navigation without F5;
- no regression of main vehicle/Hero/charging views.

`main` is not updated until the maintainer explicitly accepts the relevant runtime result.