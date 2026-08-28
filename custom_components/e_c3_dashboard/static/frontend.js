/* Single Home Assistant Lovelace entry point for the complete e-C3 package. */
const REQUIRED_ELEMENTS = [
  ["bubble-card", "Bubble Card"],
  ["button-card", "Button Card"],
  ["map-card", "ha-map-card"],
  ["layout-card", "layout-card"],
];
const DEPENDENCY_GRACE_MS = 10000;
const STRATEGY_REGISTRATION_DEADLINE_MS = 3000;

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
 * Start package modules and external-card readiness immediately, but never
 * block registration of the Home Assistant dashboard Strategy for the full
 * dependency grace period. HA itself waits only a bounded time for
 * ll-strategy-dashboard-e-c3-dashboard; previously our 10 s dependency wait
 * could consume that entire window and produce a Strategy registration timeout.
 *
 * Internal custom elements may safely finish after the Strategy registers:
 * unresolved custom elements are upgraded automatically when their modules
 * define them. External dependencies still get the 10 s readiness observation;
 * the Strategy's own dependency check remains the user-facing fallback.
 */
const packageModules = Promise.allSettled([
  import("./trip-history-card.js?v=0.5.41"),
  import("./charge-history-card.js?v=0.5.41"),
  import("./gps-history-card.js?v=0.5.41"),
  import("./vehicle-overview-card.js?v=0.5.41"),
]);
const dependencyReadiness = Promise.all(REQUIRED_ELEMENTS.map(waitForElement));
const readinessGate = Promise.all([packageModules, dependencyReadiness]);
const registrationDeadline = new Promise((resolve) => {
  setTimeout(resolve, STRATEGY_REGISTRATION_DEADLINE_MS);
});

await Promise.race([readinessGate, registrationDeadline]);
await import("./e_c3_dashboard.js?v=0.5.41");

packageModules.then((results) => {
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`e-C3 Dashboard package module ${index + 1} failed to load`, result.reason);
    }
  });
});
window.__ec3DashboardDependencyReadiness = dependencyReadiness;