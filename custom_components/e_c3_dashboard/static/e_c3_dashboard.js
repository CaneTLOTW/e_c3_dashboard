/* e-C3 Dashboard Community Dashboard strategy.
 *
 * This file deliberately generates only safe, mapped entity IDs from the
 * status entity created by the backend config entry. It never derives IDs from
 * VINs or friendly names.
 */
import { languageFor, textFor } from "./i18n.js?v=0.5.10";
const STRATEGY_TYPE = "e-c3-dashboard";
const STATUS_DOMAIN = "e_c3_dashboard";
const LONG_TERM_STATISTICS_DAYS = 3650;
const CHARGE_SELECTION_QUERY_PARAM = "e_c3_charge";
const REQUIRED_ELEMENTS = [
  ["bubble-card", "Bubble Card"],
  ["button-card", "Button Card"],
  ["map-card", "ha-map-card"],
  ["layout-card", "layout-card"],
];

function language(hass) {
  return languageFor(hass);
}

function t(hass) {
  return textFor(hass, "dashboard");
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
    // The selected charge is encoded in the URL only while the charging view
    // is active.  Lovelace can retain the query string when switching back to
    // another strategy view; remove that stale UI state without reloading the
    // page.  sessionStorage remains the durable hand-off between the views.
    if (typeof window !== "undefined" && !/\/charging\/?$/.test(window.location.pathname || "")) {
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.has(CHARGE_SELECTION_QUERY_PARAM)) {
        currentUrl.searchParams.delete(CHARGE_SELECTION_QUERY_PARAM);
        window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      }
    }

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
    // This controls only history queries and the number of rows rendered.
    // Recorder retention is deliberately a global HA setting and may be
    // shorter than the configured display window.
    const historyHours = Math.min(8760, Math.max(24, Number(attributes.history_window_hours ?? modules.history_hours) || 2160));
    const dashboardBasePath = (() => {
      const pathname = window.location.pathname || "";
      const parts = pathname.split("/").filter(Boolean);
      return parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : "";
    })();
    const chargeViewPath = `${dashboardBasePath}/charging`;
    const statisticsViewPath = `${dashboardBasePath}/statistics`;
    const chargeSelectionKey = `e_c3_dashboard_charge_selection_${attributes.entry_id}`;
    const mapped = attributes.entity_mapping || {};
    const controls = attributes.control_entities || {};
    const metric = (key) => attributes.metric_entities?.[key] || getMetricEntity(hass, attributes.entry_id, key);
    const serverHistoryEntity = (key) => attributes.server_history_entities?.[key];
    const serverTripEntity = serverHistoryEntity("server_trip_history");
    const serverGpsEntity = serverHistoryEntity("server_gps_history");
    const serverChargeEntity = serverHistoryEntity("server_charge_history");
    const entity = (key) => mapped[key];
    const control = (key) => controls[key];
    const controlSwitch = (key, name, icon, columns = 6) => control(key) ? {
      type: "custom:bubble-card", card_type: "button", button_type: "switch",
      entity: control(key), name, icon, force_icon: true, show_state: true,
      card_layout: "large", grid_options: { columns },
    } : null;
    const controlButton = (key, name, icon, columns = "full") => control(key) ? {
      type: "button", entity: control(key), name, icon, show_state: false,
      grid_options: { columns },
    } : null;
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
    const bubble = (key, name, icon, subButton = [], columns = "full", entityOverride = null) => {
      const entityId = entityOverride || entity(key);
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
    // Prefer the restart-safe local result for the latest trip.  The native
    // Stellantis value remains in the history source list as a fallback and
    // for older trips that were reported before this package was installed.
    const lastTripResult = metric("last_trip_result");
    const nativeLastTrip = entity("last_trip");
    const lastTripDisplayEntity = lastTripResult || nativeLastTrip;
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
      view_layout: { "grid-column": "1 / -1" },
    });

    // Mirror the compact two-column layout of the maintained reference
    // dashboard without exposing any installation-specific entity IDs. The
    // strategy owns the layout; every card still gets its entity from the
    // selected config-entry mapping above.
    const layoutCard = (cards) => ({
      type: "custom:layout-card",
      layout_type: "custom:grid-layout",
      layout: {
        "grid-template-columns": "repeat(2, minmax(0, 1fr))",
        "grid-auto-flow": "row",
        "grid-auto-rows": "auto",
        "grid-gap": "8px",
        margin: "0",
        padding: "0",
      },
      cards: present(cards).map((card) => {
        const { grid_options, ...layoutCompatibleCard } = card;
        const columns = grid_options?.columns;
        if (columns === "full" || Number(columns) >= 12) {
          return {
            ...layoutCompatibleCard,
            view_layout: {
              ...layoutCompatibleCard.view_layout,
              "grid-column": "1 / -1",
            },
          };
        }
        return layoutCompatibleCard;
      }),
    });

    const ageTextStyles = (onLabel, offLabel, onIcon, offIcon) => `\${(() => {
      const e = hass.states[entity]; const raw = e?.state;
      const label = raw === 'on' ? '${onLabel}' : raw === 'off' ? '${offLabel}' : '—';
      const updated = e?.attributes?.last_updated ?? e?.attributes?.['Last updated'] ?? e?.attributes?.['Zuletzt aktualisiert'];
      const minutes = updated && Number.isFinite(Date.parse(updated)) ? Math.max(0, Math.floor((Date.now() - Date.parse(updated)) / 60000)) : null;
      const age = minutes === null ? '' : minutes === 0 ? ' · gerade' : minutes === 1 ? ' · vor 1 Min.' : minutes < 60 ? ' · vor ' + minutes + ' Min.' : minutes < 1440 ? ' · vor ' + Math.floor(minutes / 60) + ' Std.' : ' · vor ' + Math.floor(minutes / 1440) + ' Tagen';
      card.querySelector('.bubble-state').innerText = label + age;
      icon.setAttribute('icon', raw === 'on' ? '${onIcon}' : raw === 'off' ? '${offIcon}' : 'mdi:help-circle-outline');
    })()}`;
    const chargeSubStateFormatter = (index, entityId, kind = "text") => {
      if (!entityId) return "";

      const entityLiteral = JSON.stringify(entityId);
      const valueCode = kind === "power"
        ? `const value = stateEntity?.state;
        const numericValue = Number(value);
        const text = invalid(value) || !Number.isFinite(numericValue)
          ? '0 kW'
          : numericValue.toFixed(1).replace('.', ',') + ' ' + (stateEntity.attributes?.unit_of_measurement || 'kW');`
        : kind === "time"
          ? `const value = stateEntity?.state;
        const raw = String(value ?? '').trim();
        const parsed = new Date(raw);
        const text = invalid(value) ? '-' : Number.isNaN(parsed.getTime())
          ? (/^[0-9]{1,2}:[0-9]{2}$/.test(raw) ? raw.padStart(5, '0') : '-')
          : String(parsed.getHours()).padStart(2, '0') + ':' + String(parsed.getMinutes()).padStart(2, '0');`
        : `const text = invalid(stateEntity?.state) ? '-' : stateEntity.state;`;

      return "${(() => {\n" +
        `        const stateEntity = hass.states[${entityLiteral}];\n` +
        "        const invalid = (value) => !value || ['unknown', 'unavailable', 'none', 'NO'].includes(value);\n" +
        `        ${valueCode}\n` +
        `        const target = card.querySelector('.bubble-sub-button-${index} .bubble-sub-button-name-container');\n` +
        "        if (target) target.innerText = text;\n" +
        "      })()}";
    };

    const chargingCardSubStateStyles = [
      chargeSubStateFormatter(1, entity("battery_charging_type")),
      chargeSubStateFormatter(2, entity("battery_charging_end"), "time"),
      chargeSubStateFormatter(3, currentChargePower, "power"),
    ].filter(Boolean).join("\n");

    const chargingCard = entity("battery_charging") ? {
      type: "custom:bubble-card", card_type: "button", button_type: "state",
      entity: entity("battery_charging"), name: strings.chargeStatus, icon: "mdi:ev-station",
      show_state: true, force_icon: true, card_layout: "large",
      grid_options: { columns: 12, rows: 1.5 }, button_action: { tap_action: { action: "more-info" } },
      sub_button: [
        subState("battery_charging_type", "AC/DC", "mdi:current-ac"),
        subState("battery_charging_end", "End", "mdi:clock-end"),
        currentChargePower ? { entity: currentChargePower, name: "kW", icon: "mdi:flash", show_state: true, show_name: false, show_background: true, tap_action: { action: "more-info" } } : null,
        subState("battery_plugged", strings.cable, "mdi:ev-plug-type2"),
      ].filter(Boolean),
      styles: `.bubble-button-card-container { position:relative !important; height:88px !important; min-height:88px !important; background:\${state === 'on' ? 'rgba(76,175,80,0.25)' : ''} !important; }
        .bubble-icon-container { position:absolute !important; left:8px !important; top:7px !important; }
        .bubble-icon { color:\${state === 'on' ? 'var(--success-color)' : ''} !important; }
        .bubble-name-container { position:absolute !important; top:7px !important; left:62px !important; right:10px !important; width:auto !important; overflow:visible !important; }
        .bubble-name,.bubble-state { white-space:nowrap !important; overflow:visible !important; text-overflow:unset !important; }
        .bubble-sub-button-container { position:absolute !important; left:8px !important; right:8px !important; bottom:6px !important; width:auto !important; margin:0 !important; padding:0 !important; display:flex !important; align-items:center !important; justify-content:flex-end !important; gap:6px !important; }
        .bubble-sub-button-4 { background-color:\${hass.states['${entity("battery_plugged")}']?.state === 'on' ? 'rgba(76,175,80,0.35)' : ''} !important; }
        .bubble-sub-button-4 > ha-icon { color:\${hass.states['${entity("battery_plugged")}']?.state === 'on' ? 'var(--success-color)' : ''} !important; }
        ${chargingCardSubStateStyles}`,
    } : null;

    const vehiclePicture = tracker
      ? hass.states[tracker]?.attributes?.entity_picture
      : undefined;
    const markerPicture = vehiclePicture
      ? `${vehiclePicture}${vehiclePicture.includes("?") ? "&" : "?"}v=3`
      : undefined;
    const heroChipStyles = {
      card: [{ height: "26px" }, { "min-height": "26px" }, { padding: "0 9px" }, { margin: 0 }, { border: "none" }, { "border-radius": "14px" }, { "box-shadow": "none" }, { background: "rgba(20,20,20,0.62)" }, { color: "white" }, { cursor: "pointer" }, { "text-shadow": "0 1px 2px rgba(0,0,0,0.5)" }],
      grid: [{ "grid-template-areas": "'i n'" }, { "grid-template-columns": "16px auto" }, { "column-gap": "4px" }, { "align-items": "center" }, { "justify-content": "center" }],
      icon: [{ width: "16px" }, { height: "16px" }, { color: "white" }, { margin: 0 }, { padding: 0 }],
      name: [{ margin: 0 }, { padding: 0 }, { "font-size": "12px" }, { "font-weight": 600 }, { "line-height": "16px" }, { "white-space": "nowrap" }, { color: "white" }],
    };
    const vehicleInfoEntity = metric("vehicle_info");
    const vehicleInfoButton = vehicleInfoEntity ? {
      card: {
        type: "custom:button-card", entity: vehicleInfoEntity,
        show_name: false, show_state: false, show_icon: true,
        icon: "mdi:information-outline",
        tap_action: { action: "more-info" }, hold_action: { action: "more-info" },
        styles: {
          card: [{ width: "30px" }, { height: "30px" }, { "min-height": "30px" }, { padding: 0 }, { margin: 0 }, { "border-radius": "50%" }, { border: "none" }, { background: "rgba(20,20,20,0.72)" }, { color: "white" }, { "box-shadow": "0 1px 4px rgba(0,0,0,0.22)" }],
          icon: [{ width: "18px" }, { height: "18px" }, { color: "white" }],
        },
      },
    } : null;
    const hero = tracker && entity("battery") ? {
      type: "custom:button-card",
      entity: entity("battery"), show_name: false, show_state: false, show_icon: false,
      tap_action: { action: "none" }, grid_options: { columns: "full", rows: 4.5 },
      styles: {
        card: [{ position: "relative" }, { height: "270px" }, { overflow: "hidden" }, { "border-radius": "12px" }, { padding: 0 }, { background: "transparent" }, { "background-image": vehiclePicture ? `url("${vehiclePicture}")` : "none" }, { "background-repeat": "no-repeat" }, { "background-size": "100% auto" }, { "background-position": "center 54%" }],
        custom_fields: {
          range: [{ position: "absolute" }, { top: "12px" }, { left: "12px" }, { "z-index": 20 }],
          right_status: [{ position: "absolute" }, { top: "12px" }, { right: "50px" }, { "z-index": 20 }],
          info: [{ position: "absolute" }, { top: "10px" }, { right: "10px" }, { "z-index": 21 }],
          climate: [{ position: "absolute" }, { top: "48px" }, { left: "12px" }, { "z-index": 10 }, { width: "28px" }, { height: "28px" }, { "border-radius": "50%" }, { color: "white" }, { "align-items": "center" }, { "justify-content": "center" }, { "box-shadow": "0 1px 4px rgba(0,0,0,0.22)" }, { background: `[[[ const t = states["${entity("temperature")}"]; return !t || ['unknown','unavailable'].includes(t.state) || !Number.isFinite(Number(t.state)) ? 'rgba(90,90,90,0.88)' : Number(t.state) > 20 ? 'rgba(33,150,243,0.88)' : 'rgba(244,67,54,0.88)'; ]]]` }, { display: `[[[ return states["${entity("preconditioning")}"]?.state === 'on' ? 'flex' : 'none'; ]]]` }],
          cable: [{ position: "absolute" }, { top: "48px" }, { right: "12px" }, { "z-index": 10 }, { width: "28px" }, { height: "28px" }, { "border-radius": "50%" }, { background: "rgba(76,175,80,0.88)" }, { color: "white" }, { "align-items": "center" }, { "justify-content": "center" }, { "box-shadow": "0 1px 4px rgba(0,0,0,0.22)" }, { display: `[[[ return states["${entity("battery_plugged")}"]?.state === 'on' ? 'flex' : 'none'; ]]]` }],
          driving: [{ position: "absolute" }, { top: "115px" }, { left: "140px" }, { transform: "translateX(-50%)" }, { "z-index": 10 }, { width: "30px" }, { height: "30px" }, { "min-width": "30px" }, { "min-height": "30px" }, { padding: 0 }, { margin: 0 }, { "box-sizing": "border-box" }, { "border-radius": "50%" }, { background: "rgba(76,175,80,0.92)" }, { color: "white" }, { "align-items": "center" }, { "justify-content": "center" }, { "line-height": 0 }, { "box-shadow": "0 1px 4px rgba(0,0,0,0.28)" }, { display: `[[[ return states["${entity("engine")}"]?.state === 'on' ? 'flex' : 'none'; ]]]` }],
          battery: [{ position: "absolute" }, { left: "12px" }, { right: "12px" }, { bottom: "10px" }, { width: "auto" }, { "z-index": 10 }],
        },
      },
      custom_fields: {
        range: { card: { type: "custom:button-card", entity: entity("autonomy"), show_icon: true, show_name: true, show_state: false, icon: "mdi:map-marker-distance", tap_action: { action: "more-info" }, hold_action: { action: "more-info" }, name: `[[[ const e = states["${entity("autonomy")}"]; return e && !['unknown','unavailable'].includes(e.state) && Number.isFinite(Number(e.state)) ? Math.round(Number(e.state)) + ' km' : '-- km'; ]]]`, styles: heroChipStyles } },
        right_status: { card: { type: "custom:button-card", entity: entity("temperature"), show_icon: true, show_name: true, show_state: false, icon: `[[[ const charging = states["${entity("battery_charging")}"]?.state === 'on'; const end = states["${entity("battery_charging_end")}"]; return charging && end && !['unknown','unavailable','none',''].includes(end.state) ? 'mdi:clock-end' : charging ? 'mdi:battery-charging' : 'mdi:thermometer'; ]]]`, name: `[[[ const charging = states["${entity("battery_charging")}"]?.state === 'on'; const end = states["${entity("battery_charging_end")}"]; const formatClock = (value) => { const raw = String(value ?? '').trim(); if (!raw || ['unknown','unavailable','none'].includes(raw.toLowerCase())) return ''; const parsed = new Date(raw); if (Number.isNaN(parsed.getTime())) return /^[0-9]{1,2}:[0-9]{2}$/.test(raw) ? raw.padStart(5, '0') : ''; return String(parsed.getHours()).padStart(2, '0') + ':' + String(parsed.getMinutes()).padStart(2, '0'); }; if (charging) { const endText = formatClock(end?.state); return endText ? '${language(hass) === "de" ? "bis" : "until"} ' + endText : '${language(hass) === "de" ? "Lädt" : "Charging"}'; } const temp = states["${entity("temperature")}"]; return temp && !['unknown','unavailable'].includes(temp.state) && Number.isFinite(Number(temp.state)) ? temp.state + ' ' + (temp.attributes?.unit_of_measurement || '°C') : '-- °C'; ]]]`, tap_action: { action: "more-info" }, hold_action: { action: "more-info" }, styles: heroChipStyles } },
        info: vehicleInfoButton,
        climate: `[[[ const temp = states["${entity("temperature")}"]; const icon = temp && !['unknown','unavailable'].includes(temp.state) && Number(temp.state) <= 20 ? 'mdi:radiator' : 'mdi:air-conditioner'; return '<ha-icon icon="' + icon + '" style="width:18px;height:18px;display:block;margin:0;padding:0;color:white"></ha-icon>'; ]]]`,
        cable: '<ha-icon icon="mdi:ev-plug-type2" style="width:18px;height:18px;display:block;margin:0;padding:0;color:white"></ha-icon>',
        driving: '<ha-icon icon="mdi:lightning-bolt" style="width:18px;height:18px;display:block;margin:0;padding:0;color:white"></ha-icon>',
        battery: { card: { type: "custom:button-card", entity: entity("battery"), show_name: true, show_state: true, show_icon: false, tap_action: { action: "more-info" }, name: `[[[ const charging = states["${entity("battery_charging")}"]?.state === 'on'; const driving = states["${entity("engine")}"]?.state === 'on'; const power = states["${currentChargePower}"]; const energy = states["${metric("current_trip_energy")}"]; if (charging) return Number.isFinite(Number(power?.state)) ? '${language(hass) === "de" ? "Wird geladen" : "Charging"} · ' + Number(power.state).toFixed(1).replace('.', ',') + ' kW' : '${language(hass) === "de" ? "Wird geladen" : "Charging"}'; if (driving) return Number.isFinite(Number(energy?.state)) ? '${language(hass) === "de" ? "In Fahrt" : "Driving"} · ' + Number(energy.state).toFixed(1).replace('.', ',') + ' kWh' : '${language(hass) === "de" ? "In Fahrt" : "Driving"}'; return '${strings.battery}'; ]]]`, state_display: "[[[ return ['unknown','unavailable'].includes(entity.state) || !Number.isFinite(Number(entity.state)) ? '-- %' : Math.round(Number(entity.state)) + ' %'; ]]]", styles: { grid: [{ "grid-template-areas": "'n s'" }, { "grid-template-columns": "1fr auto" }, { "align-items": "center" }, { height: "100%" }], card: [{ height: "20px" }, { "min-height": "20px" }, { padding: "0 12px" }, { "border-radius": "10px" }, { border: "none" }, { "box-shadow": "none" }, { color: "white" }, { "text-shadow": "0 1px 2px rgba(0,0,0,0.65)" }, { background: `[[[ const value = Math.min(100, Math.max(0, Number(entity.state) || 0)); const charging = states["${entity("battery_charging")}"]?.state === 'on'; return 'linear-gradient(90deg,' + (charging ? 'rgba(76,175,80,0.95)' : 'rgba(33,150,243,0.95)') + ' ' + value + '%,rgba(20,20,20,0.62) ' + value + '%)'; ]]]` }, { animation: `[[[ const charging = states["${entity("battery_charging")}"]?.state === 'on'; const driving = states["${entity("engine")}"]?.state === 'on'; return charging ? 'kfzBatteryChargePulse 1.5s ease-in-out infinite' : driving ? 'kfzBatteryDrivePulse 1.7s ease-in-out infinite' : 'none'; ]]]` }], name: [{ "justify-self": "start" }, { "align-self": "center" }, { height: "20px" }, { "line-height": "20px" }, { margin: 0 }, { padding: 0 }, { "font-size": "12px" }, { "font-weight": 600 }, { "white-space": "nowrap" }], state: [{ "justify-self": "end" }, { "align-self": "center" }, { height: "20px" }, { "line-height": "20px" }, { margin: 0 }, { padding: 0 }, { "font-size": "12px" }, { "font-weight": 600 }, { "white-space": "nowrap" }] }, extra_styles: "@keyframes kfzBatteryChargePulse { 0%,100% { filter:brightness(1); box-shadow:0 0 0 0 rgba(76,175,80,.15); } 50% { filter:brightness(1.16); box-shadow:0 0 16px 4px rgba(76,175,80,.70); } } @keyframes kfzBatteryDrivePulse { 0%,100% { filter:brightness(1); box-shadow:0 0 0 0 rgba(33,150,243,.12); } 50% { filter:brightness(1.12); box-shadow:0 0 14px 3px rgba(33,150,243,.55); } }" } },
      },
    } : null;

    const overviewSections = [
      { type: "grid", cards: present([
        separator(strings.live, "mdi:car-connected"),
        hero,
        entity("remote_commands") ? { ...bubble("remote_commands", strings.remote, "mdi:car-wireless", [press("wakeup", strings.manualWakeup, "mdi:car-connected")]), styles: `\${(() => { const e=hass.states[entity]; const raw=e?.state; const timestamp=Date.parse(e?.last_changed || ''); const seconds=Number.isFinite(timestamp)?Math.max(0,Math.floor((Date.now()-timestamp)/1000)):null; const age=seconds===null?'Zeit unbekannt':seconds<60?'seit gerade eben':seconds<3600?'seit '+Math.floor(seconds/60)+' Min.':seconds<86400?'seit '+Math.floor(seconds/3600)+' Std.':'seit '+Math.floor(seconds/86400)+' Tagen'; card.querySelector('.bubble-state').innerText=(raw==='on'?'Verbunden':raw==='off'?'Getrennt':'Unbekannt')+' · '+age; icon.setAttribute('icon',raw==='on'?'mdi:car-wireless':'mdi:car-wireless-off'); })()}` } : null,
        bubble("service_battery_voltage", "12 V", "mdi:car-battery", [], 6),
      ]) },
      { type: "grid", cards: present([
        separator(strings.consumptionUsage, "mdi:chart-line"),
        metric("trailing_consumption_500km") ? { type: "custom:bubble-card", card_type: "button", button_type: "state", entity: metric("trailing_consumption_500km"), name: strings.trailingConsumption, icon: "mdi:lightning-bolt-circle", force_icon: true, card_layout: "large", button_action: { tap_action: { action: "navigate", navigation_path: statisticsViewPath } }, grid_options: { columns: 6 } } : null,
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
        chargingCard,
        entity("battery_charging_limit_number") ? { type: "custom:bubble-card", card_type: "button", button_type: "slider", entity: entity("battery_charging_limit_number"), name: strings.chargeLimit, icon: "mdi:battery-charging-80", show_state: true, force_icon: true } : null,
        entity("battery_charging_limit_switch") ? { type: "custom:bubble-card", card_type: "button", button_type: "switch", entity: entity("battery_charging_limit_switch"), name: `${strings.chargeLimit} ${language(hass) === "de" ? "aktiv" : "enabled"}`, icon: "mdi:battery-lock", show_state: true, force_icon: true, grid_options: { columns: 6 } } : bubble("battery_charging_limit", strings.chargeLimit, "mdi:battery-lock", [], 6),
        bubble("battery_charging_start", strings.chargeStart, "mdi:clock-start", [], 6),
        entity("battery_charging") ? { type: "conditional", conditions: [{ condition: "state", entity: entity("battery_charging"), state: "on" }], card: { type: "custom:e-c3-dashboard-charge-curve-browser-card", title: language(hass) === "de" ? "Ladekurve" : "Charge curve", charging_entity: entity("battery_charging"), soc_entity: entity("battery"), power_entity: currentChargePower, mode_entity: entity("battery_charging_type"), capacity_entity: entity("battery_capacity"), server_entity: serverChargeEntity, include_active: true, hours_to_show: historyHours, fallback_capacity_kwh: 43.4 }, grid_options: { columns: "full" } } : null,
      ]) },
      { type: "grid", cards: present([
        separator(strings.position, "mdi:map-marker"),
        tracker ? { type: "custom:map-card", focus_entity: tracker, zoom: 17, theme_mode: "auto", entities: [{ entity: tracker, display: "marker", label: " ", picture: markerPicture, size: 90, color: "transparent", css: "--ha-marker-color: transparent; --ha-marker-background: transparent; --card-background-color: transparent; --ha-marker-border-radius: 0px; background: transparent !important; background-color: rgba(0,0,0,0) !important; background-image: none; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; filter: none !important; -webkit-filter: none !important;" }], map_options: { zoomControl: true }, grid_options: { columns: "full", rows: 5 } } : markdown(`**${strings.trackerUnavailable}**`),
      ]) },
      { type: "grid", cards: present([
        separator(strings.vehicleDetails, "mdi:car-info"),
        entity("mileage") ? { ...bubble("mileage", strings.mileage, "mdi:counter", [subState("engine", "", "mdi:car-electric")]), button_action: { tap_action: { action: "navigate", navigation_path: statisticsViewPath } }, styles: `.bubble-sub-button-1 { background-color:\${hass.states['${entity("engine")}']?.state === 'on' ? 'rgba(76,175,80,0.35)' : ''} !important; } .bubble-sub-button-1 > ha-icon { color:\${hass.states['${entity("engine")}']?.state === 'on' ? 'var(--success-color)' : ''} !important; }` } : null,
        entity("daylight") ? { ...bubble("daylight", language(hass) === "de" ? "Tageslicht erkannt" : "Daylight detected", "mdi:weather-sunny", [], 6), show_state: false, styles: ageTextStyles(language(hass) === "de" ? "Ja" : "Yes", language(hass) === "de" ? "Nein" : "No", "mdi:weather-sunny", "mdi:weather-sunny-off") } : null,
        entity("alarm") ? { ...bubble("alarm", strings.alarm, "mdi:shield-lock", [], 6), show_state: false, styles: ageTextStyles(language(hass) === "de" ? "Aktiv" : "Active", language(hass) === "de" ? "Inaktiv" : "Inactive", "mdi:shield-lock", "mdi:shield-off-outline") } : null,
        metric("vehicle_info") ? bubble("vehicle_info", language(hass) === "de" ? "Fahrzeuginformationen" : "Vehicle information", "mdi:car-info", [], "full", metric("vehicle_info")) : null,
        entity("privacy") ? { ...bubble("privacy", language(hass) === "de" ? "Datenschutz / Datenfreigabe" : "Privacy / data sharing", "mdi:shield-check", [subState("privacy_mode", "", "mdi:shield-account")]), show_state: false, styles: `\${(() => { const raw=hass.states[entity]?.state; card.querySelector('.bubble-state').innerText=raw==='on'?'${language(hass) === "de" ? "Uneingeschränkt" : "Unrestricted"}':raw==='off'?'${language(hass) === "de" ? "Eingeschränkt" : "Restricted"}':'—'; icon.setAttribute('icon',raw==='on'?'mdi:shield-check':raw==='off'?'mdi:shield-alert-outline':'mdi:shield-question'); })()}` } : null,
      ]) },
      { type: "grid", cards: present([
        separator(strings.batteryHealth, "mdi:battery-heart-variant"),
        entity("battery_health_capacity") ? { ...bubble("battery_health_capacity", strings.batteryHealthCapacity, "mdi:battery-heart", [], 6), button_action: { tap_action: { action: "navigate", navigation_path: statisticsViewPath } } } : null,
        entity("battery_health_resistance") ? { ...bubble("battery_health_resistance", strings.batteryHealthResistance, "mdi:resistor", [], 6), button_action: { tap_action: { action: "navigate", navigation_path: statisticsViewPath } } } : null,
        bubble("battery_capacity", strings.highVoltageBattery, "mdi:car-battery"),
      ]) },
      { type: "grid", cards: present([
        separator(strings.latestActivities, "mdi:history"),
        lastTripDisplayEntity ? bubble("last_trip", strings.lastTrip, "mdi:map-marker-distance", [], 6, lastTripDisplayEntity) : null,
        bubble("last_charge", strings.lastCharge, "mdi:ev-station", [], 6),
        modules.trips && lastTripDisplayEntity ? { type: "custom:e-c3-dashboard-trip-history-card", entity: lastTripDisplayEntity, server_entity: serverTripEntity, trip_entities: [nativeLastTrip].filter(Boolean), energy_entities: [lastTripResult].filter(Boolean), title: strings.tripHistory, language: language(hass), compact_filters: true, filter_days: 30, hide_short_trips: true, show_zero_events: false, hours_to_show: historyHours, max_trips: 50, grid_options: { columns: "full" } } : null,
        modules.charging && entity("battery_charging") && entity("battery") ? { type: "custom:e-c3-dashboard-charge-history-card", title: strings.chargeHistory, server_entity: serverChargeEntity, language: language(hass), charging_entity: entity("battery_charging"), soc_entity: entity("battery"), power_entity: currentChargePower, mode_entity: entity("battery_charging_type"), capacity_entity: entity("battery_capacity"), result_entity: metric("last_charge_result"), navigation_path: chargeViewPath, selection_storage_key: chargeSelectionKey, hours_to_show: historyHours, max_sessions: 50, fallback_capacity_kwh: 43.4, grid_options: { columns: "full" } } : null,
      ]) },
      { type: "grid", cards: present([
        separator(strings.settings, "mdi:cog-outline"),
        entity("refresh_interval") ? { type: "custom:bubble-card", card_type: "button", button_type: "slider", entity: entity("refresh_interval"), name: language(hass) === "de" ? "Aktualisierungsintervall" : "Refresh interval", icon: "mdi:update", show_state: true, force_icon: true, button_action: { tap_action: { action: "more-info" }, hold_action: { action: "more-info" } } } : null,
        entity("battery_values_correction") ? { type: "custom:bubble-card", card_type: "button", button_type: "switch", entity: entity("battery_values_correction"), name: language(hass) === "de" ? "Korrektur Batteriewerte" : "Correct battery values", icon: "mdi:auto-fix", show_state: true, force_icon: true } : null,
        entity("abrp_sync") ? separator("ABRP", "mdi:map-marker-path") : null,
        entity("abrp_sync") ? { type: "custom:bubble-card", card_type: "button", button_type: "switch", entity: entity("abrp_sync"), name: "ABRP Live-Daten", icon: "mdi:transit-connection-variant", show_state: true, force_icon: true } : null,
        entity("abrp_token") ? { type: "custom:bubble-card", card_type: "button", button_type: "state", entity: entity("abrp_token"), name: "ABRP Token", icon: "mdi:key", show_state: false, force_icon: true, button_action: { tap_action: { action: "more-info" } } } : null,
      ]) },
    ];

    const views = [{
      title: strings.vehicle,
      path: "vehicle",
      icon: "mdi:car-electric",
      type: "custom:horizontal-layout",
      layout: {
        width: 300,
        max_width: 480,
        max_cols: 2,
        margin: "0px 8px 0px 8px",
        padding: "4px 0px 4px 0px",
        card_margin: "4px 8px 8px",
      },
      cards: overviewSections.map((section) => layoutCard(section.cards)),
    }];

    if (entity("battery_health_capacity") || entity("battery_health_resistance") || entity("mileage") || metric("trailing_consumption_500km")) {
      const statisticsCards = [
        entity("battery_health_capacity") ? { type: "statistics-graph", title: strings.sohCapacityHistory, entities: [entity("battery_health_capacity")], days_to_show: LONG_TERM_STATISTICS_DAYS, period: "month", stat_types: ["mean", "min", "max"], chart_type: "line", grid_options: { columns: "full", rows: 5 } } : null,
        entity("battery_health_resistance") ? { type: "statistics-graph", title: strings.sohResistanceHistory, entities: [entity("battery_health_resistance")], days_to_show: LONG_TERM_STATISTICS_DAYS, period: "month", stat_types: ["mean", "min", "max"], chart_type: "line", grid_options: { columns: "full", rows: 5 } } : null,
        entity("mileage") ? { type: "statistics-graph", title: strings.mileageHistory, entities: [entity("mileage")], days_to_show: LONG_TERM_STATISTICS_DAYS, period: "month", stat_types: ["state"], chart_type: "line", grid_options: { columns: "full", rows: 5 } } : null,
        entity("mileage") ? { type: "statistics-graph", title: strings.drivenDistanceHistory, entities: [entity("mileage")], days_to_show: LONG_TERM_STATISTICS_DAYS, period: "month", stat_types: ["change"], chart_type: "bar", grid_options: { columns: "full", rows: 5 } } : null,
        metric("trailing_consumption_500km") ? { type: "statistics-graph", title: strings.consumptionHistory, entities: [metric("trailing_consumption_500km")], days_to_show: LONG_TERM_STATISTICS_DAYS, period: "month", stat_types: ["mean"], chart_type: "line", grid_options: { columns: "full", rows: 5 } } : null,
      ].filter(Boolean);

      views.push({ title: strings.longTermStatistics, path: "statistics", icon: "mdi:chart-timeline-variant", type: "sections", max_columns: 2, sections: [{ type: "grid", cards: [{ type: "heading", heading: strings.longTermStatistics, icon: "mdi:chart-timeline-variant", heading_style: "title" }, markdown(strings.longTermStatisticsIntro), ...statisticsCards] }] });
    }

    if (modules.trips && serverTripEntity) {
      views.push({
        title: strings.tripHistory,
        path: "trips",
        icon: "mdi:car-clock",
        type: "sections",
        max_columns: 2,
        sections: [{
          type: "grid",
          cards: [
            { type: "heading", heading: strings.tripHistory, icon: "mdi:car-clock", heading_style: "title" },
            markdown(language(hass) === "de" ? "Abgeschlossene Fahrten stammen aus der Stellantis-Serverhistorie und können älter als 90 Tage sein. Energie- und Verbrauchswerte sind SOC-basierte Näherungen; nicht belastbare Werte werden als **—** angezeigt. Beim Scrollen werden ältere Einträge nachgeladen." : "Completed trips come from Stellantis server history and can be older than 90 days. Energy and consumption are SOC-based estimates; unreliable values are shown as **—**. Older entries load as you scroll."),
            control("sync_server_history") ? controlButton("sync_server_history", language(hass) === "de" ? "Serverhistorie aktualisieren" : "Update server history", "mdi:database-sync") : null,
            { type: "custom:e-c3-dashboard-trip-history-card", entity: lastTripDisplayEntity, server_entity: serverTripEntity, trip_entities: [nativeLastTrip].filter(Boolean), energy_entities: [lastTripResult].filter(Boolean), title: strings.tripHistory, language: language(hass), hours_to_show: historyHours, expanded_window: true, initial_visible_trips: 100, max_trips: 0, grid_options: { columns: "full", rows: 10 } },
          ],
        }],
      });
    }

    if (modules.charging && entity("battery_charging") && entity("battery")) {
      views.push({
        title: strings.chargeCurves,
        path: "charging",
        icon: "mdi:chart-bell-curve-cumulative",
        type: "sections",
        max_columns: 2,
        sections: [
          {
            type: "grid",
            cards: [
              { type: "heading", heading: strings.historicalChargeCurves, icon: "mdi:chart-line" },
              markdown(strings.chargeCurvesIntro.replace("{days}", Math.round(historyHours / 24))),
              {
                type: "custom:e-c3-dashboard-charge-curve-browser-card",
                title: strings.selectChargeCurve,
                charging_entity: entity("battery_charging"),
                soc_entity: entity("battery"),
                power_entity: currentChargePower,
                mode_entity: entity("battery_charging_type"),
                capacity_entity: entity("battery_capacity"),
                result_entity: metric("last_charge_result"),
                server_entity: serverChargeEntity,
                navigation_path: chargeViewPath,
                selection_storage_key: chargeSelectionKey,
                hours_to_show: historyHours,
                fallback_capacity_kwh: 43.4,
                grid_options: { columns: "full", rows: 6 },
              },
            ],
          },
          {
            type: "grid",
            cards: [
              { type: "heading", heading: strings.interpretation, heading_style: "subtitle", icon: "mdi:information-outline" },
              markdown(strings.chargeCurvesNotes),
            ],
          },
        ],
      });
    }

    if (modules.gps && tracker) {
      const gpsPositionDetails = language(hass) === "de"
        ? `{% set tracker = '${tracker}' %}
{% set lat = state_attr(tracker, 'latitude') %}
{% set lon = state_attr(tracker, 'longitude') %}
{% set acc = state_attr(tracker, 'gps_accuracy') %}
{% set updated = states[tracker].last_updated %}
{% set age = (as_timestamp(now()) - as_timestamp(updated)) | int(0) %}
{% if age < 60 %}{% set age_text = 'gerade eben' %}{% elif age < 3600 %}{% set age_text = 'vor ' ~ ((age / 60) | int) ~ ' Min.' %}{% elif age < 86400 %}{% set age_text = 'vor ' ~ ((age / 3600) | int) ~ ' Std.' %}{% else %}{% set age_text = 'vor ' ~ ((age / 86400) | int) ~ ' Tg.' %}{% endif %}
### 📍 Koordinaten
{% if lat is not none and lon is not none %}
**Breitengrad:** {{ lat | round(6) }}  
**Längengrad:** {{ lon | round(6) }}
{% if acc is not none %}
**GPS-Genauigkeit:** ± {{ acc }} m  
{% endif %}
**Positionsupdate:** {{ age_text }}
{% else %}
Keine GPS-Koordinaten verfügbar.
{% endif %}`
        : `{% set tracker = '${tracker}' %}
{% set lat = state_attr(tracker, 'latitude') %}
{% set lon = state_attr(tracker, 'longitude') %}
{% set acc = state_attr(tracker, 'gps_accuracy') %}
{% set updated = states[tracker].last_updated %}
{% set age = (as_timestamp(now()) - as_timestamp(updated)) | int(0) %}
{% if age < 60 %}{% set age_text = 'just now' %}{% elif age < 3600 %}{% set age_text = ((age / 60) | int) ~ ' min ago' %}{% elif age < 86400 %}{% set age_text = ((age / 3600) | int) ~ ' hr ago' %}{% else %}{% set age_text = ((age / 86400) | int) ~ ' days ago' %}{% endif %}
### 📍 Coordinates
{% if lat is not none and lon is not none %}
**Latitude:** {{ lat | round(6) }}  
**Longitude:** {{ lon | round(6) }}
{% if acc is not none %}
**GPS accuracy:** ± {{ acc }} m  
{% endif %}
**Position update:** {{ age_text }}
{% else %}
No GPS coordinates available.
{% endif %}`;

      views.push({
        title: strings.gps,
        path: "gps",
        icon: "mdi:map-marker-path",
        type: "sections",
        max_columns: 2,
        sections: [
          {
            type: "grid",
            cards: [
              { type: "heading", heading: strings.gps, icon: "mdi:map-marker-path" },
              { type: "energy-date-selection" },
              markdown(strings.gpsIntro),
              {
                type: "entities",
                title: strings.currentVehiclePosition,
                show_header_toggle: false,
                entities: [{ entity: tracker, name: strings.vehicle }],
              },
              { type: "markdown", content: gpsPositionDetails, entity_id: [tracker] },
            ],
          },
          {
            type: "grid",
            cards: [
              { type: "heading", heading: strings.position, icon: "mdi:map-marker-path", heading_style: "title" },
              {
                type: "custom:map-card",
                grid_options: { columns: "full", rows: 8 },
                history_date_selection: true,
                focus_entity: tracker,
                zoom: 11,
                theme_mode: "auto",
                entities: [{
                  entity: tracker,
                  display: "marker",
                  label: " ",
                  picture: markerPicture,
                  size: 72,
                  color: "transparent",
                  css: "--ha-marker-color: transparent; --ha-marker-background: transparent; --card-background-color: transparent; --ha-marker-border-radius: 0px; background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; filter: none !important; -webkit-filter: none !important;",
                  history_line_color: "#03a9f4",
                  history_show_dots: true,
                  history_show_lines: true,
                  gradual_opacity: 0.45,
                  use_base_entity_only: true,
                  position_update_threshold: 0,
                }, ...(serverGpsEntity ? [{
                  entity: serverGpsEntity,
                  display: "state",
                  geojson: {
                    attribute: "geojson",
                    color: "#ff9800",
                    weight: 3,
                    opacity: 0.8,
                    hide_marker: true,
                  },
                  focus_on_fit: false,
                  tap_action: { action: "more-info" },
                }] : [])],
                map_options: { zoomControl: true },
              },
            ],
          },
        ],
      });
    }

    if (modules.wakeup && (control("manual_wakeup") || entity("wakeup"))) {
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
            controlButton("manual_wakeup", strings.manualWakeup, "mdi:car-key") || { type: "button", entity: entity("wakeup"), name: strings.manualWakeup, icon: "mdi:car-key", show_state: false, grid_options: { columns: "full" } },
            controlSwitch("wakeup_hourly", strings.hourlyWakeup, "mdi:car-clock"),
            controlSwitch("wakeup_probe", strings.availabilityProbe, "mdi:access-point-check"),
            controlSwitch("wakeup_charging", strings.chargeWakeup, "mdi:battery-sync-outline", "full"),
            bubble("remote_commands", strings.remote, "mdi:car-wireless"),
          ],
        }],
      });
    }

    if (modules.notifications) {
      const recipientControls = Object.entries(controls)
        .filter(([key]) => key.startsWith("recipient_"))
        .map(([key, entityId]) => ({ key, entityId }));
      views.push({
        title: strings.notifications,
        path: "notifications",
        icon: "mdi:bell-cog-outline",
        type: "sections",
        max_columns: 2,
        sections: [{
          type: "grid",
          cards: present([
            { type: "heading", heading: strings.notifications, icon: "mdi:bell-check-outline", heading_style: "title" },
            controlSwitch("notifications", strings.notifications, "mdi:bell-ring-outline", "full"),
            controlSwitch("alerts", strings.vehicleAlerts, "mdi:alert-outline"),
            controlSwitch("trip_reports", strings.tripReports, "mdi:car-info"),
            controlSwitch("charge_reports", strings.chargeReports, "mdi:ev-station"),
            { type: "heading", heading: strings.notificationRecipients, icon: "mdi:send-outline", heading_style: "subtitle" },
            recipientControls.length ? recipientControls.map(({ key, entityId }) => ({
              type: "custom:bubble-card", card_type: "button", button_type: "switch",
              entity: entityId, name: key.replace(/^recipient_/, "").replaceAll("_", " "),
              icon: "mdi:account-bell-outline", force_icon: true, show_state: true,
              card_layout: "large", grid_options: { columns: 6 },
            })) : markdown(strings.noRecipients),
            controlButton("test_notification", strings.testNotification, "mdi:message-alert-outline"),
          ].flat()),
        }],
      });
    }

    views.push({
      title: strings.help,
      path: "help",
      icon: "mdi:help-circle-outline",
      type: "sections",
      max_columns: 1,
      sections: [{
        type: "grid",
        cards: [
          { type: "heading", heading: strings.help, icon: "mdi:help-circle-outline", heading_style: "title" },
          markdown(strings.helpContent),
        ],
      }],
    });

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
