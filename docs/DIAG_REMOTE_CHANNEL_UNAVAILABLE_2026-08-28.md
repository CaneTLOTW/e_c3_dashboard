# Remote connection / remote command entities unavailable

Observed 2026-08-28 in the live Home Assistant installation.

## Observation

The e-C3 Dashboard temporarily showed several remote-oriented values unavailable/grey, including Remote connection, Last remote command and some charging-control values. The Wake-up view also reported the remote connection as unavailable.

Crucially, the older household e-C3/KFZ dashboard showed the same Remote connection / Last remote command unavailability at the same time, while normal vehicle telemetry continued to update.

## Resolution

The Stellantis/upstream module was not correctly signed in. After the user authenticated the module again, the remote-oriented values returned.

This confirms the problem as an **upstream/session/authentication issue**, not an `e_c3_dashboard` frontend or mapping regression.

Normal telemetry and the remote-command connection can have independent availability. Fresh SOC/range/location therefore does not imply that the remote-command channel is healthy.

## Consequence

- No `e_c3_dashboard` code change is required for this incident.
- No further runtime audit is required while the remote channel remains healthy.
- If the symptom returns, check upstream Stellantis authentication/session/config-entry health before changing dashboard mappings.

Issue: #17
