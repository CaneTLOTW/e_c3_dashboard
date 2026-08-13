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

class Ec3DashboardStrategy {
  static getCreateSuggestions() {
    return {
      title: "e-C3 Dashboard",
      icon: "mdi:car-electric",
    };
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

    const vehicleCards = [
      {
        type: "heading",
        heading: strings.vehicle,
        icon: "mdi:car-electric",
        heading_style: "title",
        badges: [
          {
            type: "entity",
            entity: statusEntity,
            show_state: true,
            show_name: false,
          },
        ],
      },
      {
        type: "custom:bubble-card",
        card_type: "button",
        button_type: "state",
        entity: statusEntity,
        name: strings.status,
        icon: "mdi:car-cog",
        show_state: true,
        button_action: { tap_action: { action: "more-info" } },
      },
      {
        type: "custom:button-card",
        entity: statusEntity,
        name: strings.status,
        icon: "mdi:car-connected",
        show_state: true,
        tap_action: { action: "more-info" },
      },
    ];

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

    const views = [
      {
        title: strings.vehicle,
        path: "vehicle",
        icon: "mdi:car-electric",
        type: "sections",
        max_columns: 3,
        sections: [{ type: "grid", cards: vehicleCards }],
      },
    ];

    for (const [enabled, name, icon, path] of [
      [modules.trips, strings.trips, "mdi:road-variant", "trips"],
      [modules.charging, strings.charging, "mdi:ev-station", "charging"],
      [modules.gps, strings.gps, "mdi:map-marker-path", "gps"],
      [modules.wakeup, strings.wakeup, "mdi:power-sleep", "wakeup"],
    ]) {
      if (enabled) {
        views.push({
          title: name,
          path,
          icon,
          type: "sections",
          max_columns: 2,
          sections: [
            {
              type: "grid",
              cards: [
                { type: "heading", heading: name, icon, heading_style: "title" },
                markdown(strings.foundation),
              ],
            },
          ],
        });
      }
    }

    return {
      title: strings.name,
      icon: "mdi:car-electric",
      views,
    };
  }
}

customElements.define(
  "ll-strategy-dashboard-e-c3-dashboard",
  Ec3DashboardStrategy
);

window.customStrategies = window.customStrategies || [];
window.customStrategies.push({
  type: STRATEGY_TYPE,
  strategyType: "dashboard",
  name: "e-C3 Dashboard",
  description: "Vehicle dashboard for Stellantis Vehicles",
});
