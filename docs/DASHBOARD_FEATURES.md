# Dashboard features

This document describes the generated e-C3 Dashboard as of the 0.5.53 feature
set. Exact values and available controls depend on the upstream Stellantis
entities exposed by the configured vehicle.

The current UI is deliberately structured by task. **Vehicle / LIVE** contains
the current vehicle state and recent activity; detailed histories live in
**Charging**, **Trips**, and **GPS**; aggregated metrics live in **Statistics**;
reachability and messaging are separated into **Wake-up** and **Notifications**;
and integration administration is kept in **System**.

## Public screenshots

The following examples were captured from the running dashboard, visually
reviewed and anonymized. Vehicle history, map/location information, recipient
details and private integration identifiers are either omitted or covered by
opaque redaction.

### Start-page card

![Compact vehicle overview card](assets/vehicle-overview-card.png)

### Generated dashboard

![LIVE vehicle view](assets/vehicle-live.png)

![Historical charging curves](assets/charging-history.png)

![Long-term statistics](assets/statistics.png)

![Trip history with rows redacted](assets/trips-history.png)

![GPS history with position and map redacted](assets/gps-history.png)

![Wake-up controls](assets/wakeup.png)

![Notification switches without recipient rows](assets/notifications.png)

![System controls](assets/system.png)

### Integration and entities

![Integration and entity overview with private identifiers redacted](assets/integration-entities.png)

## Compact vehicle overview card

`custom:e-c3-dashboard-vehicle-overview-card` is the reusable compact presentation
for an existing Home Assistant start page or mobility dashboard.

With a single configured vehicle it is zero-config apart from the card type:

```yaml
type: custom:e-c3-dashboard-vehicle-overview-card
```

It provides the vehicle picture, range, contextual temperature or charging
state, SOC/battery bar, cable/driving indicators and preconditioning. Tapping the
vehicle opens the generated `/vehicle` view. Range and the contextual right-hand
status expose native Home Assistant More Info.

The generated LIVE hero uses the same canonical card implementation internally
(`variant: live`). With multiple vehicles, the portable card can be bound to a
specific e-C3 config entry through `entry_id`.

See [Vehicle overview card](VEHICLE_OVERVIEW_CARD.md) for the full card contract.

## Vehicle / LIVE

Vehicle / LIVE is the primary day-to-day cockpit and intentionally focuses on
the **current** vehicle state.

It includes, where corresponding upstream data exists:

- LIVE hero with vehicle picture and battery/SOC presentation;
- range;
- contextual temperature or active charging information;
- remote-connection state;
- preconditioning/remote quick actions;
- consumption and usage information;
- odometer/mileage;
- current charging and range information;
- high-voltage battery health, including available SOH capacity/resistance data;
- 12-V/service-battery information;
- current position;
- latest trip;
- latest charge;
- shared vehicle and maintenance information popup.

Range and the contextual right-hand hero value expose native Home Assistant More
Info.

Detailed trip, charging and GPS histories are **not duplicated here**. They are
kept in the dedicated views below. Likewise, integration administration is kept
in System rather than mixed into Vehicle.

## Charging

Charging is the dedicated history view for completed charging sessions.

Supported presentation includes:

- selection of completed AC/DC charging sessions;
- available start/end SOC information;
- duration;
- energy in kWh when derivable from the available source data;
- average charging power when derivable;
- a reconstructed historical SOC/time curve.

The curve is reconstructed from vehicle-side history. It must not be interpreted
as a meter-grade wallbox power trace.

Current charging state remains part of Vehicle / LIVE; Charging is the detailed
session-history view.

## Statistics

Statistics contains aggregated and long-term metrics rather than individual trip
or charging rows. Depending on source availability, it presents:

- SOH capacity;
- SOH resistance;
- mileage;
- driven distance;
- trailing average consumption over approximately 500 km.

### Long-term statistics caveat

Driven-distance charts rely on Home Assistant long-term statistics for the
relevant source statistic. The dashboard deliberately does not conceal or
silently rewrite malformed historical LTS segments. If Home Assistant already
contains a statistics reset/discontinuity, a historical negative or otherwise
implausible period can remain visible until that stored statistics history is
corrected through a supported Home Assistant statistics path.

