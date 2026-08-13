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
    live: "Live",
    consumptionUsage: "Consumption & usage",
    quickActions: "Quick actions",
    chargingRange: "Charging & range",
    chargeLimit: "Charging limit",
    chargeStart: "Charging start",
    highVoltageBattery: "High-voltage battery",
    lastCharge: "Last charge",
    batteryHealthCapacity: "SOH capacity",
    batteryHealthResistance: "SOH resistance",
    position: "Position",
    vehicleDetails: "Vehicle",
    batteryHealth: "Battery health",
    latestActivities: "Latest activity",
    settings: "Settings",
    commandStatus: "Last remote command",
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
    live: "Live",
    consumptionUsage: "Verbrauch & Nutzung",
    quickActions: "Schnellaktionen",
    chargingRange: "Laden & Reichweite",
    chargeLimit: "Ladelimit",
    chargeStart: "Ladebeginn",
    highVoltageBattery: "Hochvoltbatterie",
    lastCharge: "Letzte Ladung",
    batteryHealthCapacity: "SOH Kapazität",
    batteryHealthResistance: "SOH Widerstand",
    position: "Position",
    vehicleDetails: "Fahrzeug",
    batteryHealth: "Batteriegesundheit",
    latestActivities: "Letzte Aktivitäten",
    settings: "Einstellungen",
    commandStatus: "Letzter Fernbefehl",
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
      // Derived metrics carry the same integration marker.  Only the status
      // sensor owns the complete entity mapping and therefore represents one
      // configured vehicle.
      typeof attributes.entity_mapping === "object" &&
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
    const currentChargePower = metric("current_charge_power") || entity("battery_charging_rate");
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
    const bubble = (key, name, icon, subButton = [], columns = "full") => {
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
            grid_options: { columns },
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

    const separator = (name, icon) => ({
      type: "custom:bubble-card",
      card_type: "separator",
      name,
      icon,
    });

    const hero = tracker && entity("battery") ? {
      type: "custom:button-card",
      entity: entity("battery"),
      show_name: false,
      show_state: false,
      show_icon: false,
      tap_action: { action: "more-info" },
      custom_fields: {
        vehicle_image: `[[[
          const picture = states["${tracker}"]?.attributes?.entity_picture;
          return picture
            ? '<img src="' + picture + '" alt="" style="width:100%;height:100%;object-fit:contain">'
            : '<ha-icon icon="mdi:car-electric" style="width:130px;height:130px;color:var(--primary-color)"></ha-icon>';
        ]]]`,
        range: `[[[
          const e = states["${entity("autonomy")}"];
          const value = Number(e?.state);
          return '<span class="ec3-chip"><ha-icon icon="mdi:map-marker-distance"></ha-icon>' +
            (Number.isFinite(value) ? Math.round(value) + ' km' : '— km') + '</span>';
        ]]]`,
        status: `[[[
          const charging = states["${entity("battery_charging")}"]?.state === 'on';
          const active = charging ? states["${entity("battery_charging_end")}"] : states["${entity("temperature")}"];
          const value = active?.state;
          const unit = active?.attributes?.unit_of_measurement || '';
          const icon = charging ? 'mdi:clock-end' : 'mdi:thermometer';
          return '<span class="ec3-chip"><ha-icon icon="' + icon + '"></ha-icon>' +
            (value && !['unknown', 'unavailable'].includes(value) ? value + (unit ? ' ' + unit : '') : '—') + '</span>';
        ]]]`,
        climate: `[[[ return states["${entity("preconditioning")}"]?.state === 'on' ? '<span class="ec3-indicator blue"><ha-icon icon="mdi:air-conditioner"></ha-icon></span>' : ''; ]]]`,
        cable: `[[[ return states["${entity("battery_plugged")}"]?.state === 'on' ? '<span class="ec3-indicator green"><ha-icon icon="mdi:ev-plug-type2"></ha-icon></span>' : ''; ]]]`,
        driving: `[[[ return states["${entity("engine")}"]?.state === 'on' ? '<span class="ec3-indicator driving"><ha-icon icon="mdi:lightning-bolt"></ha-icon></span>' : ''; ]]]`,
        battery_bar: `[[[
          const soc = Math.max(0, Math.min(100, Number(entity.state) || 0));
          const charging = states["${entity("battery_charging")}"]?.state === 'on';
          const driving = states["${entity("engine")}"]?.state === 'on';
          const power = states["${currentChargePower}"];
          const label = charging
            ? '${strings.chargeStatus}' + (Number.isFinite(Number(power?.state)) ? ' · ' + Number(power.state).toFixed(1) + ' kW' : '')
            : driving ? '${strings.currentTripEnergy}' : '${strings.battery}';
          const color = charging ? 'rgba(76,175,80,.96)' : 'rgba(33,150,243,.96)';
          const pulse = charging || driving ? ' ec3-pulse' : '';
          return '<div class="ec3-battery' + pulse + '" style="background:linear-gradient(90deg,' + color + ' ' + soc + '%,rgba(20,20,20,.64) ' + soc + '%)"><span>' + label + '</span><strong>' + Math.round(soc) + ' %</strong></div>';
        ]]]`,
      },
      styles: {
        card: [{ position: "relative" }, { height: "270px" }, { padding: 0 }, { overflow: "hidden" }, { "border-radius": "12px" }],
        custom_fields: {
          vehicle_image: [{ position: "absolute" }, { inset: "0" }, { display: "flex" }, { "align-items": "center" }, { "justify-content": "center" }],
          range: [{ position: "absolute" }, { top: "12px" }, { left: "12px" }, { "z-index": 2 }],
          status: [{ position: "absolute" }, { top: "12px" }, { right: "12px" }, { "z-index": 2 }],
          climate: [{ position: "absolute" }, { top: "48px" }, { left: "12px" }, { "z-index": 2 }],
          cable: [{ position: "absolute" }, { top: "48px" }, { right: "12px" }, { "z-index": 2 }],
          driving: [{ position: "absolute" }, { top: "115px" }, { left: "50%" }, { transform: "translateX(-50%)" }, { "z-index": 2 }],
          battery_bar: [{ position: "absolute" }, { left: "12px" }, { right: "12px" }, { bottom: "10px" }, { "z-index": 2 }],
        },
      },
      extra_styles: `
        .ec3-chip { display:flex; gap:4px; align-items:center; min-height:26px; padding:0 9px; border-radius:14px; background:rgba(20,20,20,.64); color:white; font-size:12px; font-weight:600; text-shadow:0 1px 2px rgba(0,0,0,.5); }
        .ec3-chip ha-icon { width:16px; height:16px; }
        .ec3-indicator { display:flex; width:28px; height:28px; align-items:center; justify-content:center; border-radius:50%; color:white; box-shadow:0 1px 4px rgba(0,0,0,.28); }
        .ec3-indicator ha-icon { width:18px; height:18px; }
        .ec3-indicator.blue { background:rgba(33,150,243,.9); }
        .ec3-indicator.green, .ec3-indicator.driving { background:rgba(76,175,80,.92); }
        .ec3-battery { display:flex; justify-content:space-between; align-items:center; height:22px; padding:0 12px; border-radius:11px; color:white; font-size:12px; font-weight:600; text-shadow:0 1px 2px rgba(0,0,0,.65); }
        .ec3-pulse { animation:ec3BatteryPulse 1.6s ease-in-out infinite; }
        @keyframes ec3BatteryPulse { 50% { filter:brightness(1.15); box-shadow:0 0 16px 3px rgba(76,175,80,.65); } }
      `,
      grid_options: { columns: "full", rows: 5 },
    } : null;

    const overviewSections = [
      { type: "grid", cards: present([
        separator(strings.live, "mdi:car-connected"),
        hero,
        bubble("remote_commands", strings.remote, "mdi:car-wireless", [press("wakeup", strings.manualWakeup, "mdi:car-key")]),
        bubble("service_battery_voltage", "12 V", "mdi:car-battery", [], 6),
      ]) },
      { type: "grid", cards: present([
        separator(strings.consumptionUsage, "mdi:chart-line"),
        metric("trailing_consumption_500km") ? { type: "custom:bubble-card", card_type: "button", button_type: "state", entity: metric("trailing_consumption_500km"), name: strings.trailingConsumption, icon: "mdi:lightning-bolt-circle", force_icon: true, card_layout: "large", grid_options: { columns: 6 } } : null,
        metric("distance_since_charge") ? { type: "custom:bubble-card", card_type: "button", button_type: "state", entity: metric("distance_since_charge"), name: strings.distanceSinceCharge, icon: "mdi:map-marker-distance", force_icon: true, card_layout: "large", grid_options: { columns: 6 } } : null,
        metric("current_trip_energy") ? { type: "custom:bubble-card", card_type: "button", button_type: "state", entity: metric("current_trip_energy"), name: strings.currentTripEnergy, icon: "mdi:battery-minus", force_icon: true, card_layout: "large" } : null,
      ]) },
      { type: "grid", cards: present([
        separator(strings.quickActions, "mdi:lightning-bolt"),
        bubble("command_status", strings.commandStatus, "mdi:remote"),
        bubble("preconditioning", strings.climate, "mdi:air-conditioner", [press("preconditioning_start", strings.startClimate, "mdi:fan"), press("preconditioning_stop", strings.stopClimate, "mdi:fan-off")]),
      ]) },
      { type: "grid", cards: present([
        separator(strings.chargingRange, "mdi:battery-charging"),
        bubble("battery_charging", strings.chargeStatus, "mdi:ev-station", [subState("battery_charging_type", "AC/DC", "mdi:current-ac"), subState("battery_charging_end", "End", "mdi:clock-end"), currentChargePower ? { entity: currentChargePower, name: "kW", icon: "mdi:flash", show_state: true, show_name: false, show_background: true, tap_action: { action: "more-info" } } : null, subState("battery_plugged", strings.cable, "mdi:ev-plug-type2")]),
        bubble("battery_charging_limit", strings.chargeLimit, "mdi:battery-lock", [], 6),
        bubble("battery_charging_start", strings.chargeStart, "mdi:clock-start", [], 6),
      ]) },
      { type: "grid", cards: present([
        separator(strings.position, "mdi:map-marker"),
        tracker ? { type: "custom:map-card", focus_entity: tracker, zoom: 17, entities: [{ entity: tracker }], grid_options: { columns: "full", rows: 5 } } : markdown(`**${strings.trackerUnavailable}**`),
      ]) },
      { type: "grid", cards: present([
        separator(strings.vehicleDetails, "mdi:car-info"),
        bubble("mileage", strings.mileage, "mdi:counter", [subState("engine", "", "mdi:car-electric")]),
        bubble("doors", strings.doors, "mdi:car-door", [], 6),
        bubble("alarm", strings.alarm, "mdi:shield-lock", [], 6),
        bubble("privacy_mode", strings.privacy, "mdi:shield-account", [subState("privacy", "", "mdi:shield-check")]),
      ]) },
      { type: "grid", cards: present([
        separator(strings.batteryHealth, "mdi:battery-heart-variant"),
        bubble("battery_health_capacity", strings.batteryHealthCapacity, "mdi:battery-heart", [], 6),
        bubble("battery_health_resistance", strings.batteryHealthResistance, "mdi:resistor", [], 6),
        bubble("battery_capacity", strings.highVoltageBattery, "mdi:car-battery"),
      ]) },
      { type: "grid", cards: present([
        separator(strings.latestActivities, "mdi:history"),
        bubble("last_trip", strings.lastTrip, "mdi:map-marker-distance", [], 6),
        bubble("last_charge", strings.lastCharge, "mdi:ev-station", [], 6),
      ]) },
    ];

    const views = [{
      title: strings.vehicle,
      path: "vehicle",
      icon: "mdi:car-electric",
      type: "sections",
      max_columns: 2,
      badges: [{ type: "entity", entity: statusEntity, show_state: true, show_name: false }],
      sections: overviewSections,
    }];

    if (modules.trips && (entity("last_trip") || metric("last_trip_result"))) {
      // The upstream Last trip sensor carries the durable trip rows. The
      // package's own result sensor enriches future rows with locally derived
      // energy. No installation-specific helper is ever used as a fallback.
      const tripHistoryEntity = entity("last_trip") || metric("last_trip_result");
      const tripEnergyEntities = [
        metric("last_trip_result"),
      ].filter(Boolean);
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
              energy_entities: tripEnergyEntities,
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
              power_entity: currentChargePower,
              mode_entity: entity("battery_charging_type"),
              capacity_entity: entity("battery_capacity"),
              result_entity: metric("last_charge_result"),
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
              power_entity: currentChargePower,
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
