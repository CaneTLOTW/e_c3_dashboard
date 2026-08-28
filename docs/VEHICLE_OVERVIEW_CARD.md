# Compact vehicle overview card

## Purpose

`custom:e-c3-dashboard-vehicle-overview-card` is the reusable compact vehicle card for Home Assistant start pages and overview dashboards. It belongs to the `e_c3_dashboard` integration and uses the same config-entry/entity mapping contract as the generated e-C3 dashboard.

The card is not a household-specific YAML copy and must not contain a VIN, fixed entity IDs, a fixed dashboard URL or Stellantis API calls.

## User-facing content

The default compact layout shows:

- the current vehicle picture from the mapped vehicle tracker;
- battery SOC;
- estimated range;
- mileage;
- charging state and, while charging, current charging power when available;
- one compact refresh/wake-up action;
- one compact preconditioning action;
- tap on the non-action area opens the package-owned e-C3 vehicle dashboard.

The card must degrade safely when one optional entity is missing or unavailable. A late `entity_picture` update must appear without reloading the page.

## Configuration

Minimal configuration for the normal single-vehicle setup:

```yaml
type: custom:e-c3-dashboard-vehicle-overview-card
```

Optional configuration:

```yaml
type: custom:e-c3-dashboard-vehicle-overview-card
entry_id: <e_c3_dashboard config-entry id>
navigation_path: /optional/manual/path/vehicle
name: e-C3
show_actions: true
```

Rules:

- If exactly one e-C3 status entity exists, `entry_id` is optional.
- If more than one e-C3 config entry exists, the card must require/select an `entry_id` rather than guessing.
- `navigation_path` is an override only. The normal path is derived from the selected e-C3 status/config-entry metadata.
- `show_actions: false` provides a read-only compact display.

## Data contract

The card discovers a status sensor by these attributes:

- `integration_domain == e_c3_dashboard`;
- `entity_mapping` is an object;
- optional matching `entry_id`.

It then consumes only mapped Home Assistant entities. Relevant keys include, when available:

- `vehicle_tracker` from the status entity;
- `battery`;
- `autonomy`;
- `mileage`;
- `battery_charging`;
- `battery_charging_rate` or package metric `current_charge_power`;
- `wakeup` and/or package control `manual_wakeup`;
- `preconditioning_start`;
- `preconditioning_stop`.

No entity ID may be derived from VIN or friendly name.

## Vehicle picture

The card uses the live mapped tracker state on every `hass` update:

```text
hass.states[vehicle_tracker].attributes.entity_picture
```

The URL is not frozen when the card is configured. When the upstream tracker publishes the picture later, the card re-renders it automatically. The card itself does not use the `ha-map-card` marker compatibility logic.

## Navigation

The status contract exposes/derives the package-owned dashboard route. Default navigation targets the `vehicle` view. The card must never link back to the historic household `/dashboard-kfz/...` dashboard.

## Actions

Action buttons stop click propagation so pressing them never also navigates.

Refresh/wake-up:

1. prefer the package control entity `manual_wakeup` when available;
2. otherwise use mapped upstream `wakeup`;
3. call `button.press` only when the selected entity is a button.

Preconditioning:

- press mapped `preconditioning_start` when available;
- do not fabricate service calls if the upstream control is missing/unavailable.

The card may show unavailable controls disabled rather than hiding the whole card.

## Frontend packaging

The card is part of the same `e_c3_dashboard` HACS package. It is loaded through the package's single registered Lovelace frontend entry point and must not add another Lovelace resource or a runtime strategy patch.

Physically separate internal ES modules are acceptable for maintainability. They are implementation modules of the same package, not independent HA resources.

## Acceptance criteria

- card is available in the Lovelace card picker as `e-C3 Fahrzeugübersicht` / `e-C3 Vehicle Overview`;
- minimal YAML works for one configured vehicle;
- no VIN or household entity IDs are hard-coded;
- picture appears/reacts without F5;
- SOC/range/mileage update live;
- charging state and power update live;
- refresh/wake-up and preconditioning actions use mapped entities;
- normal card tap opens the package-owned `/vehicle` view;
- action taps do not navigate;
- Light/Dark and mobile/desktop are usable;
- missing optional entities degrade visibly and safely;
- no additional Lovelace resource and no post-generation patch are introduced;
- repository/static tests and the designated HA runtime acceptance pass before promotion to `main`.
