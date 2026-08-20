/*
 * Compatibility shim for picture markers rendered by ha-map-card.
 *
 * ha-map-card owns the marker's shadow DOM, so dashboard CSS cannot reliably
 * override its dark-mode background. The e-C3 dashboard opts in only its own
 * picture markers through --ec3-transparent-picture-marker: 1.
 */
(() => {
  const MARKER_TAG = "map-card-entity-marker";
  const OPT_IN_PROPERTY = "--ec3-transparent-picture-marker";
  const PATCH_FLAG = Symbol.for("e_c3_dashboard.transparent_picture_marker");

  const shouldPatch = (host) =>
    host?.style?.getPropertyValue(OPT_IN_PROPERTY)?.trim() === "1";

  const applyTransparentBackground = (host) => {
    if (!shouldPatch(host)) {
      return;
    }

    const marker = host.shadowRoot?.querySelector(".marker.picture");
    if (!marker) {
      return;
    }

    marker.style.setProperty("background", "transparent", "important");
    marker.style.setProperty("background-color", "transparent", "important");
  };

  const applyToExistingMarkers = () => {
    document
      .querySelectorAll(MARKER_TAG)
      .forEach(applyTransparentBackground);
  };

  customElements.whenDefined(MARKER_TAG).then(() => {
    const MarkerClass = customElements.get(MARKER_TAG);
    if (!MarkerClass || MarkerClass.prototype[PATCH_FLAG]) {
      return;
    }

    const originalConnectedCallback = MarkerClass.prototype.connectedCallback;
    MarkerClass.prototype.connectedCallback = function (...args) {
      const result = originalConnectedCallback?.apply(this, args);
      queueMicrotask(() => applyTransparentBackground(this));
      return result;
    };

    const originalUpdated = MarkerClass.prototype.updated;
    MarkerClass.prototype.updated = function (...args) {
      const result = originalUpdated?.apply(this, args);
      applyTransparentBackground(this);
      queueMicrotask(() => applyTransparentBackground(this));
      return result;
    };

    Object.defineProperty(MarkerClass.prototype, PATCH_FLAG, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    applyToExistingMarkers();
  });
})();
