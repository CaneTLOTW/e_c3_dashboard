# Maintainer notes for coding agents

This file is a compact operating guide for AI-assisted and automated changes.
It complements, rather than replaces, [CONTRIBUTING.md](CONTRIBUTING.md).

## Scope and architecture

- This repository is a portable companion integration for
  `andreadegiovine/homeassistant-stellantis-vehicles`; it must never call the
  Stellantis API directly.
- Select one upstream vehicle through the config flow. Discover and map its
  entities via the entity/device registries; never derive entity IDs from a
  VIN, a friendly name, or a hard-coded household slug.
- Keep package-owned metrics, session markers and notification state in the
  config-entry storage. Do not edit a user's `.storage` dashboard files or
  `configuration.yaml`.
- Dashboard JavaScript must use the integration's mapped status entity and
  remain safe when an upstream entity is missing, unavailable or changed.

## Privacy and compatibility

- Do not commit VINs, GPS tracks, screenshots containing private data, exports,
  tokens, recipient names, credentials, or raw Home Assistant config.
- Do not copy code from proprietary Stellantis applications. Use only the
  public upstream integration contract documented in the capability matrix.
- New functionality must degrade visibly and safely rather than pretending a
  remote command or data value is supported.

## User-facing text

- Config and options flow text belongs in `strings.json` plus `translations/`.
- Custom dashboard/card text belongs in `static/i18n.js`.
- Notification and Logbook text belongs in `i18n.py`.
- Add German and English together. Do not place language conditionals in
  calculations or notification logic.

## Validation before a pull request or release

Run at least:

```sh
python3 -m py_compile custom_components/e_c3_dashboard/*.py
node --check custom_components/e_c3_dashboard/static/i18n.js
node --check custom_components/e_c3_dashboard/static/e_c3_dashboard.js
node --check custom_components/e_c3_dashboard/static/trip-history-card.js
node --check custom_components/e_c3_dashboard/static/charge-history-card.js
python3 -m json.tool hacs.json
python3 -m json.tool custom_components/e_c3_dashboard/manifest.json
git diff --check
```

Test a fresh config entry and its automatically created dashboard on a
non-production instance before changing dashboard onboarding. Keep HACS, Home
Assistant Core and Stellantis Vehicles compatibility explicit in the docs.
