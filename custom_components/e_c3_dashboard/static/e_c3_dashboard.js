/* e-C3 Dashboard Community Dashboard strategy.
 *
 * This file deliberately generates only safe, mapped entity IDs from the
 * status entity created by the backend config entry. It never derives IDs from
 * VINs or friendly names.
 */
const STRATEGY_TYPE = "e-c3-dashboard";
const STATUS_DOMAIN = "e_c3_dashboard";
const REQUIRED_ELEMENTS = [
  ["bubble-card", "Bubble Card"],
  ["button-card", "Button Card"],
  ["map-card", "ha-map-card"],
];

const TEXT = {
  en: {
    name: "e-C3 Dashboard",
    description: "Vehicle dashboard for Stellantis Vehicles",
    setup: "Setup required",
    noVehicle: "No e-C3 Dashboard vehicle is configured yet.",
    configure: "Set up e-C3 Dashboard in Settings → Devices & services, then reopen this dashboard.",
    dependencies: "Required dashboard cards are missing",
    install: "Install these HACS dependencies, restart Home Assistant, then refresh this page:",
    status: "Connection and setup status",
    vehicle: "Vehicle",
    overview: "Overview",
    battery: "Battery",
    range: "Range",
    mileage: "Odometer",
    temperature: "Vehicle temperature",
    doors: "Doors",
    alarm: "Alarm system",
    privacy: "Data privacy",
    remote: "Remote connection",
    climate: "Preconditioning",
    cable: "Charging cable",
    chargeStatus: "Charging status",
    startCharging: "Start charging",
    stopCharging: "Stop charging",
    startClimate: "Start climate",
    stopClimate: "Stop climate",
    lastTrip: "Last trip",
    trailingConsumption: "Avg. consumption (500 km)",
    distanceSinceCharge: "Distance since last charge",
    currentTripEnergy: "Current trip energy",
    tripHistory: "Trip history",
    chargeHistory: "Charging history",
    chargeCurves: "Charging curves",
    recentTrack: "Recent route",
    currentPosition: "Current position",
    manualWakeup: "Wake vehicle now",
    system: "System",
    mappedEntities: "Mapped upstream entities",
    trips: "Trips",
    charging: "Charging",
    gps: "GPS history",
    wakeup: "Wake-up",
    foundation: "This view is prepared. Its portable data module will be added in the next implementation phase.",
    trackerUnavailable: "The selected Stellantis device currently has no usable vehicle tracker.",
    multipleVehicles: "More than one e-C3 Dashboard setup was found. Dashboard selection will be added with the multi-vehicle module.",
    upstreamIncompatible: "Stellantis Vehicles is not compatible. Required: {minimum}; installed: {installed}.",
  },
  de: {
    name: "e-C3 Dashboard",
    description: "Fahrzeug-Dashboard für Stellantis Vehicles",
    setup: "Einrichtung erforderlich",
    noVehicle: "Es ist noch kein e-C3-Dashboard-Fahrzeug eingerichtet.",
    configure: "Richte e-C3 Dashboard unter Einstellungen → Geräte & Dienste ein und öffne dieses Dashboard danach erneut.",
    dependencies: "Erforderliche Dashboard-Karten fehlen",
    install: "Installiere diese HACS-Abhängigkeiten, starte Home Assistant neu und lade diese Seite anschließend neu:",
    status: "Verbindungs- und Einrichtungsstatus",
    vehicle: "Fahrzeug",
    overview: "Übersicht",
    battery: "Batterie",
    range: "Reichweite",
    mileage: "Kilometerstand",
    temperature: "Fahrzeugtemperatur",
    doors: "Türen",
    alarm: "Alarmanlage",
    privacy: "Datenschutz",
    remote: "Remote-Verbindung",
    climate: "Vorklimatisierung",
    cable: "Ladekabel",
    chargeStatus: "Ladestatus",
    startCharging: "Laden starten",
    stopCharging: "Laden stoppen",
    startClimate: "Klima starten",
    stopClimate: "Klima stoppen",
    lastTrip: "Letzte Fahrt",
    trailingConsumption: "Ø Verbrauch (500 km)",
    distanceSinceCharge: "Seit letzter Ladung",
    currentTripEnergy: "Aktuelle Fahrtenergie",
    tripHistory: "Fahrtenhistorie",
    chargeHistory: "Ladehistorie",
    chargeCurves: "Ladekurven",
    recentTrack: "Letzte Route",
    currentPosition: "Aktuelle Position",
    manualWakeup: "Fahrzeug jetzt aufwecken",
    system: "System",
    mappedEntities: "Zugeordnete Upstream-Entitäten",
    trips: "Fahrten",
    charging: "Laden",
    gps: "GPS-Historie",
    wakeup: "Wake-up",
    foundation: "Dieser View ist vorbereitet. Das portable Datenmodul folgt in der nächsten Umsetzungsphase.",
    trackerUnavailable: "Das ausgewählte Stellantis-Gerät besitzt derzeit keinen nutzbaren Fahrzeug-Tracker.",
    multipleVehicles: "Es wurden mehrere e-C3-Dashboard-Einrichtungen gefunden. Die Auswahl folgt mit dem Mehrfahrzeug-Modul.",
    upstreamIncompatible: "Stellantis Vehicles ist nicht kompatibel. Erforderlich: {minimum}; installiert: {installed}.",
  },
};