This is separate from canonical trip-history repair.

## Trips

Trips is the dedicated driving-history view and uses a canonical server-history
model rather than displaying every upstream row as trusted data.

The view provides:

- canonical server history;
- an explicit server-history refresh action;
- filters;
- data-quality handling;
- controls for zero-distance and short trips.

Canonical processing applies plausibility guards before a trip may participate
in downstream metrics. Invalid or unrepaired rows do not become
odometer-continuity anchors for later trips.

When an upstream trip contains an implausible odometer boundary and sufficiently
strong continuity evidence exists, the canonical layer may repair the **derived**
start/end boundary. The original upstream/raw record remains unchanged for
diagnostics. If the evidence is insufficient, the trip remains invalid instead
of inventing a replacement distance.

## GPS

GPS is the dedicated position-history view. It combines local Home Assistant
history and canonical server-side history while keeping the current vehicle
position separate.

The date controls include:

- Today;
- Yesterday;
- an explicit Home Assistant date/range picker;
- All.

The map/history layer can combine:

- Home Assistant Recorder points;
- canonical Stellantis server-history geometry;
- the current vehicle position as a distinct live marker.

The current position is not silently treated as another archived history point.
Vehicle / LIVE may show compact current-position information, while GPS handles
the historical exploration.

## Wake-up

Wake-up contains reachability controls rather than ordinary vehicle status.

The view includes:

- wake vehicle now;
- hourly wake-up;
- reachability probe with wake-up;
- wake-up while charging;
- remote-connection status.

### Reachability probe semantics

If the reliable vehicle heartbeat becomes older than the configured reachability
limit, the integration may send one wake-up as a probe and then wait for the
configured probe interval.

Recovery requires fresh, trustworthy vehicle data. A command status such as
`accepted` or `forwarded` alone does not count as recovery.

## Notifications

Notifications is the dedicated communication-policy view. Recipient activation
is always explicit.

The generated view includes:

- master notification switch;
- vehicle warnings;
- trip reports;
- charging reports;
- explicitly selected recipients;
- recipient management;
- test notification;
- warning and reset thresholds;
- reachability controls;
- probe wait time;
- charging-start delay;
- quiet hours;
- diagnostics.

### Recipient safety

Notify-service discovery may make a Home Assistant recipient available for
selection, but discovery must never silently activate that recipient. Sending
remains opt-in, and installation does not send a notification.

## System

System contains package/integration administration rather than everyday driving
information.

It includes:

- connection and setup status;
- detected upstream entity count;
- privacy/data-sharing state;
- refresh interval;
- battery-value correction;
- ABRP controls and status where configured.

This separation is intentional: Vehicle / LIVE remains focused on the car,
while System explains and controls how the e-C3 integration is operating.

## Integration, entities and configuration

Each e-C3 Home Assistant config entry maps the selected Stellantis vehicle and
its upstream entities dynamically. The generated dashboard therefore does not
need VIN-derived or household-specific fixed entity IDs.

The responsibilities are split as follows:

- **Config flow** — initial vehicle selection, module selection and explicit
  notification opt-in.
- **Home Assistant options** — later entry-level configuration changes.
- **System view** — ongoing runtime/operational integration controls and status.
- **Integration/device/entity view** — the Home Assistant technical view of the
  mapped entities.

With multiple vehicles, each config entry remains independent and owns its own
generated dashboard. The portable overview card can select a specific entry with
`entry_id`.

## Data ownership and privacy

The e-C3 Dashboard consumes Home Assistant entities created by the upstream
Stellantis integration and stores its own derived/canonical data where needed.
Raw upstream history used for diagnostics is not rewritten merely to make the UI
look plausible.

When publishing screenshots or diagnostics, remove or redact at least:

- VIN/chassis number;
- exact street names and private locations;
- GPS coordinates and private map positions;
- personal `mobile_app_*` or other Notify recipient names;
- config-entry IDs and other private identifiers;
- credentials, tokens and raw account exports.

Use opaque redaction for identifiers rather than reversible or weak visual
obfuscation.
