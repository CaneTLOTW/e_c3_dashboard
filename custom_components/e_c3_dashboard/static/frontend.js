/* Single Home Assistant Lovelace entry point for the complete e-C3 package. */
const REQUIRED_ELEMENTS = [
  ["bubble-card", "Bubble Card"],
  ["button-card", "Button Card"],
  ["map-card", "ha-map-card"],
  ["layout-card", "layout-card"],
];
const DEPENDENCY_GRACE_MS = 10000;

const waitForElement = async ([tag, name]) => {
  if (customElements.get(tag)) return { tag, name, ready: true };
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(false), DEPENDENCY_GRACE_MS);
  });
  const defined = customElements.whenDefined(tag).then(() => true);
  const ready = await Promise.race([defined, timeout]);
  clearTimeout(timeoutId);
  return { tag, name, ready };
};

/*
 * Narrow third-party compatibility shim: ha-map-card owns the marker shadow
 * DOM, so dashboard CSS cannot make only our picture marker transparent.
 * This is intentionally the only runtime prototype hook in the package and is
 * scoped by --ec3-transparent-picture-marker:1. It never touches the LIVE hero
 * or dashboard Strategy.
 */
const installTransparentMapMarkerCompatibility = () => {
  const tag = "map-card-entity-marker";
  const property = "--ec3-transparent-picture-marker";
  const flag = Symbol.for("e_c3_dashboard.transparent_picture_marker");
  const apply = (host) => {
    if (host?.style?.getPropertyValue(property)?.trim() !== "1") return;
    const marker = host.shadowRoot?.querySelector(".marker.picture");
    if (!marker) return;
    marker.style.setProperty("background", "transparent", "important");
    marker.style.setProperty("background-color", "transparent", "important");
  };

  customElements.whenDefined(tag).then(() => {
    const MarkerClass = customElements.get(tag);
    if (!MarkerClass || MarkerClass.prototype[flag]) return;

    const connected = MarkerClass.prototype.connectedCallback;
    MarkerClass.prototype.connectedCallback = function (...args) {
      const result = connected?.apply(this, args);
      queueMicrotask(() => apply(this));
      return result;
    };

    const updated = MarkerClass.prototype.updated;
    MarkerClass.prototype.updated = function (...args) {
      const result = updated?.apply(this, args);
      apply(this);
      queueMicrotask(() => apply(this));
      return result;
    };

    Object.defineProperty(MarkerClass.prototype, flag, { value: true });
    document.querySelectorAll(tag).forEach(apply);
  });
};

installTransparentMapMarkerCompatibility();

/*
 * Start package modules immediately. Only the dashboard Strategy itself waits
 * for external HACS custom elements. Existing-but-still-loading cards therefore
 * no longer produce a false missing-dependency page during the first reload.
 */
const packageModules = Promise.all([
  import("./trip-history-card.js?v=0.5.52"),
  import("./charge-history-card.js?v=0.5.52"),
  import("./gps-history-card.js?v=0.5.52"),
  import("./vehicle-overview-card.js?v=0.5.52"),
]);
const dependencyReadiness = Promise.all(REQUIRED_ELEMENTS.map(waitForElement));

await packageModules;
window.__ec3DashboardDependencyReadiness = await dependencyReadiness;
await import("./e_c3_dashboard.js?v=0.5.52");
