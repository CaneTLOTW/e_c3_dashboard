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

Run the validation commands in [AGENTS.md](AGENTS.md). Runtime acceptance uses
the designated Home Assistant instance and must deploy the exact candidate
`develop` SHA. Record that SHA and the result in the GitHub Issue. Test a newly
created config entry when onboarding/config-flow behavior changed and verify the
automatically created dashboard after frontend changes.

## Branches and stable promotion

All implementation, documentation, tests and candidate version changes are
committed to `develop`. Do not develop or hotfix directly on `main`.

`develop` is the integration/acceptance branch. The designated Home Assistant
instance may intentionally run an exact `develop` commit for real-world
validation. `main` is the last accepted, publishable state.

After runtime acceptance and maintainer approval, `main` is moved forward to
the **exact validated `develop` SHA** using a fast-forward promotion. Do not
squash, rebase or cherry-pick the accepted change set during that promotion;
the stable commit must remain the same commit that was tested. Tags and GitHub
releases are created from that promoted `main` SHA.

At a healthy release boundary `main` and `develop` are identical. Between
releases, `develop` may be ahead of `main`; the two branches must not contain
independent lines of feature/fix commits. If they diverge, reconcile the
histories before the next release.

See [Branch and deployment workflow](docs/BRANCH_AND_DEPLOYMENT_WORKFLOW.md)
for the complete contract.

## Pull requests and review

Describe the user-visible change, the upstream entity/capability it relies on,
and how it was tested. Update documentation whenever setup, an entity, a
calculation, a notification, or a dependency changes.

Pull requests may be used for review of `develop` work, but the stable
promotion itself must preserve the exact accepted commit SHA. Do not create a
new squash/rebase commit merely to move validated code to `main`.
