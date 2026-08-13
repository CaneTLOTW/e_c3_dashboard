# Localisation

The project supports German (`de`) and English (`en`). English is the
fallback language.

Home Assistant config and options flows use the standard integration files:

- `strings.json` is the source schema.
- `translations/en.json` and `translations/de.json` are loaded by Home
  Assistant for the backend UI.

Custom Lovelace modules are browser code, so Home Assistant does not inject the
backend translation catalog into them. Their shared catalog is
`custom_components/e_c3_dashboard/static/i18n.js`; it resolves the current
browser/UI language and also respects an explicit card `language: de|en`
option. The dashboard strategy and both history-card modules use it.

Server-side notifications and Logbook messages are rendered before they reach
Home Assistant's Notify service. Their catalog is
`custom_components/e_c3_dashboard/i18n.py` and follows the configured Home
Assistant language.

When adding a user-visible package string, add both German and English entries
to the relevant catalog. Do not add language conditionals to business logic or
vehicle-data calculations. Upstream entity state, attribute values, and remote
commands are never translated or modified by this package.
