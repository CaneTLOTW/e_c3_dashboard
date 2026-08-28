import {
  dateRangeWindow,
  dateWindow,
  earliestGeoJsonTime,
  filterGeoJsonByWindow,
  localDateKey,
} from "./gps-history-core.js?v=0.5.47";

const DATE_CARD_TAG = "e-c3-dashboard-gps-date-card";
const MAP_CARD_TAG = "e-c3-dashboard-gps-map-card";
const COLLECTION_RETRY_MS = 100;

const cloneConfig = (value) => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const entryIdFromStorageKey = (storageKey) => {
  const value = String(storageKey || "");
  const marker = "e_c3_dashboard:gps_date:";
  return value.startsWith(marker) ? value.slice(marker.length) : "default";
};

const collectionKeyFromStorageKey = (storageKey) => {
  const suffix = entryIdFromStorageKey(storageKey)
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 80);
  return `energy_ec3_gps_${suffix || "default"}`;
};

const collectionFromHass = (hass, collectionKey) =>
  hass?.connection?.[`_${collectionKey}`] || null;

const findServerGpsEntity = (hass, storageKey) => {
  const entryId = entryIdFromStorageKey(storageKey);
  return Object.entries(hass?.states || {}).find(([, state]) => {
    const attributes = state?.attributes || {};
    return (
      attributes.integration_domain === "e_c3_dashboard" &&
      attributes.entry_id === entryId &&
      attributes.metric_key === "server_gps_history"
    );
  })?.[0];
};

class Ec3GpsDateCard extends HTMLElement {
  setConfig(config) {
    if (!config?.storage_key) throw new Error("storage_key is required");
    this._config = config;
    this._collectionKey = collectionKeyFromStorageKey(config.storage_key);
    this._ensureShell();
  }

  set hass(value) {
    this._hass = value;
    if (this._picker) this._picker.hass = value;
    this._updateAllButton();
    this._ensurePicker();
  }

  connectedCallback() {
    this._ensureShell();
    this._ensurePicker();
    this._updateAllButton();
  }

  disconnectedCallback() {
    if (this._allRetry) {
      clearTimeout(this._allRetry);
      this._allRetry = null;
    }
  }

  getCardSize() {
    return 1;
  }

