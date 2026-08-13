# Contributing

Thanks for improving e-C3 Dashboard.

## Before opening an issue

- Check the [installation guide](docs/INSTALLATION.en.md),
  [entity catalog](docs/ENTITY_CATALOG.md), and
  [Stellantis ë-C3 capability matrix](docs/STELLANTIS_EC3_CAPABILITY_MATRIX.en.md).
- Confirm the issue also occurs with a supported version of Home Assistant and
  the upstream Stellantis Vehicles integration.
- Redact VINs, account IDs, exact home locations, GPS tracks, Notify recipient
  names, tokens, and raw exports. Do not attach `.storage` files.
- Use [Discussions](https://github.com/CaneTLOTW/e_c3_dashboard/discussions)
  for questions, early ideas, compatibility observations, and screenshots;
  reserve Issues for reproducible bugs and mature feature proposals.

See the [community guide](docs/COMMUNITY.en.md) for the full reporting and
discussion rules.

## Development principles

- Preserve the upstream boundary: this project consumes Home Assistant entities
  from Stellantis Vehicles and does not call the Stellantis API.
- Never hard-code a vehicle, VIN, entity ID, image URL, user, or notify target.
- New dashboard behaviour must handle unavailable or absent upstream entities.
- Add German and English strings at the same time; see
  [localisation](docs/LOCALISATION.en.md).
- Keep third-party HACS cards as dependencies. Do not vendor or modify them.

## Verification

Run the validation commands in [AGENTS.md](AGENTS.md). Also test a newly
created config entry and Community Dashboard on a disposable dashboard. Do not
change an existing household dashboard as part of a package test.

## Pull requests

Describe the user-visible change, the upstream entity/capability it relies on,
and how it was tested. Update documentation whenever setup, an entity, a
calculation, a notification, or a dependency changes.
