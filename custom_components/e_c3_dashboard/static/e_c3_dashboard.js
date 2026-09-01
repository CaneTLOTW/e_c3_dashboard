/* e-C3 Dashboard Community Dashboard strategy.
 *
 * This file deliberately generates only safe, mapped entity IDs from the
 * status entity created by the backend config entry. It never derives IDs from
 * VINs or friendly names.
 */
import { languageFor, textFor } from "./i18n.js?v=0.5.53";

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
    views: [{
      title,
      path: "setup",
      icon: "mdi:car-cog",
      type: "sections",
      max_columns: 1,
      sections: [{
        type: "grid",
        cards: [
          { type: "heading", heading: title, icon: "mdi:car-cog", heading_style: "title" },
          markdown(body),
        ],
      }],
    }],
  };
}

function getStatusEntities(hass, entryId) {
  return Object.entries(hass.states).filter(([entityId, state]) => {
    const attributes = state.attributes || {};
    return (
      entityId.startsWith("sensor.") &&
      attributes.integration_domain === STATUS_DOMAIN &&
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
  static get configRequired() {
    return true;
  }

  static getConfigElement() {
    return document.createElement("e-c3-dashboard-strategy-editor");
  }

  static getCreateSuggestions() {
    return { title: "e-C3 Dashboard", icon: "mdi:car-electric" };
  }

  static async generateDashboard({ hass, config }) {
    const strategyConfig = config?.strategy?.options ?? config?.strategy ?? config ?? {};
    return Ec3DashboardStrategy.generate(strategyConfig, hass);
  }

  static async generate(config, hass) {
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
      return setupDashboard(hass, strings.setup, `## ${strings.noVehicle}\n\n${strings.configure}`);
    }
    if (candidates.length > 1 && !config.entry_id) {
      return setupDashboard(hass, strings.setup, `## ${strings.multipleVehicles}\n\n${strings.configure}`);
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
          .replace("{installed}", compatibility.version || "—")}`,
      );
    }

    const missing = REQUIRED_ELEMENTS
      .filter(([element]) => !customElements.get(element))
      .map(([, name]) => name);
    if (missing.length) {
      return setupDashboard(
        hass,
        strings.dependencies,
        `## ${strings.dependencies}\n\n${strings.install}\n\n- ${missing.join("\n- ")}`,
      );
    }

    const tracker = attributes.vehicle_tracker;
    const modules = attributes.modules || {};
    const historyHours = Math.min(
      8760,
      Math.max(24, Number(attributes.history_window_hours ?? modules.history_hours) || 2160),
    );
    const dashboardBasePath = (() => {
      const pathname = window.location.pathname || "";
      const parts = pathname.split("/").filter(Boolean);
      return parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : "";
    })();
    const chargeViewPath = `${dashboardBasePath}/charging`;
    const statisticsViewPath = `${dashboardBasePath}/statistics`;
    const chargeSelectionKey = `e_c3_dashboard_charge_selection_${attributes.entry_id}`;
    const gpsDateStorageKey = `e_c3_dashboard:gps_date:${attributes.entry_id || "default"}`;
    const mapped = attributes.entity_mapping || {};
    const mappedEntityCount = Object.keys(mapped).length;
    const controls = attributes.control_entities || {};
    const metric = (key) => attributes.metric_entities?.[key] || getMetricEntity(hass, attributes.entry_id, key);
    const serverHistoryEntity = (key) => attributes.server_history_entities?.[key];
    const serverTripEntity = serverHistoryEntity("server_trip_history");
    const serverGpsEntity = serverHistoryEntity("server_gps_history");
    const serverChargeEntity = serverHistoryEntity("server_charge_history");
    const entity = (key) => mapped[key];
    const capabilities = attributes.capabilities || {};
    const powertrain = attributes.powertrain || "unknown";
    const supportsElectric = capabilities.electric_energy ?? Boolean(entity("battery"));
    const supportsFuel = capabilities.fuel ?? Boolean(entity("fuel"));
    const supportsCharging = capabilities.charging ?? Boolean(entity("battery_charging"));
    const supportsChargeHistory = capabilities.charge_history ?? (supportsCharging && Boolean(entity("battery")));
    const control = (key) => controls[key];
    const present = (cards) => cards.filter(Boolean);
    const literalText = (value) => JSON.stringify(String(value));
    const jinjaText = (value) => String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
    const jinjaAge = (template, expression) =>
      jinjaText(template).replace("{value}", `' ~ ${expression} ~ '`);

    const controlSwitch = (key, name, icon, columns = 6) => control(key) ? {
      type: "custom:bubble-card",
      card_type: "button",
      button_type: "switch",
      entity: control(key),
      name,
      icon,
      force_icon: true,
      show_state: true,
      card_layout: "large",
      grid_options: { columns },
    } : null;

    const controlButton = (key, name, icon, columns = "full") => control(key) ? {
      type: "button",
      entity: control(key),
      name,
      icon,
      show_state: false,
      grid_options: { columns },
    } : null;

    const currentChargePower = metric("current_charge_power") || entity("battery_charging_rate");
    const serviceBatteryEntity = entity("service_battery") || entity("service_battery_voltage");

    const bubble = (key, name, icon, subButton = [], columns = "full", entityOverride = null) => {
      const entityId = entityOverride || entity(key);
      return entityId ? {
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
      } : null;
    };

    const lastTripResult = metric("last_trip_result");
    const nativeLastTrip = entity("last_trip");
    const lastTripDisplayEntity = lastTripResult || nativeLastTrip;
    const lastChargeResult = metric("last_charge_result");
    const nativeLastCharge = entity("last_charge");
    const lastChargeDisplayEntity = lastChargeResult || nativeLastCharge;

    const relativeEventStyles = `\${(() => {
      const e = hass.states[entity];
      const a = e?.attributes || {};
      const raw = a.end_time ?? a.window_end ?? a.stoppedAt ?? a.charge_end_time ?? e?.state;
      const timestamp = Date.parse(raw || '');
      let text = '—';
      if (Number.isFinite(timestamp)) {
        const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
        const fill = (template, value) => template.replace('{value}', String(value));
        text = minutes < 1
          ? ${literalText(strings.justNow)}
          : minutes < 60
            ? fill(${literalText(strings.minutesAgo)}, minutes)
            : minutes < 1440
              ? fill(${literalText(strings.hoursAgo)}, Math.floor(minutes / 60))
              : fill(${literalText(strings.daysAgo)}, Math.floor(minutes / 1440));
      }
      const target = card.querySelector('.bubble-state');
      if (target) target.innerText = text;
    })()}`;

    const press = (key, name, icon) => {
      const entityId = entity(key);
      return entityId ? {
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
      } : null;
    };

    const subState = (key, name, icon) => {
      const entityId = entity(key);
      return entityId ? {
        entity: entityId,
        name,
        icon,
        show_state: true,
        show_name: false,
        show_background: true,
        tap_action: { action: "more-info" },
      } : null;
    };

    const separator = (name, icon) => ({
      type: "custom:bubble-card",
      card_type: "separator",
      name,
      icon,
      view_layout: { "grid-column": "1 / -1" },
    });

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

    const chargeSubStateFormatter = (index, entityId, kind = "text") => {
      if (!entityId) return "";
      const entityLiteral = JSON.stringify(entityId);
      const chargingEntityLiteral = JSON.stringify(entity("battery_charging"));
      const valueCode = kind === "power"
        ? `const chargingEntity = hass.states[${chargingEntityLiteral}];
        const charging = chargingEntity?.state === 'on';
        const value = stateEntity?.state;
        const numericValue = Number(value);
        const text = !charging ? '-' : invalid(value) || !Number.isFinite(numericValue) ? '0 kW' : numericValue.toFixed(1).replace('.', ',') + ' ' + (stateEntity.attributes?.unit_of_measurement || 'kW');`
        : kind === "time"
          ? `const value = stateEntity?.state;
        const raw = String(value ?? '').trim();
        const parsed = new Date(raw);
        const text = invalid(value) ? '-' : Number.isNaN(parsed.getTime()) ? (/^[0-9]{1,2}:[0-9]{2}$/.test(raw) ? raw.padStart(5, '0') : '-') : String(parsed.getHours()).padStart(2, '0') + ':' + String(parsed.getMinutes()).padStart(2, '0');`
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
      type: "custom:bubble-card",
      card_type: "button",
      button_type: "state",
      entity: entity("battery_charging"),
      name: strings.chargeStatus,
      icon: "mdi:ev-station",
      show_state: true,
      force_icon: true,
      card_layout: "large",
      grid_options: { columns: 12, rows: 1.5 },
      button_action: { tap_action: { action: "more-info" } },
      sub_button: [
        subState("battery_charging_type", "AC/DC", "mdi:current-ac"),
        subState("battery_charging_end", strings.chargeEndShort, "mdi:clock-end"),
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

    const vehiclePicture = tracker ? hass.states[tracker]?.attributes?.entity_picture : undefined;
    const markerPicture = vehiclePicture
      ? `${vehiclePicture}${vehiclePicture.includes("?") ? "&" : "?"}v=3`
      : undefined;

    const vehicleInfoEntity = metric("vehicle_info");
    const vehicleInfoPopupCard = vehicleInfoEntity ? {
      type: "custom:bubble-card",
      card_type: "pop-up",
      hash: "#e-c3-vehicle-info",
      name: strings.vehicleMaintenanceData,
      icon: "mdi:car-info",
      popup_mode: "adaptive-dialog",
      popup_style: "classic",
      styles: `.bubble-pop-up { z-index:100 !important; } .bubble-pop-up-container { z-index:101 !important; }`,
      cards: [
        {
          type: "entities",
          title: strings.maintenance,
          show_header_toggle: false,
          entities: [
            { type: "attribute", entity: vehicleInfoEntity, attribute: "maintenance_days_remaining", name: strings.daysRemaining },
            { type: "attribute", entity: vehicleInfoEntity, attribute: "maintenance_mileage_remaining_km", name: strings.mileageRemaining },
            { type: "attribute", entity: vehicleInfoEntity, attribute: "maintenance_updated_at", name: strings.updated, time_format: "relative" },
          ],
        },
        {
          type: "entities",
          title: strings.vehicle,
          show_header_toggle: false,
          entities: [
            { type: "attribute", entity: vehicleInfoEntity, attribute: "brand", name: strings.brand },
            { type: "attribute", entity: vehicleInfoEntity, attribute: "powertrain", name: strings.powertrain },
            { type: "attribute", entity: vehicleInfoEntity, attribute: "vin", name: "VIN" },
          ],
        },
      ],
    } : null;

    /*
     * LIVE and the reusable start-page card intentionally share one component.
     * The wrapper owns entity-picture lifecycle/rebuild handling, so entering
     * this view through normal Home Assistant navigation behaves exactly like
     * the already validated standalone overview card.
     */
    const hero = tracker && (entity("battery") || entity("fuel")) ? {
      type: "custom:e-c3-dashboard-vehicle-overview-card",
      entry_id: attributes.entry_id,
      variant: "live",
      grid_options: { columns: "full", rows: 4.5 },
    } : null;

    const overviewSections = [
      { type: "grid", cards: present([
        separator(strings.live, "mdi:car-connected"),
        hero,
        vehicleInfoPopupCard,
        entity("remote_commands") ? {
          ...bubble("remote_commands", strings.remote, "mdi:car-wireless", [press("wakeup", strings.manualWakeup, "mdi:car-connected")]),
          styles: `\${(() => { const e=hass.states[entity]; const raw=e?.state; const timestamp=Date.parse(e?.last_changed||''); const seconds=Number.isFinite(timestamp)?Math.max(0,Math.floor((Date.now()-timestamp)/1000)):null; const fill=(template,value)=>template.replace('{value}',String(value)); const age=seconds===null?${literalText(strings.ageUnknown)}:seconds<60?${literalText(strings.sinceJustNow)}:seconds<3600?fill(${literalText(strings.sinceMinutes)},Math.floor(seconds/60)):seconds<86400?fill(${literalText(strings.sinceHours)},Math.floor(seconds/3600)):fill(${literalText(strings.sinceDays)},Math.floor(seconds/86400)); const connection=raw==='on'?${literalText(strings.connected)}:raw==='off'?${literalText(strings.disconnected)}:${literalText(strings.unknown)}; card.querySelector('.bubble-state').innerText=connection+' · '+age; icon.setAttribute('icon',raw==='on'?'mdi:car-wireless':'mdi:car-wireless-off'); })()}`,
        } : null,
      ]) },
      { type: "grid", cards: present([
        separator(strings.consumptionUsage, "mdi:chart-line"),
        entity("mileage") ? { ...bubble("mileage", strings.mileage, "mdi:counter", [subState("engine", "", "mdi:car-electric")]), button_action: { tap_action: { action: "navigate", navigation_path: statisticsViewPath } }, styles: `.bubble-sub-button-1 { background-color:\${hass.states['${entity("engine")}']?.state === 'on' ? 'rgba(76,175,80,0.35)' : ''} !important; } .bubble-sub-button-1 > ha-icon { color:\${hass.states['${entity("engine")}']?.state === 'on' ? 'var(--success-color)' : ''} !important; }`, grid_options: { columns: "full" } } : null,
        supportsElectric && metric("trailing_consumption_500km") ? { type: "custom:bubble-card", card_type: "button", button_type: "state", entity: metric("trailing_consumption_500km"), name: strings.trailingConsumption, icon: "mdi:lightning-bolt-circle", force_icon: true, card_layout: "large", button_action: { tap_action: { action: "navigate", navigation_path: statisticsViewPath } }, grid_options: { columns: 6 } } : null,
        supportsChargeHistory && metric("distance_since_charge") ? { type: "custom:bubble-card", card_type: "button", button_type: "state", entity: metric("distance_since_charge"), name: strings.distanceSinceCharge, icon: "mdi:map-marker-distance", force_icon: true, card_layout: "large", grid_options: { columns: 6 } } : null,
        supportsElectric && metric("current_trip_energy") ? { type: "custom:bubble-card", card_type: "button", button_type: "state", entity: metric("current_trip_energy"), name: strings.currentTripEnergy, icon: "mdi:battery-minus", force_icon: true, card_layout: "large" } : null,
        supportsFuel ? bubble("fuel", strings.fuel, "mdi:gas-station", [], 6) : null,
        supportsFuel ? bubble("fuel_autonomy", strings.fuelRange, "mdi:map-marker-distance", [], 6) : null,
        supportsFuel ? bubble("fuel_consumption_instant", strings.fuelConsumption, "mdi:gas-station-outline") : null,
      ]) },
      { type: "grid", cards: present([
        separator(strings.quickActions, "mdi:lightning-bolt"),
        bubble("command_status", strings.commandStatus, "mdi:remote"),
        bubble("preconditioning", strings.climate, "mdi:air-conditioner", [press("preconditioning_start", strings.startClimate, "mdi:fan"), press("preconditioning_stop", strings.stopClimate, "mdi:fan-off")]),
      ]) },
      { type: "grid", cards: present([
        supportsCharging ? separator(strings.chargingRange, "mdi:battery-charging") : null,
        supportsCharging ? chargingCard : null,
        supportsCharging && entity("battery_charging_limit_number") ? { type: "custom:bubble-card", card_type: "button", button_type: "slider", entity: entity("battery_charging_limit_number"), name: strings.chargeLimit, icon: "mdi:battery-charging-80", show_state: true, force_icon: true } : null,
        supportsCharging && entity("battery_charging_limit_switch") ? { type: "custom:bubble-card", card_type: "button", button_type: "switch", entity: entity("battery_charging_limit_switch"), name: strings.chargeLimitEnabled, icon: "mdi:battery-lock", show_state: true, force_icon: true, grid_options: { columns: 6 } } : bubble("battery_charging_limit", strings.chargeLimit, "mdi:battery-lock", [], 6),
        supportsCharging ? bubble("battery_charging_start", strings.chargeStart, "mdi:clock-start", [], 6) : null,
        supportsCharging && entity("battery_charging") ? { type: "conditional", conditions: [{ condition: "state", entity: entity("battery_charging"), state: "on" }], card: { type: "custom:e-c3-dashboard-charge-curve-browser-card", title: strings.chargeCurve, charging_entity: entity("battery_charging"), soc_entity: entity("battery"), power_entity: currentChargePower, mode_entity: entity("battery_charging_type"), capacity_entity: entity("battery_capacity"), server_entity: serverChargeEntity, include_active: true, hours_to_show: historyHours, fallback_capacity_kwh: null }, grid_options: { columns: "full" } } : null,
      ]) },
      { type: "grid", cards: present([
        separator(strings.position, "mdi:map-marker"),
        tracker ? { type: "custom:map-card", focus_entity: tracker, zoom: 17, theme_mode: "auto", entities: [{ entity: tracker, display: "marker", label: " ", picture: markerPicture, size: 90, color: "transparent", css: "--ec3-transparent-picture-marker: 1; --ha-marker-color: transparent; --card-background-color: transparent; --ha-marker-border-radius: 0px; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; filter: none !important; -webkit-filter: none !important;" }], map_options: { zoomControl: true }, grid_options: { columns: "full", rows: 5 } } : markdown(`**${strings.trackerUnavailable}**`),
      ]) },
      { type: "grid", cards: present([
        supportsElectric ? separator(strings.batteryHealth, "mdi:battery-heart-variant") : serviceBatteryEntity ? separator(strings.serviceBattery, "mdi:car-battery") : null,
        supportsElectric && entity("battery_health_capacity") ? { ...bubble("battery_health_capacity", strings.batteryHealthCapacity, "mdi:battery-heart", [], 6), button_action: { tap_action: { action: "navigate", navigation_path: statisticsViewPath } } } : null,
        supportsElectric && entity("battery_health_resistance") ? { ...bubble("battery_health_resistance", strings.batteryHealthResistance, "mdi:resistor", [], 6), button_action: { tap_action: { action: "navigate", navigation_path: statisticsViewPath } } } : null,
        supportsElectric ? bubble("battery_capacity", strings.highVoltageBattery, "mdi:car-battery", [], 6) : null,
        serviceBatteryEntity ? bubble("service_battery", strings.serviceBattery, "mdi:car-battery", [], 6, serviceBatteryEntity) : null,
      ]) },
      { type: "grid", cards: present([
        separator(strings.latestActivities, "mdi:history"),
        lastTripDisplayEntity ? bubble("last_trip", strings.lastTrip, "mdi:map-marker-distance", [], 6, lastTripDisplayEntity) : null,
        supportsCharging && lastChargeDisplayEntity ? { ...bubble("last_charge", strings.lastCharge, "mdi:ev-station", [], 6, lastChargeDisplayEntity), styles: relativeEventStyles } : null,
        modules.trips && lastTripDisplayEntity ? { type: "custom:e-c3-dashboard-trip-history-card", entity: lastTripDisplayEntity, server_entity: serverTripEntity, trip_entities: [nativeLastTrip].filter(Boolean), energy_entities: supportsElectric ? [lastTripResult].filter(Boolean) : [], title: strings.tripHistory, language: language(hass), compact_filters: true, filter_days: 30, hide_short_trips: true, show_zero_events: false, hours_to_show: historyHours, max_trips: 50, grid_options: { columns: "full" } } : null,
        modules.charging && supportsChargeHistory ? { type: "custom:e-c3-dashboard-charge-history-card", title: strings.chargeHistory, server_entity: serverChargeEntity, language: language(hass), charging_entity: entity("battery_charging"), soc_entity: entity("battery"), power_entity: currentChargePower, mode_entity: entity("battery_charging_type"), capacity_entity: entity("battery_capacity"), result_entity: lastChargeResult, navigation_path: chargeViewPath, selection_storage_key: chargeSelectionKey, hours_to_show: historyHours, max_sessions: 50, fallback_capacity_kwh: null, grid_options: { columns: "full" } } : null,
      ]) },
    ].filter((section) => section.cards.length);

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
        supportsElectric && entity("battery_health_capacity") ? { type: "statistics-graph", title: strings.sohCapacityHistory, entities: [entity("battery_health_capacity")], days_to_show: LONG_TERM_STATISTICS_DAYS, period: "week", stat_types: ["mean", "min", "max"], chart_type: "line", hide_legend: true, grid_options: { columns: "full", rows: 5 } } : null,
        supportsElectric && entity("battery_health_resistance") ? { type: "statistics-graph", title: strings.sohResistanceHistory, entities: [entity("battery_health_resistance")], days_to_show: LONG_TERM_STATISTICS_DAYS, period: "week", stat_types: ["mean", "min", "max"], chart_type: "line", hide_legend: true, grid_options: { columns: "full", rows: 5 } } : null,
        entity("mileage") ? { type: "statistics-graph", title: strings.mileageHistory, entities: [entity("mileage")], days_to_show: LONG_TERM_STATISTICS_DAYS, period: "week", stat_types: ["state"], chart_type: "line", hide_legend: true, grid_options: { columns: "full", rows: 5 } } : null,
        entity("mileage") ? { type: "statistics-graph", title: strings.drivenDistanceHistory, entities: [entity("mileage")], days_to_show: LONG_TERM_STATISTICS_DAYS, period: "week", stat_types: ["change"], chart_type: "bar", hide_legend: true, grid_options: { columns: "full", rows: 5 } } : null,
        supportsElectric && metric("trailing_consumption_500km") ? { type: "statistics-graph", title: strings.consumptionHistory, entities: [metric("trailing_consumption_500km")], days_to_show: LONG_TERM_STATISTICS_DAYS, period: "week", stat_types: ["mean"], chart_type: "line", hide_legend: true, grid_options: { columns: "full", rows: 5 } } : null,
        supportsFuel && entity("fuel_consumption_instant") ? { type: "statistics-graph", title: strings.fuelConsumption, entities: [entity("fuel_consumption_instant")], days_to_show: LONG_TERM_STATISTICS_DAYS, period: "week", stat_types: ["mean"], chart_type: "line", hide_legend: true, grid_options: { columns: "full", rows: 5 } } : null,
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
            markdown(strings.tripHistoryIntro),
            control("sync_server_history") ? controlButton("sync_server_history", strings.syncServerHistory, "mdi:database-sync") : null,
            { type: "custom:e-c3-dashboard-trip-history-card", entity: lastTripDisplayEntity, server_entity: serverTripEntity, trip_entities: [nativeLastTrip].filter(Boolean), energy_entities: supportsElectric ? [lastTripResult].filter(Boolean) : [], title: strings.tripHistory, language: language(hass), hours_to_show: historyHours, expanded_window: true, initial_visible_trips: 100, max_trips: 0, grid_options: { columns: "full", rows: 10 } },
          ].filter(Boolean),
        }],
      });
    }

    if (modules.charging && supportsChargeHistory) {
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
                result_entity: lastChargeResult,
                server_entity: serverChargeEntity,
                navigation_path: chargeViewPath,
                selection_storage_key: chargeSelectionKey,
                hours_to_show: historyHours,
                fallback_capacity_kwh: null,
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
      const gpsPositionDetails = `{% set tracker = '${tracker}' %}\n{% set lat = state_attr(tracker, 'latitude') %}\n{% set lon = state_attr(tracker, 'longitude') %}\n{% set updated = states[tracker].last_updated %}\n{% set age = (as_timestamp(now()) - as_timestamp(updated)) | int(0) %}\n{% if age < 60 %}{% set age_text = '${jinjaText(strings.justNow)}' %}{% elif age < 3600 %}{% set age_text = '${jinjaAge(strings.minutesAgo, "((age / 60) | int)")}' %}{% elif age < 86400 %}{% set age_text = '${jinjaAge(strings.hoursAgo, "((age / 3600) | int)")}' %}{% else %}{% set age_text = '${jinjaAge(strings.daysAgo, "((age / 86400) | int)")}' %}{% endif %}\n### 📍 ${strings.coordinates}\n{% if lat is not none and lon is not none %}\n**${strings.latitude}:** {{ lat | round(6) }}  \n**${strings.longitude}:** {{ lon | round(6) }}\n**${strings.positionUpdate}:** {{ age_text }}\n{% else %}\n${strings.noGpsCoordinates}\n{% endif %}`;

      const gpsBaseMap = {
        type: "custom:map-card",
        focus_entity: tracker,
        zoom: 11,
        theme_mode: "auto",
        entities: [
          {
            entity: tracker,
            display: "marker",
            label: " ",
            picture: markerPicture,
            size: 72,
            color: "transparent",
            css: "--ec3-transparent-picture-marker: 1; --ha-marker-color: transparent; --card-background-color: transparent; --ha-marker-border-radius: 0px; border: none !important; box-shadow: none !important; filter: none !important; -webkit-filter: none !important;",
            history_line_color: "#03a9f4",
            history_show_dots: true,
            history_show_lines: true,
            gradual_opacity: 0.45,
            use_base_entity_only: true,
            position_update_threshold: 0,
          },
          ...(serverGpsEntity ? [{
            entity: serverGpsEntity,
            display: "state",
            geojson: { attribute: "geojson", color: "#ff9800", weight: 3, opacity: 0.8, hide_marker: true },
            focus_on_fit: false,
            tap_action: { action: "more-info" },
          }] : []),
        ],
        map_options: { zoomControl: true },
      };

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
              { type: "custom:e-c3-dashboard-gps-date-card", storage_key: gpsDateStorageKey },
              markdown(strings.gpsIntro),
              { type: "entities", title: strings.currentVehiclePosition, show_header_toggle: false, entities: [{ entity: tracker, name: strings.vehicle }] },
              { type: "markdown", content: gpsPositionDetails, entity_id: [tracker] },
            ],
          },
          {
            type: "grid",
            cards: [
              { type: "heading", heading: strings.position, icon: "mdi:map-marker-path", heading_style: "title" },
              {
                type: "custom:e-c3-dashboard-gps-map-card",
                storage_key: gpsDateStorageKey,
                server_entity: serverGpsEntity,
                tracker_entity: tracker,
                base_config: gpsBaseMap,
                grid_options: { columns: "full", rows: 8 },
              },
            ],
          },
        ],
      });
    }

    if (modules.wakeup && (control("manual_wakeup") || entity("wakeup"))) {
      const wakeupStatusEntity = entity("command_status") || control("manual_wakeup");
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
            control("manual_wakeup") ? {
              type: "custom:bubble-card",
              card_type: "button",
              button_type: "state",
              entity: wakeupStatusEntity,
              name: strings.manualWakeup,
              icon: "mdi:car-key",
              show_state: Boolean(entity("command_status")),
              force_icon: true,
              card_layout: "large",
              button_action: {
                tap_action: {
                  action: "perform-action",
                  perform_action: "button.press",
                  target: { entity_id: control("manual_wakeup") },
                },
              },
              grid_options: { columns: "full" },
            } : { type: "button", entity: entity("wakeup"), name: strings.manualWakeup, icon: "mdi:car-key", show_state: false, grid_options: { columns: "full" } },
            controlSwitch("wakeup_hourly", strings.hourlyWakeup, "mdi:car-clock", "full"),
            controlSwitch("wakeup_probe", strings.availabilityProbe, "mdi:access-point-check", "full"),
            supportsCharging ? controlSwitch("wakeup_charging", strings.chargeWakeup, "mdi:battery-sync-outline", "full") : null,
            bubble("remote_commands", strings.remote, "mdi:car-wireless"),
          ].filter(Boolean),
        }],
      });
    }

    if (modules.notifications) {
      const recipientControls = Object.entries(controls)
        .filter(([key]) => key.startsWith("recipient_"))
        .map(([key, entityId]) => ({ key, entityId }));
      const notificationSetting = (key) => control(`notification_setting_${key}`);
      const notificationSettingsCard = (title, entries) => {
        const entities = entries
          .map(([key, name, icon]) => {
            const entityId = notificationSetting(key);
            return entityId ? { entity: entityId, name, icon } : null;
          })
          .filter(Boolean);
        return entities.length ? {
          type: "entities",
          title,
          entities,
          show_header_toggle: false,
          grid_options: { columns: "full" },
        } : null;
      };
      const warningThresholds = notificationSettingsCard(strings.notificationWarningThresholds, [
        supportsElectric ? ["range_warning_km", strings.rangeWarning, "mdi:map-marker-distance"] : null,
        supportsElectric ? ["range_reset_km", strings.rangeReset, "mdi:map-marker-check"] : null,
        supportsElectric ? ["home_soc_warning", strings.homeSocWarning, "mdi:battery-alert"] : null,
        supportsElectric ? ["home_soc_reset", strings.homeSocReset, "mdi:battery-check"] : null,
        ["service_battery_warning", strings.battery12Warning, "mdi:car-battery"],
        ["service_battery_reset", strings.battery12Reset, "mdi:car-battery"],
      ].filter(Boolean));
      const timingAvailability = notificationSettingsCard(strings.notificationTimingAvailability, [
        supportsElectric ? ["home_delay_minutes", strings.homeWarningDelay, "mdi:timer-outline"] : null,
        ["stale_home_hours", strings.staleAtHome, "mdi:home-clock-outline"],
        ["stale_away_hours", strings.staleAway, "mdi:car-clock"],
        ["probe_wait_minutes", strings.probeWait, "mdi:timer-sand"],
        supportsCharging ? ["charge_start_delay_minutes", strings.chargeStartDelay, "mdi:timer-play-outline"] : null,
      ].filter(Boolean));
      const quietHours = notificationSettingsCard(strings.notificationQuietHours, [
        ["quiet_start", strings.quietStart, "mdi:weather-night"],
        ["quiet_end", strings.quietEnd, "mdi:weather-sunny"],
      ]);
      const notificationDiagnostics = `### ${strings.notificationDiagnostics}

{% set d = state_attr('${statusEntity}', 'notification_diagnostics') or {} %}
{% set last = d.get('last_notification') or {} %}
{% set heartbeat_source = d.get('heartbeat_source') %}
**${strings.lastNotificationType}:** {{ last.get('type') or '—' }}<br>
**${strings.lastNotificationTime}:** {{ last.get('time') or '—' }}<br>
**${strings.lastNotificationMessage}:** {{ last.get('message') or '—' }}

**${strings.heartbeatSource}:** {{ '${strings.heartbeatSourceUpstream}' if heartbeat_source == 'source_attribute' else '${strings.heartbeatSourceHa}' if heartbeat_source == 'ha_last_updated' else heartbeat_source or '—' }}<br>
**${strings.heartbeatTime}:** {{ d.get('heartbeat') or '—' }}<br>
**${strings.outageStatus}:** {{ '${strings.outageActive}' if d.get('outage_since') else '—' }}<br>
**${strings.outageSince}:** {{ d.get('outage_since') or '—' }}<br>
**${strings.probeStatus}:** {{ '${strings.probePending}' if d.get('probe_at') else '—' }}<br>
**${strings.probeTime}:** {{ d.get('probe_at') or '—' }}`;
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
            controlSwitch("alerts", strings.vehicleAlerts, "mdi:alert-outline", "full"),
            controlSwitch("trip_reports", strings.tripReports, "mdi:car-info", "full"),
            supportsCharging ? controlSwitch("charge_reports", strings.chargeReports, "mdi:ev-station", "full") : null,
            { type: "heading", heading: strings.notificationRecipients, icon: "mdi:send-outline", heading_style: "subtitle" },
            { ...markdown(strings.recipientsHint), grid_options: { columns: "full" } },
            recipientControls.length ? recipientControls.map(({ key, entityId }) => ({ type: "custom:bubble-card", card_type: "button", button_type: "switch", entity: entityId, name: key.replace(/^recipient_/, "").replace(/^notify_/, "").replace(/^mobile_app_/, "").replaceAll("_", " "), icon: "mdi:account-bell-outline", force_icon: true, show_state: true, card_layout: "large", grid_options: { columns: "full" } })) : markdown(strings.noRecipients),
            { type: "button", name: strings.manageRecipients, icon: "mdi:account-multiple-plus-outline", show_state: false, tap_action: { action: "navigate", navigation_path: `/config/integrations/integration/${STATUS_DOMAIN}` }, grid_options: { columns: "full" } },
            controlButton("test_notification", strings.testNotification, "mdi:message-alert-outline"),
            { type: "heading", heading: strings.notificationSettings, icon: "mdi:tune-variant", heading_style: "subtitle" },
            warningThresholds || markdown(strings.notificationSettingsUnavailable),
            timingAvailability,
            quietHours,
            { type: "markdown", content: notificationDiagnostics, entity_id: [statusEntity], grid_options: { columns: "full" } },
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
      sections: [{ type: "grid", cards: [{ type: "heading", heading: strings.help, icon: "mdi:help-circle-outline", heading_style: "title" }, markdown(strings.helpContent)] }],
    });

    views.push({
      title: strings.system,
      path: "system",
      icon: "mdi:car-cog",
      type: "sections",
      max_columns: 2,
      sections: [{ type: "grid", cards: present([
        { type: "heading", heading: strings.system, icon: "mdi:car-cog", heading_style: "title" },
        bubble(null, strings.status, "mdi:car-cog", [], "full", statusEntity),
        { type: "custom:bubble-card", card_type: "button", button_type: "state", entity: statusEntity, name: strings.mappedEntities, icon: "mdi:transit-connection-variant", show_state: true, force_icon: true, card_layout: "large", grid_options: { columns: "full" }, styles: `\${(() => { const target=card.querySelector('.bubble-state'); if (target) target.innerText='${mappedEntityCount}'; })()}` },
        entity("privacy") ? separator(strings.privacySharing, "mdi:shield-account") : null,
        entity("privacy") ? { ...bubble("privacy", strings.privacyDataSharing, "mdi:shield-check", [subState("privacy_mode", "", "mdi:shield-account")]), show_state: false, styles: `\${(() => { const raw=hass.states[entity]?.state; card.querySelector('.bubble-state').innerText=raw==='on'?${literalText(strings.unrestricted)}:raw==='off'?${literalText(strings.restricted)}:'—'; icon.setAttribute('icon',raw==='on'?'mdi:shield-check':raw==='off'?'mdi:shield-alert-outline':'mdi:shield-question'); })()}` } : null,
        separator(strings.settings, "mdi:cog-outline"),
        entity("refresh_interval") ? { type: "custom:bubble-card", card_type: "button", button_type: "slider", entity: entity("refresh_interval"), name: strings.refreshInterval, icon: "mdi:update", show_state: true, force_icon: true, button_action: { tap_action: { action: "more-info" }, hold_action: { action: "more-info" } } } : null,
        supportsElectric && entity("battery_values_correction") ? { type: "custom:bubble-card", card_type: "button", button_type: "switch", entity: entity("battery_values_correction"), name: strings.correctBatteryValues, icon: "mdi:auto-fix", show_state: true, force_icon: true } : null,
        entity("abrp_sync") ? separator("ABRP", "mdi:map-marker-path") : null,
        entity("abrp_sync") ? { type: "custom:bubble-card", card_type: "button", button_type: "switch", entity: entity("abrp_sync"), name: strings.abrpLiveData, icon: "mdi:transit-connection-variant", show_state: true, force_icon: true } : null,
        entity("abrp_token") ? { type: "custom:bubble-card", card_type: "button", button_type: "state", entity: entity("abrp_token"), name: "ABRP Token", icon: "mdi:key", show_state: false, force_icon: true, button_action: { tap_action: { action: "more-info" } } } : null,
      ]) }],
    });

    // Home Assistant renders this array left-to-right. Keep Vehicle on the
    // left and Help on the far right, matching the requested right-to-left
    // reading order: Help → System → Notifications → … → Vehicle.
    const viewOrder = ["vehicle", "charging", "statistics", "trips", "gps", "wakeup", "notifications", "system", "help"];
    views.sort((left, right) => viewOrder.indexOf(left.path) - viewOrder.indexOf(right.path));
    return { title: strings.name, icon: "mdi:car-electric", views };
  }
}

