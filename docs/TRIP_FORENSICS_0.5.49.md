# Trip forensics notes for 0.5.49

This note records the public upstream field contract that should be used when
investigating the known impossible 25-August trip. It is background for runtime
forensics, not a conclusion about the household row.

## Public upstream evidence

The companion integration is built on
`andreadegiovine/homeassistant-stellantis-vehicles`; e-C3 Dashboard does not call
the Stellantis API directly.

Public upstream source and sanitized issue logs show the normal trip payload
shape as:

- `distance`: trip distance represented directly by the upstream Last Trip
  sensor as kilometres;
- `startMileage`: odometer at trip start, represented as kilometres;
- `duration`: seconds;
- `kinetic.avgSpeed`: emitted by the Stellantis trip API in metres per second;
  the upstream integration converts it to km/h with `m/s × 3.6` for its Last
  Trip sensor;
- `startedAt` / `stoppedAt`: timestamps;
- `startEnergies` / `endEnergies`: trip boundary SOC/autonomy data;
- `energyConsumptions[].consumption`, when present: energy value consumed by the
  server trip record and converted by e-C3 Dashboard to kWh.

Normal public examples contain values such as `distance: 18.0`,
`startMileage: 149.0`, `kinetic.avgSpeed: 6.9`; another vehicle example contains
`distance: 21.2`, `startMileage: 40611.7`, `kinetic.avgSpeed: 15.83`.

Public examples also demonstrate that individual Stellantis fields can be
internally inconsistent or sentinel-like. For example, a trip can contain an
obviously unusable boundary SOC while the other trip fields remain plausible.
Therefore a single anomalous field must not automatically be treated as a unit
change for the whole API.

Useful references:

- upstream `custom_components/stellantis_vehicles/base.py` and `sensor.py`;
- upstream issue 493 for a sanitized e-C3 trip payload example.

## What this means for the 25-August row

Do not assume any of the following before looking at the retained live data:

- that `distance=1048` was actually metres;
- that e-C3 Dashboard invented `startMileage=0`;
- that the displayed ~6,822 km/h came from Stellantis `kinetic.avgSpeed`;
- that `startMileage + distance` is an independent end-odometer observation.

The current normalization derives an end mileage from start mileage plus server
distance when the API provides no independent end-mileage field. That derived
value is useful for display compatibility but must **not** be cited as an
independent odometer cross-check during forensics.

The strongest discriminator is the retained `raw_server` row:

- if it already contains roughly `distance: 1048` and/or `startMileage: 0`, the
  anomaly is upstream input and the dashboard needs conservative validation;
- if the retained raw record is plausible but normalized/compact values are
  impossible, the defect is in our normalization or row correlation;
- if the server row is plausible but a separate local metrics trip is bad, the
  defect is in the local pending-trip/odometer reconciliation path rather than
  the canonical server trip.

## Safe permanent behavior while cause is investigated

The 0.5.49 candidate deliberately keeps the raw server record in package-local
storage for diagnosis. A row whose distance/time combination implies an
impossible road speed, whose source/fallback speed is implausible, or whose
start odometer is an obvious zero sentinel is marked unsuitable for statistics.
The frontend suppresses fake derived distance/speed/consumption for such rows
rather than deleting the record.

This guard is intentionally separate from the root-cause conclusion. If runtime
forensics shows a narrower deterministic cause, adjust the source in a follow-up
ChatGPT-prepared commit before stable promotion rather than asking Codex to
redesign the model live.