function language(hass) {
  return hass?.locale?.language?.toLowerCase().startsWith("de") ? "de" : "en";
}

function t(hass) {
  return TEXT[language(hass)];
}

function markdown(content) {
  return { type: "markdown", content };
}

function setupDashboard(hass, title, body) {
  return {
    title: t(hass).name,
    icon: "mdi:car-electric",
    views: [
      {
        title,
        path: "setup",
        icon: "mdi:car-cog",
        type: "sections",
        max_columns: 1,
        sections: [
          {
            type: "grid",
            cards: [
              {
                type: "heading",
                heading: title,
                icon: "mdi:car-cog",
                heading_style: "title",
              },
              markdown(body),
            ],
          },
        ],
      },
    ],
  };
}

function getStatusEntities(hass, entryId) {
  return Object.entries(hass.states).filter(([entityId, state]) => {
    const attributes = state.attributes || {};
    return (
      entityId.startsWith("sensor.") &&
      attributes.integration_domain === STATUS_DOMAIN &&
      (!entryId || attributes.entry_id === entryId)
    );
  });
}

function getMetricEntity(hass, entryId, metricKey) {
  return Object.entries(hass.states).find(([, state]) => {
    const attributes = state.attributes || {};
    return attributes.integration_domain === STATUS_DOMAIN &&
      attributes.entry_id === entryId &&
      attributes.metric_key === metricKey;
  })?.[0];
}

class Ec3DashboardStrategy extends HTMLElement {
  /**
   * The dashboard picker in current HA versions needs an explicit editor for
   * community strategies. Without one, selecting a community dashboard may
   * close the picker without opening the normal "create dashboard" form.
   */
  static get configRequired() {
    return true;
  }

  static getConfigElement() {
    return document.createElement("e-c3-dashboard-strategy-editor");
  }

  static getCreateSuggestions() {
    return {
      title: "e-C3 Dashboard",
      icon: "mdi:car-electric",
    };
  }

  /**
   * Home Assistant 2026.7+ invokes this strategy contract.  Retain the
   * older generate() entry point below so the package remains usable on
   * earlier Home Assistant versions as well.
   */
  static async generateDashboard({ hass, config }) {
    const strategyConfig = config?.strategy?.options ?? config?.strategy ?? config ?? {};
    return Ec3DashboardStrategy.generate(strategyConfig, hass);
  }

