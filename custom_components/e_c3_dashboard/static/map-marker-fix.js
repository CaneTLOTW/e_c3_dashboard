/*
 * Compatibility shims for vehicle pictures used by the e-C3 Dashboard.
 *
 * 1. ha-map-card owns the marker's shadow DOM, so dashboard CSS cannot
 *    reliably override its dark-mode background. The e-C3 dashboard opts in
 *    only its own picture markers through --ec3-transparent-picture-marker: 1.
 *
 * 2. The LIVE hero used to freeze tracker.attributes.entity_picture while the
 *    dashboard strategy was generated. If the attribute arrived later, the
 *    hero kept background-image:none until a strategy rebuild. The strategy
 *    output is post-processed so LIVE uses a tracker-bound button-card with a
 *    real <img>. That card re-renders when the tracker changes and is fully
 *    independent from the map-marker workaround.
 */
(() => {
  const MARKER_TAG = "map-card-entity-marker";
  const STRATEGY_TAG = "ll-strategy-dashboard-e-c3-dashboard";
  const OPT_IN_PROPERTY = "--ec3-transparent-picture-marker";
  const MARKER_PATCH_FLAG = Symbol.for(
    "e_c3_dashboard.transparent_picture_marker"
  );
  const LIVE_PATCH_FLAG = Symbol.for(
    "e_c3_dashboard.reactive_live_vehicle_picture"
  );

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
    if (!MarkerClass || MarkerClass.prototype[MARKER_PATCH_FLAG]) {
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

    Object.defineProperty(MarkerClass.prototype, MARKER_PATCH_FLAG, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    applyToExistingMarkers();
  });

  const resolveStrategyConfig = (config) =>
    config?.strategy?.options ?? config?.strategy ?? config ?? {};

  const resolveVehicleTracker = (hass, config) => {
    const strategyConfig = resolveStrategyConfig(config);
    const entryId = strategyConfig?.entry_id;
    const states = Object.values(hass?.states || {});
    const status = states.find((state) => {
      const attributes = state?.attributes || {};
      return (
        attributes.integration_domain === "e_c3_dashboard" &&
        typeof attributes.entity_mapping === "object" &&
        (!entryId || attributes.entry_id === entryId)
      );
    });
    return status?.attributes?.vehicle_tracker;
  };

  const isLiveHero = (card) =>
    card?.type === "custom:button-card" &&
    card?.custom_fields?.range &&
    card?.custom_fields?.battery &&
    card?.styles?.custom_fields?.driving;

  const findLiveHero = (dashboard) => {
    const vehicleView = dashboard?.views?.find((view) => view?.path === "vehicle");
    if (!vehicleView) {
      return null;
    }

    const pending = [...(vehicleView.cards || []), ...(vehicleView.sections || [])];
    while (pending.length) {
      const current = pending.shift();
      if (!current || typeof current !== "object") {
        continue;
      }
      if (isLiveHero(current)) {
        return current;
      }
      if (Array.isArray(current.cards)) {
        pending.push(...current.cards);
      }
      if (Array.isArray(current.sections)) {
        pending.push(...current.sections);
      }
    }
    return null;
  };

  const withoutStaticVehicleBackground = (cardStyles) => {
    if (!Array.isArray(cardStyles)) {
      return [];
    }

    const removedProperties = new Set([
      "background",
      "background-image",
      "background-repeat",
      "background-size",
      "background-position",
    ]);
    const result = cardStyles.filter((style) =>
      !style ||
      typeof style !== "object" ||
      !Object.keys(style).some((property) => removedProperties.has(property))
    );

    if (!result.some((style) => style?.["background-color"] !== undefined)) {
      result.push({ "background-color": "transparent !important" });
    }
    return result;
  };

  const buildReactiveVehiclePicture = (tracker) => ({
    card: {
      type: "custom:button-card",
      entity: tracker,
      show_name: false,
      show_state: false,
      show_icon: false,
      tap_action: { action: "none" },
      hold_action: { action: "none" },
      triggers_update: [tracker],
      styles: {
        card: [
          { position: "relative" },
          { height: "270px" },
          { "min-height": "270px" },
          { overflow: "hidden" },
          { padding: 0 },
          { border: "none" },
          { "border-radius": "0" },
          { "background-color": "transparent !important" },
          { "--ha-card-background": "transparent" },
          { "--card-background-color": "transparent" },
          { "box-shadow": "none !important" },
          { "pointer-events": "none" },
        ],
        grid: [
          { "grid-template-areas": "'picture'" },
          { "grid-template-columns": "1fr" },
          { "grid-template-rows": "1fr" },
          { height: "270px" },
        ],
        custom_fields: {
          picture: [
            { position: "absolute" },
            { inset: 0 },
            { overflow: "hidden" },
            { "pointer-events": "none" },
          ],
        },
      },
      custom_fields: {
        picture: `[[[
          const picture = entity?.attributes?.entity_picture;
          if (!picture) return '';
          return '<img src=' + JSON.stringify(String(picture)) + ' alt="" style="position:absolute;top:54%;left:50%;display:block;width:100%;height:auto;transform:translate(-50%,-50%);background:transparent!important;object-fit:contain;pointer-events:none;" />';
        ]]]`,
      },
    },
  });

  const patchLiveVehiclePicture = (dashboard, hass, config) => {
    const tracker = resolveVehicleTracker(hass, config);
    if (!tracker) {
      return dashboard;
    }

    const hero = findLiveHero(dashboard);
    if (!hero) {
      return dashboard;
    }

    const existingTriggers = Array.isArray(hero.triggers_update)
      ? hero.triggers_update
      : [];
    hero.triggers_update = [...new Set([...existingTriggers, tracker])];

    hero.styles = hero.styles || {};
    hero.styles.card = withoutStaticVehicleBackground(hero.styles.card);
    hero.styles.custom_fields = hero.styles.custom_fields || {};
    hero.styles.custom_fields.vehicle_image = [
      { position: "absolute" },
      { inset: 0 },
      { "z-index": 0 },
      { overflow: "hidden" },
      { "pointer-events": "none" },
    ];

    hero.custom_fields = hero.custom_fields || {};
    hero.custom_fields.vehicle_image = buildReactiveVehiclePicture(tracker);
    return dashboard;
  };

  customElements.whenDefined(STRATEGY_TAG).then(() => {
    const StrategyClass = customElements.get(STRATEGY_TAG);
    if (!StrategyClass || StrategyClass[LIVE_PATCH_FLAG]) {
      return;
    }

    const originalGenerate = StrategyClass.generate;
    if (typeof originalGenerate !== "function") {
      return;
    }

    StrategyClass.generate = async function (config, hass) {
      const dashboard = await originalGenerate.call(this, config, hass);
      return patchLiveVehiclePicture(dashboard, hass, config);
    };

    Object.defineProperty(StrategyClass, LIVE_PATCH_FLAG, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  });
})();