class Ec3DashboardStrategyEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
    queueMicrotask(() => this.configChanged(this._config));
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    if (!this.isConnected && !this._hass) return;
    const context = this._hass || { locale: { language: typeof navigator !== "undefined" ? navigator.language : "en" } };
    const strings = t(context);
    this.innerHTML = `
      <div style="padding: 8px 0; line-height: 1.5;">
        <strong>${strings.name}</strong><br>
        ${strings.strategyEditorDescription}
      </div>`;
  }

  configChanged(config) {
    this.dispatchEvent(new CustomEvent("config-changed", {
      bubbles: true,
      composed: true,
      detail: { config },
    }));
  }
}

if (!customElements.get("ll-strategy-dashboard-e-c3-dashboard")) {
  customElements.define("ll-strategy-dashboard-e-c3-dashboard", Ec3DashboardStrategy);
}
if (!customElements.get("e-c3-dashboard-strategy-editor")) {
  customElements.define("e-c3-dashboard-strategy-editor", Ec3DashboardStrategyEditor);
}

const strategyRegistrationStrings = t({
  locale: { language: typeof navigator !== "undefined" ? navigator.language : "en" },
});
window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some((strategy) => strategy.type === STRATEGY_TYPE)) {
  window.customStrategies.push({
    type: STRATEGY_TYPE,
    strategyType: "dashboard",
    name: strategyRegistrationStrings.name,
    description: strategyRegistrationStrings.description,
  });
}