  static async generate(config, hass) {
    const strings = t(hass);
    const candidates = getStatusEntities(hass, config.entry_id);

    if (candidates.length === 0) {
      return setupDashboard(
        hass,
        strings.setup,
        `## ${strings.noVehicle}

${strings.configure}`
      );
    }

    if (candidates.length > 1 && !config.entry_id) {
      return setupDashboard(
        hass,
        strings.setup,
        `## ${strings.multipleVehicles}

${strings.configure}`
      );
    }

    const [statusEntity, statusState] = candidates[0];
    const attributes = statusState.attributes || {};
    const compatibility = attributes.upstream_compatibility || {};
    if (compatibility.version_supported !== true) {
      return setupDashboard(
        hass,
        strings.setup,
        `## ${strings.upstreamIncompatible
          .replace("{minimum}", compatibility.minimum_version || "—")
          .replace("{installed}", compatibility.version || "—")}`
      );
    }

    const missing = REQUIRED_ELEMENTS
      .filter(([element]) => !customElements.get(element))
      .map(([, name]) => name);

    if (missing.length) {
      return setupDashboard(
        hass,
        strings.dependencies,
        `## ${strings.dependencies}

${strings.install}

- ${missing.join("\n- ")}`
      );
    }

    const tracker = attributes.vehicle_tracker;
    const modules = attributes.modules || {};
    const mapped = attributes.entity_mapping || {};
    const metric = (key) => attributes.metric_entities?.[key] || getMetricEntity(hass, attributes.entry_id, key);
    const entity = (key) => mapped[key];
    const tile = (key, name, icon, columns = 6) => {
      const entityId = entity(key);
      return entityId
        ? {
            type: "tile",
            entity: entityId,
            name,
            icon,
            vertical: false,
            grid_options: { columns },
          }
        : null;
    };
    const bubble = (key, name, icon, subButton = []) => {
      const entityId = entity(key);
      return entityId
        ? {
            type: "custom:bubble-card",
            card_type: "button",
            button_type: "state",
            entity: entityId,
            name,
            icon,
            force_icon: true,
            show_state: true,
            card_layout: "large",
            button_action: { tap_action: { action: "more-info" } },
            sub_button: subButton.filter(Boolean),
            grid_options: { columns: "full" },
          }
        : null;
    };
    const press = (key, name, icon) => {
      const entityId = entity(key);
      return entityId
        ? {
            entity: entityId,
            name,
            icon,
            show_state: false,
            show_name: false,
            show_background: true,
            tap_action: {
              action: "perform-action",
              perform_action: "button.press",
              target: { entity_id: entityId },
            },
          }
        : null;
    };
    const subState = (key, name, icon) => {
      const entityId = entity(key);
      return entityId
        ? {
            entity: entityId,
            name,
            icon,
            show_state: true,
            show_name: false,
            show_background: true,
            tap_action: { action: "more-info" },
          }
        : null;
    };
    const present = (cards) => cards.filter(Boolean);

    const vehicleCards = present([
      {
        type: "heading",
        heading: strings.overview,
        icon: "mdi:car-electric",
        heading_style: "title",
        badges: [{ type: "entity", entity: statusEntity, show_state: true, show_name: false }],
      },
      tracker
        ? {
            type: "custom:button-card",
            entity: entity("battery") || tracker,
            show_name: false,
            show_state: false,
            show_icon: false,
            tap_action: { action: "more-info" },
            custom_fields: {
              vehicle_image: `[[[
                const picture = states["${tracker}"]?.attributes?.entity_picture;
                return picture
                  ? \`<img src="\${picture}" alt="" style="width:100%;height:100%;object-fit:contain">\`
                  : '<ha-icon icon="mdi:car-electric" style="width:110px;height:110px"></ha-icon>';
              ]]]`,
            },
            styles: {
              card: [{ height: "180px" }, { padding: "10px" }, { overflow: "hidden" }],
              custom_fields: { vehicle_image: [{ width: "100%" }, { height: "160px" }, { display: "flex" }, { "align-items": "center" }, { "justify-content": "center" }] },
            },
            grid_options: { columns: "full", rows: 4 },
          }
        : null,
      bubble("battery", strings.battery, "mdi:battery", [
        subState("autonomy", strings.range, "mdi:map-marker-distance"),
        subState("battery_capacity", "kWh", "mdi:battery-medium"),
      ]),
      tile("autonomy", strings.range, "mdi:map-marker-distance"),
      tile("mileage", strings.mileage, "mdi:road-variant"),
      tile("temperature", strings.temperature, "mdi:thermometer"),
      tile("service_battery_voltage", "12 V", "mdi:car-battery"),
      tile("doors", strings.doors, "mdi:car-door"),
      tile("alarm", strings.alarm, "mdi:shield-lock"),
      tile("privacy_mode", strings.privacy, "mdi:shield-account", 12),
      metric("trailing_consumption_500km")
        ? { type: "tile", entity: metric("trailing_consumption_500km"), name: strings.trailingConsumption, icon: "mdi:lightning-bolt-circle", vertical: false, grid_options: { columns: 6 } }
        : null,
      metric("distance_since_charge")
        ? { type: "tile", entity: metric("distance_since_charge"), name: strings.distanceSinceCharge, icon: "mdi:map-marker-distance", vertical: false, grid_options: { columns: 6 } }
        : null,
      metric("current_trip_energy")
        ? { type: "tile", entity: metric("current_trip_energy"), name: strings.currentTripEnergy, icon: "mdi:battery-minus", vertical: false, grid_options: { columns: 12 } }
        : null,
      bubble("remote_commands", strings.remote, "mdi:car-wireless", [
        press("wakeup", strings.manualWakeup, "mdi:car-key"),
      ]),
      bubble("preconditioning", strings.climate, "mdi:air-conditioner", [
        press("preconditioning_start", strings.startClimate, "mdi:fan"),
        press("preconditioning_stop", strings.stopClimate, "mdi:fan-off"),
      ]),
      bubble("battery_charging", strings.chargeStatus, "mdi:battery-charging", [
        subState("battery_charging_type", "AC/DC", "mdi:current-ac"),
        subState("battery_charging_end", "Ende", "mdi:clock-end"),
        press("charge_start", strings.startCharging, "mdi:play"),
        press("charge_stop", strings.stopCharging, "mdi:stop"),
      ]),
      tile("battery_plugged", strings.cable, "mdi:ev-plug-type2", 12),
    ]);

    if (tracker) {
      vehicleCards.push({
        type: "custom:map-card",
        focus_entity: tracker,
        zoom: 15,
        entities: [{ entity: tracker }],
        grid_options: { columns: "full", rows: 7 },
      });
    } else {
      vehicleCards.push(markdown(`**${strings.trackerUnavailable}**`));
    }

    const views = [{
      title: strings.vehicle,
      path: "vehicle",
      icon: "mdi:car-electric",
      type: "sections",
      max_columns: 3,
      sections: [{ type: "grid", cards: vehicleCards }],
    }];

    if (modules.trips && (entity("last_trip") || metric("last_trip_result"))) {
      const tripHistoryEntity = metric("last_trip_result") || entity("last_trip");
      views.push({
        title: strings.trips,
        path: "trips",
        icon: "mdi:road-variant",
        type: "sections",
        max_columns: 2,
        sections: [{
          type: "grid",
          cards: present([
            { type: "heading", heading: strings.trips, icon: "mdi:road-variant", heading_style: "title" },
            tile("last_trip", strings.lastTrip, "mdi:map-marker-path", 12),
            {
              type: "custom:codex-stellantis-trip-history-card-v4",
              entity: tripHistoryEntity,
              title: strings.tripHistory,
              language: language(hass),
              hours_to_show: 2160,
              max_trips: 50,
              grid_options: { columns: "full" },
            },
          ]),
        }],
      });
    }

    if (modules.charging && entity("battery_charging") && entity("battery")) {
      views.push({
        title: strings.charging,
        path: "charging",
        icon: "mdi:ev-station",
        type: "sections",
        max_columns: 2,
        sections: [{
          type: "grid",
          cards: present([
            { type: "heading", heading: strings.charging, icon: "mdi:ev-station", heading_style: "title" },
            bubble("battery_charging", strings.chargeStatus, "mdi:battery-charging"),
            {
              type: "custom:codex-stellantis-charge-history-card-v1",
              title: strings.chargeHistory,
              language: language(hass),
              charging_entity: entity("battery_charging"),
              soc_entity: entity("battery"),
              power_entity: entity("battery_charging_rate"),
              mode_entity: entity("battery_charging_type"),
              capacity_entity: entity("battery_capacity"),
              hours_to_show: 2160,
              max_sessions: 50,
              fallback_capacity_kwh: 43.4,
              grid_options: { columns: "full" },
            },
            {
              type: "custom:codex-stellantis-charge-curve-browser-card-v1",
              title: strings.chargeCurves,
              charging_entity: entity("battery_charging"),
              soc_entity: entity("battery"),
              power_entity: entity("battery_charging_rate"),
              mode_entity: entity("battery_charging_type"),
              capacity_entity: entity("battery_capacity"),
              hours_to_show: 2160,
              fallback_capacity_kwh: 43.4,
              grid_options: { columns: "full" },
            },
          ]),
        }],
      });
    }

    if (modules.gps && tracker) {
      views.push({
        title: strings.gps,
        path: "gps",
        icon: "mdi:map-marker-path",
        type: "sections",
        max_columns: 2,
        sections: [{
          type: "grid",
          cards: [
            { type: "heading", heading: strings.gps, icon: "mdi:map-marker-path", heading_style: "title" },
            { type: "map", title: strings.recentTrack, entities: [tracker], hours_to_show: 168, auto_fit: true, grid_options: { columns: "full", rows: 8 } },
            { type: "custom:map-card", title: strings.currentPosition, focus_entity: tracker, zoom: 15, entities: [{ entity: tracker }], grid_options: { columns: "full", rows: 7 } },
          ],
        }],
      });
    }

    if (modules.wakeup && entity("wakeup")) {
      views.push({
        title: strings.wakeup,
        path: "wakeup",
        icon: "mdi:power-sleep",
        type: "sections",
        max_columns: 2,
        sections: [{
          type: "grid",
          cards: [
            { type: "heading", heading: strings.wakeup, icon: "mdi:power-sleep", heading_style: "title" },
            { type: "button", entity: entity("wakeup"), name: strings.manualWakeup, icon: "mdi:car-key", show_state: false, grid_options: { columns: "full" } },
            bubble("remote_commands", strings.remote, "mdi:car-wireless"),
          ],
        }],
      });
    }

    views.push({
      title: strings.system,
      path: "system",
      icon: "mdi:car-cog",
      type: "sections",
      max_columns: 2,
      sections: [{
        type: "grid",
        cards: [
          { type: "heading", heading: strings.system, icon: "mdi:car-cog", heading_style: "title" },
          { type: "entities", title: strings.status, entities: [statusEntity], grid_options: { columns: "full" } },
          markdown(`**${strings.mappedEntities}:** ${Object.keys(mapped).length}`),
        ],
      }],
    });

    return {
      title: strings.name,
      icon: "mdi:car-electric",
      views,
    };
  }
}

