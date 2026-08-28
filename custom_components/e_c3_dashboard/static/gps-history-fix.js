import {
  dateWindow,
  filterGeoJsonByWindow,
  localDateKey,
  normalizeDateKey,
  shiftDateKey,
} from "./gps-history-core.js?v=0.5.34";

const STRATEGY_TAG = "ll-strategy-dashboard-e-c3-dashboard";
const DATE_CARD_TAG = "e-c3-dashboard-gps-date-card";
const MAP_CARD_TAG = "e-c3-dashboard-gps-map-card";
const DATE_EVENT = "e-c3-dashboard-gps-date-change";
const STRATEGY_PATCH_FLAG = Symbol.for("e_c3_dashboard.gps_date_filter_strategy");

const cloneConfig = (value) => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const language = (hass) =>
  String(hass?.locale?.language || hass?.language || navigator.language || "en")
    .toLowerCase()
    .startsWith("de")
    ? "de"
    : "en";

const readDate = (storageKey) => {
  try {
    return normalizeDateKey(sessionStorage.getItem(storageKey));
  } catch (_error) {
    return localDateKey();
  }
};

const storeDate = (storageKey, value) => {
  const normalized = normalizeDateKey(value);
  try {
    sessionStorage.setItem(storageKey, normalized);
  } catch (_error) {
    // Private browsing or a locked-down WebView may deny sessionStorage.
  }
  return normalized;
};

class Ec3GpsDateCard extends HTMLElement {
  setConfig(config) {
    if (!config?.storage_key) throw new Error("storage_key is required");
    this._config = config;
    this._date = readDate(config.storage_key);
    this._render();
  }

