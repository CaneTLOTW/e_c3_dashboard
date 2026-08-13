# Release checklist

Before changing repository visibility or publishing a release:

- [ ] Remove all private household references, exports and images.
- [ ] Select and add a license.
- [ ] Add GitHub repository description and topics.
- [ ] Confirm Issues are enabled.
- [ ] Add `CODEOWNERS` and contribution/security guidance.
- [ ] Validate `manifest.json`, `hacs.json` and translations.
- [ ] Run HACS Action and Hassfest successfully.
- [ ] Test installation from a clean HA instance.
- [ ] Test all mandatory HACS dependencies missing one at a time.
- [ ] Test German and English UI.
- [ ] Test an upstream update and clean integration unload/reload.
- [ ] Create GitHub Release `v0.1.0` with migration notes.