class Ec3DashboardStrategyEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this.innerHTML = `
      <div style="padding: 8px 0; line-height: 1.5;">
        <strong>e-C3 Dashboard</strong><br>
        Dieses Dashboard verwendet die zuvor eingerichtete e-C3-Dashboard-Integration.
        Nach dem Erstellen werden keine vorhandenen Fahrzeug-Dashboards oder Entitäten verändert.
      </div>`;
    queueMicrotask(() => this.configChanged(this._config));
  }

  set hass(_hass) {}

  configChanged(config) {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        bubbles: true,
        composed: true,
        detail: { config },
      })
    );
  }
}

if (!customElements.get("ll-strategy-dashboard-e-c3-dashboard")) {
  customElements.define(
    "ll-strategy-dashboard-e-c3-dashboard",
    Ec3DashboardStrategy
  );
}
if (!customElements.get("e-c3-dashboard-strategy-editor")) {
  customElements.define(
    "e-c3-dashboard-strategy-editor",
    Ec3DashboardStrategyEditor
  );
}

window.customStrategies = window.customStrategies || [];
window.customStrategies.push({
  type: STRATEGY_TYPE,
  strategyType: "dashboard",
  name: "e-C3 Dashboard",
  description: "Vehicle dashboard for Stellantis Vehicles",
});