  _ensureShell() {
    if (!this._config || this.shadowRoot) return;
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { display:block; }
        .row {
          display:grid;
          grid-template-columns:minmax(0, 1fr) auto;
          gap:8px;
          align-items:stretch;
        }
        #picker { min-width:0; }
        #all {
          min-width:72px;
          border:1px solid var(--ha-card-border-color, var(--divider-color));
          border-radius:var(--ha-card-border-radius, 12px);
          background:var(--ha-card-background, var(--card-background-color));
          color:var(--primary-text-color);
          font:inherit;
          font-weight:600;
          padding:0 14px;
          cursor:pointer;
        }
        #all:hover:not(:disabled) { background:var(--secondary-background-color); }
        #all:disabled { opacity:.38; cursor:default; }
        @media (max-width: 480px) {
          .row { grid-template-columns:1fr; }
          #all { min-height:42px; }
        }
      </style>
      <div class="row">
        <div id="picker"></div>
        <button id="all" type="button"></button>
      </div>`;
    this._allButton = shadow.getElementById("all");
    this._allButton?.addEventListener("click", () => this._showAll());
  }

  async _ensurePicker() {
    if (!this._config || !this.isConnected || this._picker || this._loadingPicker) return;
    this._loadingPicker = true;
    try {
      const helpers = await window.loadCardHelpers();
      const picker = helpers.createCardElement({
        type: "energy-date-selection",
        collection_key: this._collectionKey,
        disable_compare: true,
      });
      this._picker = picker;
      this.shadowRoot?.getElementById("picker")?.replaceChildren(picker);
      if (this._hass) picker.hass = this._hass;
      this._updateAllButton();
    } finally {
      this._loadingPicker = false;
    }
  }

  _serverGeoJson() {
    const entityId = findServerGpsEntity(this._hass, this._config?.storage_key);
    return entityId ? this._hass?.states?.[entityId]?.attributes?.geojson : null;
  }

  _updateAllButton() {
    if (!this._allButton) return;
    const localized = this._hass?.localize?.("ui.common.all");
    this._allButton.textContent = localized || "All";
    this._allButton.title = localized || "All";
    const collection = collectionFromHass(this._hass, this._collectionKey);
    const hasHistory = earliestGeoJsonTime(this._serverGeoJson()) !== null;
    this._allButton.disabled = !collection || !hasHistory;
    if (!collection && this.isConnected && !this._allRetry) {
      this._allRetry = setTimeout(() => {
        this._allRetry = null;
        this._updateAllButton();
      }, COLLECTION_RETRY_MS);
    }
  }

  _showAll() {
    const collection = collectionFromHass(this._hass, this._collectionKey);
    const earliest = earliestGeoJsonTime(this._serverGeoJson());
    if (!collection || earliest === null) return;

    const start = new Date(earliest);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    collection.setPeriod(start, end);
    collection.refresh();
  }
}

class Ec3GpsMapCard extends HTMLElement {
  setConfig(config) {
    if (!config?.storage_key || !config?.base_config) {
      throw new Error("storage_key and base_config are required");
    }
    this._config = config;
    this._collectionKey = collectionKeyFromStorageKey(config.storage_key);
    this._range = null;
    if (this.isConnected) {
      this._ensureCollection();
      this._rebuildInner();
    }
  }

  set hass(value) {
    this._hass = value;
    this._ensureCollection();
    if (this._inner) this._inner.hass = this._filteredHass();
    else if (this.isConnected) this._ensureInner();
  }

  connectedCallback() {
    this._ensureCollection();
    this._ensureInner();
  }

  disconnectedCallback() {
    this._stopCollection();
  }

  getCardSize() {
    return this._inner?.getCardSize?.() || 8;
  }

  _stopCollection() {
    if (this._collectionRetry) {
      clearTimeout(this._collectionRetry);
      this._collectionRetry = null;
    }
    if (this._unsubscribeCollection) {
      this._unsubscribeCollection();
      this._unsubscribeCollection = null;
    }
    this._collection = null;
  }

  _ensureCollection() {
    if (!this._config || !this._hass || !this.isConnected) return;
    const collection = collectionFromHass(this._hass, this._collectionKey);
    if (!collection) {
      if (!this._collectionRetry) {
        this._collectionRetry = setTimeout(() => {
          this._collectionRetry = null;
          this._ensureCollection();
        }, COLLECTION_RETRY_MS);
      }
      return;
    }
    if (this._collection === collection) return;

    this._stopCollection();
    this._collection = collection;

    const applyRange = (data) => {
      const start = data?.start || collection.start;
      const end = data?.end || collection.end;
      const next = dateRangeWindow(start, end);
      const signature = `${next.startIso}|${next.endIso}`;
      if (signature === this._rangeSignature) return;
      this._range = next;
      this._rangeSignature = signature;
      this._rebuildInner();
    };

    this._unsubscribeCollection = collection.subscribe((data) => applyRange(data));
    applyRange({ start: collection.start, end: collection.end });
  }

  _window() {
    return this._range || dateWindow(localDateKey());
  }

  _mapConfig() {
    const config = cloneConfig(this._config.base_config);
    const range = this._window();

    // ha-map-card's own history_date_selection bridge is intentionally disabled:
    // it is currently broken on HA 2026.4+ (upstream ha-map-card #185).
    // The package follows the official energy-date-selection collection directly
    // so Recorder history and the Stellantis GeoJSON overlay share one range.
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
    if (this.isConnected) this._ensureInner();
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
    description: "Home Assistant date-range selector for the e-C3 GPS history",
  });
}
