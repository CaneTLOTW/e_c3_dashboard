# Release checklist

## Branch flow

- [ ] Development work is on `develop`; it has passed the repository checks
      and been tested through the HACS `develop` version.
- [ ] A pull request from `develop` to `main` describes the release scope and
      has been reviewed before merge.
- [ ] The GitHub release is created from the resulting `main` commit, never
      directly from `develop`.

Before changing repository visibility or publishing a release:

- [x] Remove all private household references, exports and images.
- [x] Select and add a license.
- [ ] Add GitHub repository description and topics.
- [ ] Confirm Issues are enabled.
- [x] Add `CODEOWNERS` and security guidance.
- [ ] Validate `manifest.json`, `hacs.json` and translations.
- [ ] Run HACS Action and Hassfest successfully.
- [ ] Test installation from a clean HA instance.
- [ ] Verify that setup is rejected until Stellantis Vehicles exposes battery,
      mileage and vehicle-tracker entities for the selected device.
- [ ] Test the config-flow resource preflight and the browser-side fallback
      with each of Bubble Card, Button Card, ha-map-card and layout-card
      missing one at a time.
- [ ] Test the e-C3 picture-marker compatibility shim in browser/HA dark mode;
      verify that unrelated ha-map-card markers remain unchanged.
- [ ] Test German and English UI.
- [ ] Test an upstream update and clean integration unload/reload.
- [ ] Create GitHub Release `v0.1.0` with migration notes.
