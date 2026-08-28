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
 * Start package modules immediately.  Only the dashboard Strategy itself is
 * held until external HACS custom elements had a fair chance to register.
 * This removes the old reload race where an installed card was reported as
 * missing merely because its module was still loading.
 */
const packageModules = Promise.all([
  import("./trip-history-card.js?v=0.5.37"),
  import("./charge-history-card.js?v=0.5.37"),
  import("./gps-history-fix.js?v=0.5.34"),
  import("./map-marker-fix.js?v=0.5.34"),
  import("./vehicle-overview-card.js?v=0.5.37"),
]);
const dependencyReadiness = Promise.all(REQUIRED_ELEMENTS.map(waitForElement));

await packageModules;
window.__ec3DashboardDependencyReadiness = await dependencyReadiness;
await import("./e_c3_dashboard.js?v=0.5.37");
