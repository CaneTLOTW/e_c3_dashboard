# Remote connection / remote command entities unavailable

Observed 2026-08-28 in the live Home Assistant installation.

## Observation

The e-C3 Dashboard currently shows several remote-oriented values unavailable/grey, including Remote connection, Last remote command and some charging-control values. The Wake-up view also reports the remote connection as unavailable.

Crucially, the older household e-C3/KFZ dashboard shows the same Remote connection / Last remote command unavailability at the same time, while normal vehicle telemetry continues to update.

## Classification

This is therefore **not currently classified as an e_c3_dashboard frontend regression**. The common dependency is the upstream `stellantis_vehicles` entity/capability/remote-command path. Normal telemetry and the remote-command connection may have independent availability, so fresh SOC/range/location data does not prove that the remote command channel is healthy.

## Next runtime audit

Read-only first:

1. Resolve the exact mapped upstream entities from the e-C3 status sensor for remote connection, last remote command, charge limit, charge-limit active and charge start.
2. Compare their state, availability, `last_changed`/`last_updated` and device/config-entry ownership.
3. Inspect the upstream Stellantis Vehicles config-entry state and relevant integration logs around remote/MQTT connection establishment.
4. Distinguish:
   - upstream transport/session unavailable;
   - capability not supported/exposed for this vehicle;
   - stale/unavailable entity after upstream restart;
   - mapping error in e_c3_dashboard.
5. Do not issue real remote vehicle commands merely as a diagnostic unless explicitly approved.

## Acceptance

A diagnosis must explain why the same remote entities are unavailable in both the legacy and portable dashboards and whether any e_c3_dashboard code change is actually required.
