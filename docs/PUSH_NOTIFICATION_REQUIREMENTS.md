# Push notification requirements

This document summarises the accepted functional requirements for the next e-C3 notification iteration.

- Preserve existing trip-completed, charge-completed, low-range, at-home charge-reminder, 12-V, charge-start, outage and recovery notifications.
- Make notification warning thresholds and timing parameters package-owned and configurable without household YAML.
- Add quiet hours for non-urgent availability warnings.
- Show last notification type/time/message diagnostics in the Notifications view.
- Rework vehicle availability to use a proven fresh vehicle-response heartbeat, preferably temperature freshness, rather than the newest timestamp among arbitrary static vehicle values.
- Audit real HA/Recorder behavior first to determine how unchanged temperature values expose freshness and how wake-up command statuses correlate with a fresh vehicle response.
- A Stellantis command status such as accepted/forwarded is server-path evidence, not by itself proof that the vehicle answered.
- Charge-start notification must prefer the upstream `battery_charging_end` forecast.
- If no usable upstream end time exists, calculate a local fallback to the configured Stellantis battery charge limit when the limit switch is ON and the limit is valid; otherwise use 100%.
- The local fallback must use one or two recent positive derived charge-power samples from the active charging episode, averaging two when available, rather than a fixed 80% target or a whole-session average.
- Never fabricate a precise end time when neither upstream forecast nor a defensible local estimate is available.

## Notifications dashboard UI contract

The package-owned Number/Time entities are not sufficient by themselves. The Notifications view must visibly expose the configuration and diagnostics without requiring the user to open the entity registry.

The Notifications view must show editable controls for all notification settings, grouped so the meaning is obvious:

- **Warning thresholds:** range warning/reset, at-home SOC warning/reset, 12-V warning/reset.
- **Timing / availability:** low-SOC delay, stale/availability timeouts, probe wait, charge-start delay.
- **Quiet hours:** quiet start and quiet end.
- **Diagnostics:** last notification type, time and message; current heartbeat source/time; current outage/probe state where available.

Use user-facing localized labels rather than raw entity IDs or backend setting keys. The diagnostics must be rendered readably; do not dump a raw Python/dict representation into a Markdown card.

The frontend must not silently hide the settings because the dashboard Strategy happened to generate before the Number/Time entity registry entries were published. After all platforms have been forwarded, the status/control mapping must be refreshed deterministically, and the Notifications view must receive the complete Number/Time mapping on a normal dashboard load without requiring a Home Assistant restart or manual entity-registry navigation.

Acceptance for this UI is explicit: after deployment and a normal browser/app reload, the user can see and edit every setting listed above directly in the e-C3 **Notifications** view.

The executable Codex handoff is in `docs/CODEX_PUSH_NOTIFICATION_REWORK.md`.
