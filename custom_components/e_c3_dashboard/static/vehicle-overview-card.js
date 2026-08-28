const STATUS_DOMAIN = "e_c3_dashboard";
const CARD_TAG = "e-c3-dashboard-vehicle-overview-card";

function statusCandidates(hass, entryId) {
  return Object.entries(hass?.states || {}).filter(([entityId, state]) => {
    const attributes = state?.attributes || {};
    return (
      entityId.startsWith("sensor.") &&
      attributes.integration_domain === STATUS_DOMAIN &&
      typeof attributes.entity_mapping === "object" &&
      (!entryId || attributes.entry_id === entryId)
    );
  });
}

function isUnavailable(state) {
  return !state || ["unknown", "unavailable", "none", ""].includes(String(state.state ?? "").toLowerCase());
}

function numericState(hass, entityId, digits = 0) {
  const state = entityId ? hass?.states?.[entityId] : undefined;
  const numeric = Number(state?.state);
  if (!state || isUnavailable(state) || !Number.isFinite(numeric)) return "—";
  const unit = state.attributes?.unit_of_measurement || "";
  return `${numeric.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
}

function escaped(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

class Ec3VehicleOverviewCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  static getConfigElement() {
    return undefined;
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
  }

  setConfig(config) {
    this._config = {
      show_actions: true,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 3;
  }

  _language() {
    const code = String(this._hass?.locale?.language || this._hass?.language || navigator.language || "en").toLowerCase();
    return code.startsWith("de") ? "de" : "en";
  }

  _selectedStatus() {
    const candidates = statusCandidates(this._hass, this._config?.entry_id);
    if (candidates.length !== 1) return { candidates, selected: undefined };
    return { candidates, selected: candidates[0] };
  }

  _metricEntity(attributes, metricKey) {
    if (attributes?.metric_entities?.[metricKey]) return attributes.metric_entities[metricKey];
    return Object.entries(this._hass?.states || {}).find(([, state]) => {
      const attr = state?.attributes || {};
      return attr.integration_domain === STATUS_DOMAIN &&
        attr.entry_id === attributes?.entry_id &&
        attr.metric_key === metricKey;
    })?.[0];
  }

  _dashboardPath(attributes) {
    if (this._config?.navigation_path) return this._config.navigation_path;
    if (attributes?.dashboard_path) return attributes.dashboard_path;
    const slug = String(attributes?.vehicle_slug || "").trim();
    return slug ? `/e-c3-${slug}/vehicle` : undefined;
  }

  async _press(entityId) {
    if (!entityId || !entityId.startsWith("button.")) return;
    await this._hass?.callService?.("button", "press", { entity_id: entityId });
  }

  _navigate(path) {
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new Event("location-changed"));
  }

  _render() {
    if (!this.shadowRoot) return;
    const de = this._language() === "de";
    if (!this._hass) {
      this.shadowRoot.innerHTML = `<ha-card><div class="loading">${de ? "Lade Fahrzeug…" : "Loading vehicle…"}</div></ha-card>`;
      return;
    }

    const { candidates, selected } = this._selectedStatus();
    if (!selected) {
      const message = candidates.length > 1 && !this._config?.entry_id
        ? (de ? "Mehrere e-C3 Fahrzeuge gefunden. Bitte entry_id konfigurieren." : "Multiple e-C3 vehicles found. Configure entry_id.")
        : (de ? "Keine passende e-C3 Dashboard-Integration gefunden." : "No matching e-C3 Dashboard integration found.");
      this.shadowRoot.innerHTML = `<ha-card><div class="error">${escaped(message)}</div></ha-card>`;
      return;
    }

    const [, status] = selected;
    const attributes = status.attributes || {};
    const mapped = attributes.entity_mapping || {};
    const controls = attributes.control_entities || {};
    const trackerId = attributes.vehicle_tracker;
    const tracker = trackerId ? this._hass.states[trackerId] : undefined;
    const picture = tracker?.attributes?.entity_picture;
    const batteryId = mapped.battery;
    const rangeId = mapped.autonomy;
    const mileageId = mapped.mileage;
    const chargingId = mapped.battery_charging;
    const charging = chargingId && this._hass.states[chargingId]?.state === "on";
    const chargePowerId = this._metricEntity(attributes, "current_charge_power") || mapped.battery_charging_rate;
    const wakeupId = controls.manual_wakeup || mapped.wakeup;
    const climateId = mapped.preconditioning_start;
    const dashboardPath = this._dashboardPath(attributes);
    const name = this._config?.name || tracker?.attributes?.friendly_name || (de ? "e-C3" : "e-C3");
    const battery = numericState(this._hass, batteryId, 0);
    const range = numericState(this._hass, rangeId, 0);
    const mileage = numericState(this._hass, mileageId, 0);
    const chargePower = numericState(this._hass, chargePowerId, 1);
    const chargeLabel = charging
      ? `${de ? "Lädt" : "Charging"}${chargePower !== "—" ? ` · ${chargePower}` : ""}`
      : (de ? "Nicht am Laden" : "Not charging");
    const actions = this._config?.show_actions !== false;
    const wakeDisabled = !wakeupId || isUnavailable(this._hass.states[wakeupId]);
    const climateDisabled = !climateId || isUnavailable(this._hass.states[climateId]);

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card {
          position:relative;
          overflow:hidden;
          min-height:172px;
          border-radius:20px;
          cursor:${dashboardPath ? "pointer" : "default"};
          background:linear-gradient(135deg, color-mix(in srgb, var(--primary-color) 12%, transparent), var(--ha-card-background, var(--card-background-color)) 62%);
        }
        .wrap { position:relative; min-height:172px; padding:14px 14px 12px; box-sizing:border-box; }
        .vehicle { position:absolute; right:-4px; top:18px; width:58%; height:108px; display:flex; align-items:center; justify-content:center; pointer-events:none; }
        .vehicle img { width:100%; height:100%; object-fit:contain; object-position:center; filter:drop-shadow(0 5px 8px rgba(0,0,0,.18)); }
        .vehicle ha-icon { --mdc-icon-size:72px; opacity:.18; }
        .title { position:relative; z-index:2; max-width:48%; font-size:17px; font-weight:700; line-height:1.15; }
        .metrics { position:relative; z-index:2; width:48%; margin-top:10px; display:grid; gap:5px; }
        .metric { display:flex; align-items:center; gap:6px; min-width:0; font-size:12px; }
        .metric ha-icon { --mdc-icon-size:16px; color:var(--primary-color); flex:0 0 auto; }
        .metric span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
        .charging { margin-top:8px; font-size:11px; font-weight:600; color:${charging ? "var(--success-color)" : "var(--secondary-text-color)"}; }
        .actions { position:absolute; z-index:3; left:12px; right:12px; bottom:10px; display:flex; gap:7px; }
        button { flex:1 1 0; min-width:0; min-height:34px; border:1px solid color-mix(in srgb, var(--primary-color) 18%, transparent); border-radius:18px; padding:0 9px; background:color-mix(in srgb, var(--primary-color) 8%, var(--card-background-color)); color:var(--primary-text-color); font:inherit; font-size:11px; font-weight:650; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; }
        button ha-icon { --mdc-icon-size:16px; }
        button:disabled { opacity:.35; cursor:default; }
        .loading,.error { padding:16px; color:var(--secondary-text-color); }
        @media (max-width:360px) { .vehicle { width:54%; } .title,.metrics { max-width:52%; width:52%; } }
      </style>
      <ha-card id="card" tabindex="${dashboardPath ? "0" : "-1"}" role="${dashboardPath ? "button" : "group"}">
        <div class="wrap">
          <div class="title">${escaped(name)}</div>
          <div class="metrics">
            <div class="metric"><ha-icon icon="mdi:battery"></ha-icon><span>${escaped(battery)}</span></div>
            <div class="metric"><ha-icon icon="mdi:map-marker-distance"></ha-icon><span>${escaped(range)}</span></div>
            <div class="metric"><ha-icon icon="mdi:counter"></ha-icon><span>${escaped(mileage)}</span></div>
            <div class="charging">${escaped(chargeLabel)}</div>
          </div>
          <div class="vehicle">${picture ? `<img src="${escaped(picture)}" alt="">` : '<ha-icon icon="mdi:car-electric"></ha-icon>'}</div>
          ${actions ? `<div class="actions">
            <button id="refresh" ${wakeDisabled ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>${de ? "Aktualisieren" : "Refresh"}</button>
            <button id="climate" ${climateDisabled ? "disabled" : ""}><ha-icon icon="mdi:air-conditioner"></ha-icon>${de ? "Vorklimatisieren" : "Precondition"}</button>
          </div>` : ""}
        </div>
      </ha-card>`;

    const card = this.shadowRoot.getElementById("card");
    const navigate = (event) => {
      if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
      if (event.type === "keydown") event.preventDefault();
      this._navigate(dashboardPath);
    };
    card?.addEventListener("click", navigate);
    card?.addEventListener("keydown", navigate);
    this.shadowRoot.getElementById("refresh")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      await this._press(wakeupId);
    });
    this.shadowRoot.getElementById("climate")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      await this._press(climateId);
    });
  }
}

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, Ec3VehicleOverviewCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "e-C3 Vehicle Overview",
    description: "Compact live vehicle overview for Home Assistant start pages",
    preview: true,
  });
}
