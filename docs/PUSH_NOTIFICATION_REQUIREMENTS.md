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

The executable Codex handoff is in `docs/CODEX_PUSH_NOTIFICATION_REWORK.md`.
