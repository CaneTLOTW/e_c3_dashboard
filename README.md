# e-C3 Dashboard — DEPRECATED / NO LONGER MAINTAINED

> [!CAUTION]
> **This repository is obsolete and no longer maintained.**
> The last legacy release is **v0.5.53**. It will receive **no further feature updates or routine bug fixes**.
> **Use [SV Dashboard](https://github.com/CaneTLOTW/sv_dashboard) instead.**
> SV Dashboard is a **separate Home Assistant / HACS integration**, **not an in-place update** of `e_c3_dashboard`.
> HACS will not automatically replace this integration with SV Dashboard.

## Install the maintained successor: SV Dashboard

[![Open SV Dashboard in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=CaneTLOTW&repository=sv_dashboard&category=integration)

- **New project:** https://github.com/CaneTLOTW/sv_dashboard
- **Installation guide:** https://github.com/CaneTLOTW/sv_dashboard/blob/main/docs/INSTALLATION.en.md
- **Stable releases:** https://github.com/CaneTLOTW/sv_dashboard/releases/latest
- **Report new bugs and request support:** https://github.com/CaneTLOTW/sv_dashboard/issues
- **Questions and discussion:** https://github.com/CaneTLOTW/sv_dashboard/discussions

### Moving from the legacy integration

1. Add or open **SV Dashboard** in HACS as an **Integration** (use the button above), and install the latest stable release.
2. Restart Home Assistant and configure the new **SV Dashboard** integration using your existing **Stellantis Vehicles** integration.
3. Verify the newly generated dashboard and vehicle entities. The old and new integration domains/configuration are different; **do not expect an automatic migration of dashboard configuration, entities or retained local histories**.
4. Once the new installation is verified and anything you need from the old dashboard is backed up, remove the old **e-C3 Dashboard** integration/config entry from Home Assistant. Do not delete your Stellantis Vehicles integration.

**Do not wait for a v0.5.54 update in this repository:** fixes developed for SV Dashboard, such as the trip-average-speed unit fix described in [legacy Issue #42](https://github.com/CaneTLOTW/e_c3_dashboard/issues/42), are **not delivered to e-C3 Dashboard v0.5.53**.

## Historical archive

This repository is retained only for historical reference and existing issue links. The last published legacy package remains available under [v0.5.53](https://github.com/CaneTLOTW/e_c3_dashboard/releases/tag/v0.5.53); its original source, older documentation, and issue history are preserved in Git history.

**Status:** Deprecated / unmaintained. Please do not submit new issues, PRs or dependabot updates here; use the actively maintained [SV Dashboard repository](https://github.com/CaneTLOTW/sv_dashboard).