  set hass(value) {
    this._hass = value;
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  getCardSize() {
    return 1;
  }

  _setDate(value) {
    const next = storeDate(this._config.storage_key, value);
    if (next === this._date) return;
    this._date = next;
    window.dispatchEvent(
      new CustomEvent(DATE_EVENT, {
        detail: { storageKey: this._config.storage_key, date: next },
      }),
    );
    this._render();
  }

  _render() {
    if (!this._config || !this.isConnected) return;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const de = language(this._hass) === "de";
    const today = localDateKey();
    const selected = normalizeDateKey(this._date);
    const canNext = selected < today;
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: 10px 12px; }
        .row { display:grid; grid-template-columns:auto 1fr auto auto; gap:8px; align-items:center; }
        button { border:0; background:transparent; color:var(--primary-text-color); font:inherit; cursor:pointer; min-width:36px; min-height:36px; border-radius:18px; }
        button:hover { background:var(--secondary-background-color); }
        button:disabled { opacity:.28; cursor:default; }
        input { box-sizing:border-box; width:100%; min-height:36px; border:1px solid var(--divider-color); border-radius:12px; padding:0 10px; color:var(--primary-text-color); background:var(--card-background-color); font:inherit; }
        .today { color:var(--primary-color); font-weight:600; padding:0 12px; }
      </style>
      <ha-card>
        <div class="row">
          <button id="prev" title="${de ? "Vorheriger Tag" : "Previous day"}">‹</button>
          <input id="date" type="date" max="${today}" value="${selected}" aria-label="${de ? "GPS-Datum" : "GPS date"}">
          <button id="next" title="${de ? "Nächster Tag" : "Next day"}" ${canNext ? "" : "disabled"}>›</button>
          <button id="today" class="today">${de ? "Heute" : "Today"}</button>
        </div>
      </ha-card>`;
    this.shadowRoot.getElementById("prev")?.addEventListener("click", () =>
      this._setDate(shiftDateKey(selected, -1)),
    );
    this.shadowRoot.getElementById("next")?.addEventListener("click", () =>
      this._setDate(shiftDateKey(selected, 1)),
    );
    this.shadowRoot.getElementById("today")?.addEventListener("click", () =>
      this._setDate(today),
    );
    this.shadowRoot.getElementById("date")?.addEventListener("change", (event) =>
      this._setDate(event.target.value),
    );
  }
}

class Ec3GpsMapCard extends HTMLElement {
  constructor() {
    super();
    this._onDateChange = (event) => {
      if (event.detail?.storageKey !== this._config?.storage_key) return;
      this._date = normalizeDateKey(event.detail.date);
      this._rebuildInner();
    };
  }

  setConfig(config) {
    if (!config?.storage_key || !config?.base_config) {
      throw new Error("storage_key and base_config are required");
    }
    this._config = config;
    this._date = readDate(config.storage_key);
    if (this.isConnected) this._rebuildInner();
  }

  set hass(value) {
    this._hass = value;
    if (this._inner) this._inner.hass = this._filteredHass();
    else if (this.isConnected) this._ensureInner();
  }

  connectedCallback() {
    window.addEventListener(DATE_EVENT, this._onDateChange);
    this._ensureInner();
  }

  disconnectedCallback() {
    window.removeEventListener(DATE_EVENT, this._onDateChange);
  }

  getCardSize() {
    return this._inner?.getCardSize?.() || 8;
  }

  _window() {
    return dateWindow(this._date || localDateKey());
  }

  _mapConfig() {
    const config = cloneConfig(this._config.base_config);
    const range = this._window();
    config.history_date_selection = false;
    delete config.history_start;
    delete config.history_end;
    delete config.grid_options;
    config.entities = (config.entities || []).map((entity) => {
      if (!entity || typeof entity !== "object") return entity;
      const item = { ...entity };
      if (item.entity === this._config.tracker_entity) {
        item.history_start = range.startIso;
        item.history_end = range.historyEnd;
      } else {
        delete item.history_start;
        delete item.history_end;
      }
      return item;
    });
    return config;
  }

  _filteredHass() {
    if (!this._hass || !this._config?.server_entity) return this._hass;
    const source = this._hass.states?.[this._config.server_entity];
    if (!source) return this._hass;
    const patched = Object.create(this._hass);
    patched.states = Object.create(this._hass.states);
    patched.states[this._config.server_entity] = {
      ...source,
      attributes: {
        ...source.attributes,
        geojson: filterGeoJsonByWindow(source.attributes?.geojson, this._window()),
      },
    };
    return patched;
  }

  async _ensureInner() {
    if (!this._config || this._inner || this._loading) return;
    this._loading = true;
    try {
      const helpers = await window.loadCardHelpers();
      const inner = helpers.createCardElement(this._mapConfig());
      this._inner = inner;
      this.replaceChildren(inner);
      if (this._hass) inner.hass = this._filteredHass();
    } finally {
      this._loading = false;
    }
  }

  _rebuildInner() {
    this._inner = null;
    this.replaceChildren();
    this._ensureInner();
  }
}

if (!customElements.get(DATE_CARD_TAG)) {
  customElements.define(DATE_CARD_TAG, Ec3GpsDateCard);
}
if (!customElements.get(MAP_CARD_TAG)) {
  customElements.define(MAP_CARD_TAG, Ec3GpsMapCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "e-c3-dashboard-gps-date-card")) {
  window.customCards.push({
    type: "e-c3-dashboard-gps-date-card",
    name: "e-C3 GPS Date",
    description: "Date selector for the e-C3 GPS history",
  });
}

const resolveStrategyConfig = (config) =>
  config?.strategy?.options ?? config?.strategy ?? config ?? {};

const patchGpsView = (dashboard, config) => {
  const view = dashboard?.views?.find((candidate) => candidate?.path === "gps");
  if (!view) return dashboard;
  const strategy = resolveStrategyConfig(config);
  const storageKey = `e_c3_dashboard:gps_date:${strategy.entry_id || "default"}`;

  for (const section of view.sections || []) {
    if (!Array.isArray(section.cards)) continue;
    section.cards = section.cards.map((card) => {
      if (card?.type === "energy-date-selection") {
        return {
          type: "custom:e-c3-dashboard-gps-date-card",
          storage_key: storageKey,
          grid_options: card.grid_options,
        };
      }
      if (card?.type !== "custom:map-card" || !Array.isArray(card.entities)) {
        return card;
      }
      const server = card.entities.find((entity) => entity?.geojson?.attribute === "geojson")?.entity;
      const tracker = card.focus_entity || card.entities.find((entity) => entity?.history_show_lines)?.entity;
      if (!server || !tracker) return card;
      return {
        type: "custom:e-c3-dashboard-gps-map-card",
        storage_key: storageKey,
        server_entity: server,
        tracker_entity: tracker,
        base_config: cloneConfig(card),
        grid_options: card.grid_options,
      };
    });
  }
  return dashboard;
};

const installStrategyPatch = (StrategyClass) => {
  if (!StrategyClass || StrategyClass[STRATEGY_PATCH_FLAG]) return;
  const originalGenerate = StrategyClass.generate;
  if (typeof originalGenerate !== "function") return;
  StrategyClass.generate = async function (config, hass) {
    const dashboard = await originalGenerate.call(this, config, hass);
    return patchGpsView(dashboard, config);
  };
  Object.defineProperty(StrategyClass, STRATEGY_PATCH_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
};

const existingStrategyClass = customElements.get(STRATEGY_TAG);
if (existingStrategyClass) {
  installStrategyPatch(existingStrategyClass);
} else {
  const originalDefine = customElements.define.bind(customElements);
  let defineWrapped = true;
  customElements.define = function (name, constructor, options) {
    if (name === STRATEGY_TAG) {
      installStrategyPatch(constructor);
      if (defineWrapped) {
        customElements.define = originalDefine;
        defineWrapped = false;
      }
    }
    return originalDefine(name, constructor, options);
  };
  customElements.whenDefined(STRATEGY_TAG).then(() => {
    installStrategyPatch(customElements.get(STRATEGY_TAG));
    if (defineWrapped) {
      customElements.define = originalDefine;
      defineWrapped = false;
    }
  });
}
