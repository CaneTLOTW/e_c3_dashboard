# Community guide

e-C3 Dashboard is a small volunteer-maintained project. This guide explains
where a contribution belongs and helps keep the tracker useful and safe for
everyone.

## Choose the right place

| Place | Use it for | Do not use it for |
| --- | --- | --- |
| [Bug report](../.github/ISSUE_TEMPLATE/bug_report.yml) | A reproducible problem in a released version | Setup questions, a single unavailable upstream value, or private data |
| [Feature request](../.github/ISSUE_TEMPLATE/feature_request.yml) | A well-defined, portable improvement | Early ideas or requests tied to one household |
| [Discussions](https://github.com/CaneTLOTW/e_c3_dashboard/discussions) | Questions, ideas, feedback, screenshots, and sharing configurations | Reproducible defects that need tracking |
| Private security advisory | Vulnerabilities or accidental data exposure | General product support |

## Discussions

Use the category that best matches the topic:

- **Q&A** for installation, configuration, and usage questions.
- **Ideas** for early proposals that need community feedback before becoming a
  feature request.
- **Show and tell** for dashboards, screenshots, automations, and practical
  e-C3 experiences.
- **General** for project-wide feedback and compatibility observations.

Discussion threads are community support. A reply is welcome but not
guaranteed, and neither the project nor its maintainers can provide vehicle,
Stellantis account, or Home Assistant support on a fixed schedule.

## Good reports

For a bug report, include the e-C3 Dashboard, Home Assistant, and Stellantis
Vehicles versions; the affected view or package-owned entity; concise steps to
reproduce; and anonymised logs or screenshots. First verify that the upstream
Stellantis integration is configured and exposes working vehicle entities.

For a feature request, explain the user need, describe the portable behaviour,
and identify the existing upstream entities or capabilities it would rely on.
Features must not require a VIN, a hard-coded vehicle, a specific household
layout, or a private service.

## Privacy

Never publish a VIN, vehicle or home location, GPS history, credentials,
tokens, account identifiers, notification recipients, raw entity exports,
Home Assistant backups, or `.storage` files. Redact screenshots before
uploading them. If you accidentally share sensitive data, remove it promptly
and open a private security advisory for help.

## Scope

This project is a dashboard companion for the upstream Stellantis Vehicles
integration. It does not implement the Stellantis API, authentication, or
remote vehicle commands. Upstream API availability, polling limitations, and
vehicle-specific capabilities may vary by model, region, account, and time.
