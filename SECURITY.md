# Security policy

## Supported versions

Security fixes are applied to the latest version on the `main` branch.

## Reporting a vulnerability

Please use a private GitHub Security Advisory for vulnerabilities whenever it
is available. If private reporting is unavailable, open a minimal public issue
that contains no exploit details and request a private follow-up.

Never include vehicle identification numbers, locations, account identifiers,
credentials, access tokens, Home Assistant backups, `.storage` files, or raw
entity exports in a report. Redact screenshots before sharing them.

This project does not operate a backend service and does not receive vehicle
data. Security reports should therefore focus on the integration code,
packaged frontend resources, dependency handling, or unsafe command behaviour.
