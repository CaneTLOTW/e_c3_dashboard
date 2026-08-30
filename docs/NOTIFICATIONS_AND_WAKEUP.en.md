# Notifications and wake-up

## Safety model: explicit opt-in

Installing e-C3 Dashboard does **not** send a notification and does **not** activate automatic wake-up behavior.

Notification delivery requires explicit choices at multiple levels:

1. choose one or more existing Home Assistant `notify.*` services in **Settings → Devices & services → e-C3 Dashboard → Configure**;
2. enable the package notification master switch;
3. enable the relevant topic switch (alerts, trip reports or charge reports);
4. enable the intended recipient switch.

Notify-service discovery is selection-only. A newly discovered service is never silently opted in.

Multiple selected recipients are supported. A delivery failure for one recipient must not prevent delivery to another active recipient.

## Package-owned notification settings

The settings are native e-C3 `number`/`time` entities and persist in the package notification Store.

| Setting | Default |
| --- | ---: |
| Range warning | 25 km |
| Range reset | 30 km |
| At-home SOC warning | 30 % |
| At-home SOC reset | 35 % |
| At-home warning delay | 20 min |
| 12-V/service-battery warning | 50 % |
| 12-V/service-battery reset | 55 % |
| Stale threshold at home/inactive | 3 h |
| Stale threshold away/active | 2 h |
| Reachability probe wait | 15 min |
| Charge-start notification delay | 10 min |
| Quiet-hours start | 22:00 |
| Quiet-hours end | 07:00 |

Warning/reset pairs retain valid hysteresis. Changing a setting does not intentionally reset existing one-shot/episode markers.

## Notification topics

The package can report the following events when the required switches/recipient consent are active:

| Event | Typical content |
| --- | --- |
| Completed trip | Distance, duration, speed and available SOC/estimated energy/consumption data. |
| Charge started | Current/start SOC and a defensible expected finish time when source data supports it. |
| Charge completed | Duration, SOC change and available estimated energy/power/charge-type data. |
| Low range | Current range/SOC below the configured warning threshold, with configured reset hysteresis. |
| At-home charge recommendation | Low SOC persisted for the configured delay while the vehicle is home, off and not charging. |
| 12-V/service battery warning | Reported service-battery value below the configured threshold, with reset hysteresis. |
| Vehicle unreachable | Confirmed stale vehicle heartbeat after the configured logic/probe path. |
| Vehicle recovered | One recovery notification after a previously reported outage and a proven fresh vehicle heartbeat. |

SOC-derived energy/power fields remain battery-side estimates and are not meter readings.

## Reachability heartbeat

A parked car can legitimately keep the same SOC, mileage, range or location for hours. Those unchanged values must not be used as a generic “latest entity timestamp” proof of connection.

The current package prefers a proven fresh vehicle/temperature source heartbeat. The selected heartbeat is exposed in notification diagnostics.

Important semantic rule:

- a Stellantis command status such as `accepted` or `forwarded` proves the server/command path accepted the request;
- it does **not** by itself prove that the vehicle returned a fresh payload;
- outage recovery requires a trustworthy fresh vehicle heartbeat.

## Availability episode flow

When the proven heartbeat exceeds the configured stale threshold:

1. the package starts an outage candidate;
2. if the reachability-probe switch is enabled, it may request one wake-up for the episode;
3. it waits the configured probe interval;
4. only a fresh vehicle heartbeat clears the candidate;
5. if the vehicle remains stale, one unreachable notification can be generated;
6. after a reported outage, one recovery notification can be generated when genuine freshness returns.

The probe is deliberately conservative. It must not become a high-frequency polling mechanism.

## Quiet hours

Quiet hours apply to non-urgent availability warnings.

A warning that becomes eligible during quiet hours is **deferred, not dropped**. At quiet-hours end:

- send it once if the vehicle is still stale and the episode is still eligible;
- discard the queued warning if genuine recovery happened first.

Quiet hours do not globally suppress trip/charge reports or every other message family.

## Charge-start expected finish time

The package uses a strict hierarchy so it does not invent a precise ETA:

1. prefer a valid, plausible and sufficiently fresh upstream `battery_charging_end` for the active charging episode;
2. otherwise use the configured upstream charging limit as target SOC when its limit switch is active and the value is valid above current SOC;
3. otherwise use 100 % as the fallback target;
4. estimate remaining time only from the latest one or two positive, plausible power samples from the active charge; if two are usable, average those two;
5. if neither upstream finish time nor a defensible recent-power estimate exists, omit a precise finish time rather than fabricating one.

There is no hard-coded 80 % default target.

## Wake-up controls

The Wake-up view contains package controls for:

- **Wake vehicle now** — manual package button that invokes the mapped upstream wake-up action and records diagnostics;
- **Hourly wake-up** — optional persisted switch;
- **Wake-up while charging** — optional persisted switch;
- **Reachability wake-up probe** — optional persisted switch used by the outage episode logic.

All automatic switches start off.

The existence/success of an upstream command entity is not a guarantee that the selected vehicle supports the physical operation. See the capability matrix for the tested ë-C3 behavior.

## Recipient management

Recipient selection lives in the Home Assistant integration options rather than being hard-coded into the generated dashboard or repository.

The Notifications view provides the package controls/management entry point and shows switches only for explicitly selected recipients that currently exist as Home Assistant Notify services.

No recipient credentials, mobile-app names, Telegram configuration or household IDs belong in this repository.

## Diagnostics

The Notifications/System state exposes useful package diagnostics including:

- last notification information;
- heartbeat source/time;
- outage/probe state;
- last wake-up/counter information;
- package control/entity mappings.

These diagnostics are intended to explain package behavior without dumping raw household stores or private upstream payloads.

## Persistence

Notification switches, settings, episode markers, last-notification diagnostics and wake-up counters are stored per config entry and survive Home Assistant restarts.

The notification Store intentionally remains on its backwards-compatible major schema version; new keys are populated with defaults rather than forcing an unnecessary Store major-version migration.

## Current QA status

The current 0.5.53 source implements the contract above, and the Notifications view/settings layout has already passed visual user acceptance.

Focused real-event QA for recipient delivery, quiet-hours deferral, heartbeat outage/recovery and charge-start hierarchy remains tracked in [GitHub Issue #23](https://github.com/CaneTLOTW/e_c3_dashboard/issues/23). Event-driven checks are allowed to complete progressively when the relevant real-world state occurs; the project does not manufacture disruptive vehicle states solely for testing.
