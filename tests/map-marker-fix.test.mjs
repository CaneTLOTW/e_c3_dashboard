import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL(
    "../custom_components/e_c3_dashboard/static/map-marker-fix.js",
    import.meta.url,
  ),
  "utf8",
);

function createCustomElementsRegistry() {
  const registry = new Map();
  const waiters = new Map();

  return {
    get(name) {
      return registry.get(name);
    },
    define(name, constructor) {
      registry.set(name, constructor);
      const waiter = waiters.get(name);
      if (waiter) {
        waiters.delete(name);
        waiter();
      }
    },
    whenDefined(name) {
      if (registry.has(name)) {
        return Promise.resolve();
      }
      return new Promise((resolve) => waiters.set(name, resolve));
    },
  };
}

function loadCompatibilityShim(customElements) {
  const context = vm.createContext({
    Array,
    JSON,
    Object,
    Promise,
    Set,
    String,
    Symbol,
    customElements,
    document: { querySelectorAll: () => [] },
    queueMicrotask,
  });
  vm.runInContext(source, context, { filename: "map-marker-fix.js" });
}

test("patches the dashboard strategy before its first generate call", async () => {
  const customElements = createCustomElementsRegistry();
  loadCompatibilityShim(customElements);

  const hero = {
    type: "custom:button-card",
    triggers_update: ["sensor.other"],
    custom_fields: { range: {}, battery: {} },
    styles: {
      // Match the real hero: layout and background properties share one style
      // object. Removing the whole object would collapse the reactive picture.
      card: [
        {
          position: "relative",
          height: "270px",
          overflow: "hidden",
          "border-radius": "12px",
          padding: 0,
          background: "transparent !important",
          "background-color": "transparent !important",
          "background-image": "url(/old-static-picture.png)",
          "background-repeat": "no-repeat",
          "background-size": "100% auto",
          "background-position": "center 54%",
        },
        { color: "white" },
      ],
      custom_fields: { driving: [] },
    },
  };

  class Strategy {
    static async generate() {
      return { views: [{ path: "vehicle", cards: [hero] }] };
    }
  }

  customElements.define("ll-strategy-dashboard-e-c3-dashboard", Strategy);

  const hass = {
    states: {
      "sensor.ec3_dashboard_status": {
        attributes: {
          integration_domain: "e_c3_dashboard",
          entry_id: "entry-1",
          entity_mapping: { soc: "sensor.vehicle_soc" },
          vehicle_tracker: "device_tracker.ec3",
        },
      },
    },
  };

  const dashboard = await Strategy.generate(
    { strategy: { options: { entry_id: "entry-1" } } },
    hass,
  );
  const patchedHero = dashboard.views[0].cards[0];

  assert.deepEqual(Array.from(patchedHero.triggers_update), [
    "sensor.other",
    "device_tracker.ec3",
  ]);
  assert.equal(
    patchedHero.styles.card.some(
      (style) => style && style["background-image"] !== undefined,
    ),
    false,
  );
  assert.equal(
    patchedHero.styles.card.some(
      (style) => style?.position === "relative" && style?.height === "270px",
    ),
    true,
    "hero layout must survive removal of the static vehicle background",
  );
  assert.equal(
    patchedHero.styles.card.some((style) => style?.overflow === "hidden"),
    true,
  );

  const pictureCard = patchedHero.custom_fields.vehicle_image.card;
  assert.equal(pictureCard.entity, "device_tracker.ec3");
  assert.deepEqual(Array.from(pictureCard.triggers_update), [
    "device_tracker.ec3",
  ]);
  assert.match(
    pictureCard.custom_fields.picture,
    /entity\?\.attributes\?\.entity_picture/,
  );
  assert.match(pictureCard.custom_fields.picture, /<img src=/);
});

test("does not bind another config entry's tracker", async () => {
  const customElements = createCustomElementsRegistry();
  loadCompatibilityShim(customElements);

  const hero = {
    type: "custom:button-card",
    custom_fields: { range: {}, battery: {} },
    styles: { card: [], custom_fields: { driving: [] } },
  };

  class Strategy {
    static async generate() {
      return { views: [{ path: "vehicle", cards: [hero] }] };
    }
  }

  customElements.define("ll-strategy-dashboard-e-c3-dashboard", Strategy);

  const hass = {
    states: {
      "sensor.other_dashboard_status": {
        attributes: {
          integration_domain: "e_c3_dashboard",
          entry_id: "entry-2",
          entity_mapping: { soc: "sensor.other_soc" },
          vehicle_tracker: "device_tracker.other_ec3",
        },
      },
    },
  };

  const dashboard = await Strategy.generate(
    { strategy: { options: { entry_id: "entry-1" } } },
    hass,
  );

  assert.equal(
    dashboard.views[0].cards[0].custom_fields.vehicle_image,
    undefined,
  );
});
