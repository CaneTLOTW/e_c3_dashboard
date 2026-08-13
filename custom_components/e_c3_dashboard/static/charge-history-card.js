import { LitElement, html, css, nothing } from "https://unpkg.com/lit?module";
import { buildChargeCurve, buildChargeSessions } from "./charge-history-core.js?v=0.4.7";
import { localeFor, textFor } from "./i18n.js?v=0.4.7";

class CodexStellantisChargeHistoryCardV1 extends LitElement {
    static properties = {
        _hass: { state: true },
        _config: { state: true },
        _sessions: { state: true },
        _loading: { state: true },
        _error: { state: true },
    };

    static styles = css`
        .table-wrap {
            max-height: min(360px, 48vh);
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-y: contain;
            touch-action: pan-y;
            scrollbar-width: thin;
            scrollbar-color: var(--divider-color) transparent;
        }
        .table-wrap::-webkit-scrollbar { width: 8px; }
        .table-wrap::-webkit-scrollbar-thumb { background: var(--divider-color); border-radius: 999px; }
        .table-wrap::-webkit-scrollbar-track { background: transparent; }
        .charge-table { width: 100%; border-collapse: collapse; font-size: var(--ha-font-size-s); }
        .charge-table th { position: sticky; top: 0; z-index: 1; color: var(--secondary-text-color); background: var(--card-background-color); font-weight: 500; text-align: left; padding: 0 10px 8px 0; white-space: nowrap; }
        .charge-table td { border-top: 1px solid var(--divider-color); padding: 9px 10px 9px 0; white-space: nowrap; }
        .charge-table th:last-child, .charge-table td:last-child { padding-right: 0; }
        .muted { color: var(--secondary-text-color); }
        .error { color: var(--error-color); }
        .hint { display: block; margin-top: 10px; color: var(--secondary-text-color); font-size: var(--ha-font-size-xs); }
        .type { font-weight: 600; }
    `;

    setConfig(config) {
        if (!config.charging_entity || !config.soc_entity) {
            throw new Error("charging_entity and soc_entity must be specified");
        }
        this._config = {
            language: "auto",
            hours_to_show: 2160,
            max_sessions: 50,
            fallback_capacity_kwh: 43.4,
            ...config,
        };
        if (this._hass) {
            this._lastUpdated = undefined;
            this._loadHistory();
        }
    }

    set hass(hass) {
        this._hass = hass;
        const entities = this._entityIds();
        const updateKey = entities.map((entityId) => hass.states[entityId]?.last_updated ?? "").join("|");
        if (this._config && updateKey && (this._sessions === undefined || updateKey !== this._lastUpdated)) {
            this._lastUpdated = updateKey;
            this._loadHistory();
        }
    }

    _entityIds() {
        if (!this._config) return [];
        return [
            this._config.charging_entity,
            this._config.soc_entity,
            this._config.power_entity,
            this._config.mode_entity,
            this._config.capacity_entity,
            this._config.result_entity,
        ].filter(Boolean);
    }

    _statesFor(response, entityIds, entityId) {
        if (!entityId) return [];
        if (Array.isArray(response)) {
            if (!Array.isArray(response[0])) return response;
            return response[entityIds.indexOf(entityId)] ?? [];
        }
        return response?.[entityId] ?? [];
    }

    _normalizeState(raw) {
        return {
            state: raw.state ?? raw.s,
            attributes: raw.attributes ?? raw.a ?? {},
            last_updated: raw.last_updated ?? raw.last_changed ??
                (Number.isFinite(raw.lu) ? new Date(raw.lu * 1000).toISOString() : undefined),
        };
    }

    _localResultSessions(response, entityIds) {
        const numericOrNull = (value) => {
            if (value === null || value === undefined || value === "") return null;
            const number = Number(value);
            return Number.isFinite(number) ? number : null;
        };
        return this._statesFor(response, entityIds, this._config.result_entity)
            .map((raw) => this._normalizeState(raw).attributes)
            .filter((attrs) => attrs.start_time && attrs.end_time && attrs.duration_seconds)
            .map((attrs) => ({
                start: attrs.start_time,
                end: attrs.end_time,
                duration_seconds: numericOrNull(attrs.duration_seconds),
                soc_start: numericOrNull(attrs.soc_start),
                soc_end: numericOrNull(attrs.soc_end),
                capacity_kwh: numericOrNull(attrs.capacity_kwh),
                energy_kwh: numericOrNull(attrs.energy_kwh),
                average_power_kw: numericOrNull(attrs.average_power_kw),
                maximum_power_kw: numericOrNull(attrs.maximum_power_kw),
                charge_type: attrs.charge_type || "—",
                estimated: attrs.estimated !== false,
            }))
            .filter((session) => Number.isFinite(Date.parse(session.start)) && Number.isFinite(Date.parse(session.end)));
    }

    _mergeSessions(rawSessions, localSessions) {
        const remaining = [...rawSessions];
        for (const local of localSessions) {
            const index = remaining.findIndex((raw) =>
                Math.abs(Date.parse(raw.start) - Date.parse(local.start)) <= 5 * 60 * 1000
            );
            if (index >= 0) remaining.splice(index, 1);
            remaining.push(local);
        }
        return remaining.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
    }

    async _loadHistory() {
        if (!this._hass || !this._config || this._loading) return;
        this._loading = true;
        this._error = null;
        try {
            const entityIds = this._entityIds();
            const response = await this._hass.callWS({
                type: "history/history_during_period",
                start_time: new Date(Date.now() - Number(this._config.hours_to_show) * 3600000).toISOString(),
                end_time: new Date().toISOString(),
                entity_ids: entityIds,
                minimal_response: false,
                no_attributes: false,
                significant_changes_only: false,
            });
            const sessions = buildChargeSessions({
                chargingStates: this._statesFor(response, entityIds, this._config.charging_entity),
                socStates: this._statesFor(response, entityIds, this._config.soc_entity),
                powerStates: this._statesFor(response, entityIds, this._config.power_entity),
                modeStates: this._statesFor(response, entityIds, this._config.mode_entity),
                capacityStates: this._statesFor(response, entityIds, this._config.capacity_entity),
                fallbackCapacity: Number(this._config.fallback_capacity_kwh),
            });
            const localSessions = this._localResultSessions(response, entityIds);
            this._sessions = this._mergeSessions(sessions, localSessions)
                .slice(0, Number(this._config.max_sessions));
        } catch (error) {
            this._sessions = [];
            this._error = error?.message ?? String(error);
        } finally {
            this._loading = false;
        }
    }

    _formatDate(value) {
        return new Date(value).toLocaleString(this._locale(), { dateStyle: "short", timeStyle: "short" });
    }

    _formatDuration(seconds) {
        if (!Number.isFinite(seconds)) return "—";
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}:${String(minutes).padStart(2, "0")} h`;
    }

    _number(value, digits = 2) {
        if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
        return Number(value).toLocaleString(this._locale(), {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        });
    }

    _locale() {
        return localeFor(this._config);
    }

    _text() {
        return textFor(this._config, "chargeHistory");
    }

    render() {
        if (!this._config) return nothing;
        const text = this._text();
        const sessions = this._sessions ?? [];
        return html`
            <ha-card .header=${this._config.title || text.title}>
                <div class="card-content">
                    ${this._loading && sessions.length === 0 ? html`<span class="muted">${text.loading}</span>` : nothing}
                    ${this._error ? html`<span class="error">${text.error} ${this._error}</span>` : nothing}
                    ${!this._loading && !this._error && sessions.length === 0
                        ? html`<span class="muted">${text.empty}</span>`
                        : nothing}
                    ${sessions.length ? html`
                        <div class="table-wrap">
                            <table class="charge-table">
                                <thead><tr><th>${text.start}</th><th>${text.duration}</th><th>${text.energy}</th><th>${text.average}</th><th>${text.maximum}</th><th>${text.type}</th></tr></thead>
                                <tbody>${sessions.map((session) => html`<tr>
                                    <td>${this._formatDate(session.start)}</td>
                                    <td>${this._formatDuration(session.duration_seconds)}</td>
                                    <td>${this._number(session.energy_kwh)}</td>
                                    <td>${this._number(session.average_power_kw)}</td>
                                    <td>${this._number(session.maximum_power_kw)}</td>
                                    <td class="type">${session.charge_type}</td>
                                </tr>`)}</tbody>
                            </table>
                        </div>
                        <span class="hint">${text.hint}</span>
                    ` : nothing}
                </div>
            </ha-card>
        `;
    }
}

customElements.define("e-c3-dashboard-charge-history-card", CodexStellantisChargeHistoryCardV1);
window.customCards = window.customCards ?? [];
window.customCards.push({
    type: "e-c3-dashboard-charge-history-card",
    name: "e-C3 Dashboard Charge History",
    preview: true,
});

class CodexStellantisChargeCurveCardV1 extends LitElement {
    static properties = {
        _hass: { state: true },
        _config: { state: true },
        _curve: { state: true },
        _loading: { state: true },
        _error: { state: true },
    };

    static styles = css`
        .header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        .title { font-size: var(--ha-font-size-l); font-weight: 500; }
        .status { color: var(--secondary-text-color); font-size: var(--ha-font-size-s); white-space: nowrap; }
        .status.live { color: var(--success-color); }
        .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 14px 0 4px; }
        .metric { min-width: 0; padding: 8px; border-radius: 10px; background: var(--secondary-background-color); }
        .metric-label { color: var(--secondary-text-color); font-size: var(--ha-font-size-xs); }
        .metric-value { margin-top: 3px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chart { width: 100%; height: 235px; overflow: visible; margin-top: 8px; }
        .grid { stroke: var(--divider-color); stroke-width: 1; }
        .axis { fill: var(--secondary-text-color); font-size: 11px; }
        .curve { fill: none; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
        .point { stroke: var(--card-background-color); stroke-width: 1.5; }
        .muted { color: var(--secondary-text-color); }
        .error { color: var(--error-color); }
        .hint { display: block; margin-top: 8px; color: var(--secondary-text-color); font-size: var(--ha-font-size-xs); }
        @media (max-width: 500px) { .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    `;

    setConfig(config) {
        const required = ["visible_entity", "active_entity", "start_entity", "result_entity", "soc_entity"];
        for (const key of required) {
            if (!config[key]) throw new Error(`${key} must be specified`);
        }
        this._config = {
            fallback_capacity_kwh: 43.4,
            ...config,
        };
        if (this._hass) {
            this._lastUpdated = undefined;
            this._loadCurve();
        }
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._config) return;
        const updateKey = this._entityIds()
            .map((entityId) => hass.states[entityId]?.last_updated ?? "")
            .join("|");
        if (updateKey !== this._lastUpdated) {
            this._lastUpdated = updateKey;
            this._loadCurve();
        }
    }

    _entityIds() {
        return [
            this._config?.visible_entity,
            this._config?.active_entity,
            this._config?.start_entity,
            this._config?.result_entity,
            this._config?.soc_entity,
            this._config?.mode_entity,
            this._config?.capacity_entity,
        ].filter(Boolean);
    }

    _timestamp(value) {
        const result = Date.parse(value);
        return Number.isFinite(result) ? result : null;
    }

    _session() {
        const active = this._hass.states[this._config.active_entity]?.state === "on";
        const visible = this._hass.states[this._config.visible_entity]?.state === "on";
        const result = this._hass.states[this._config.result_entity];
        const startValue = active
            ? this._hass.states[this._config.start_entity]?.state
            : result?.attributes?.start_time;
        const endValue = active ? new Date().toISOString() : result?.attributes?.end_time;
        const start = this._timestamp(startValue);
        const end = this._timestamp(endValue);
        if (!visible || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

        const resultCapacity = Number(result?.attributes?.capacity_kwh);
        const measuredCapacity = Number(this._hass.states[this._config.capacity_entity]?.state);
        const capacity = Number.isFinite(resultCapacity) && resultCapacity > 0 && !active
            ? resultCapacity
            : Number.isFinite(measuredCapacity) && measuredCapacity > 0
                ? measuredCapacity
                : Number(this._config.fallback_capacity_kwh);
        const type = active
            ? this._hass.states[this._config.mode_entity]?.state
            : result?.attributes?.charge_type;
        return { active, start, end, capacity, type };
    }

    _statesFor(response, entityIds, entityId) {
        if (!entityId) return [];
        if (Array.isArray(response)) {
            if (!Array.isArray(response[0])) return response;
            return response[entityIds.indexOf(entityId)] ?? [];
        }
        return response?.[entityId] ?? [];
    }

    async _loadCurve() {
        if (!this._hass || !this._config || this._loading) return;
        this._loading = true;
        this._error = null;
        try {
            const session = this._session();
            if (!session) {
                this._curve = null;
                return;
            }
            const entityIds = [this._config.soc_entity, this._config.mode_entity].filter(Boolean);
            const response = await this._hass.callWS({
                type: "history/history_during_period",
                start_time: new Date(session.start - 5 * 60000).toISOString(),
                end_time: new Date(session.end + 1000).toISOString(),
                entity_ids: entityIds,
                minimal_response: false,
                no_attributes: true,
                significant_changes_only: false,
            });
            const curve = buildChargeCurve({
                socStates: this._statesFor(response, entityIds, this._config.soc_entity),
                modeStates: this._statesFor(response, entityIds, this._config.mode_entity),
                start: session.start,
                end: session.end,
                capacityKwh: session.capacity,
            });
            this._curve = { ...curve, ...session };
        } catch (error) {
            this._curve = null;
            this._error = error?.message ?? String(error);
        } finally {
            this._loading = false;
        }
    }

    _number(value, digits = 1) {
        return Number.isFinite(Number(value))
            ? Number(value).toLocaleString(localeFor(this._config), { minimumFractionDigits: digits, maximumFractionDigits: digits })
            : "—";
    }

    _duration(seconds) {
        const total = Math.max(0, Math.round(seconds));
        return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")} h`;
    }

    _type(value) {
        const normalized = String(value ?? "").trim().toUpperCase();
        if (["AC", "SLOW", "NORMAL", "STANDARD"].includes(normalized)) return "AC";
        if (["DC", "FAST", "QUICK", "RAPID"].includes(normalized)) return "DC";
        return "—";
    }

    _chart(points, type) {
        const text = textFor(this._config, "chargeHistory");
        if (points.length < 2) return html`<p class="muted">${text.notEnoughPoints}</p>`;
        const width = 720;
        const height = 235;
        const left = 48;
        const right = 16;
        const top = 18;
        const bottom = 34;
        const socValues = points.map((point) => point.soc);
        const powerValues = points.map((point) => point.power_kw);
        const minSoc = Math.max(0, Math.floor(Math.min(...socValues) / 5) * 5 - 2);
        const maxSoc = Math.min(100, Math.ceil(Math.max(...socValues) / 5) * 5 + 2);
        const spanSoc = Math.max(5, maxSoc - minSoc);
        const maxPower = Math.max(1, ...powerValues);
        const yMax = Math.ceil(maxPower / 5) * 5 || 5;
        const x = (value) => left + ((value - minSoc) / spanSoc) * (width - left - right);
        const y = (value) => top + (1 - value / yMax) * (height - top - bottom);
        const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.soc).toFixed(1)},${y(point.power_kw).toFixed(1)}`).join(" ");
        const color = type === "DC" ? "var(--success-color)" : "var(--primary-color)";
        const mid = yMax / 2;
        return html`
            <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${text.powerOverSoc}">
                <line class="grid" x1="${left}" y1="${y(0)}" x2="${width - right}" y2="${y(0)}"></line>
                <line class="grid" x1="${left}" y1="${y(mid)}" x2="${width - right}" y2="${y(mid)}"></line>
                <line class="grid" x1="${left}" y1="${y(yMax)}" x2="${width - right}" y2="${y(yMax)}"></line>
                <text class="axis" x="4" y="${y(yMax) + 4}">${this._number(yMax, 0)} kW</text>
                <text class="axis" x="4" y="${y(mid) + 4}">${this._number(mid, 0)} kW</text>
                <text class="axis" x="24" y="${y(0) + 4}">0</text>
                <path class="curve" style="stroke:${color}" d="${path}"></path>
                ${points.map((point) => html`<circle class="point" style="fill:${color}" cx="${x(point.soc)}" cy="${y(point.power_kw)}" r="3"></circle>`)}
                <text class="axis" x="${left}" y="${height - 10}">${this._number(minSoc, 0)} %</text>
                <text class="axis" text-anchor="end" x="${width - right}" y="${height - 10}">${this._number(maxSoc, 0)} % SOC</text>
            </svg>`;
    }

    render() {
        if (!this._config) return nothing;
        const curve = this._curve;
        if (!curve && !this._loading && !this._error) return nothing;
        const type = this._type(curve?.type) !== "—" ? this._type(curve?.type) : this._type(curve?.charge_type);
        const startSoc = curve?.start_soc;
        const endSoc = curve?.end_soc;
        const durationSeconds = curve ? (curve.end - curve.start) / 1000 : 0;
        const energy = Number.isFinite(Number(startSoc)) && Number.isFinite(Number(endSoc))
            ? Math.max(0, (endSoc - startSoc) * curve.capacity / 100)
            : null;
        const average = energy !== null && durationSeconds > 0 ? energy / (durationSeconds / 3600) : null;
        const text = textFor(this._config, "chargeHistory");
        return html`
            <ha-card>
                <div class="card-content">
                    <div class="header">
                        <span class="title">${this._config.title || text.curve} · ${type}</span>
                        <span class="status ${curve?.active ? "live" : ""}">${curve?.active ? text.active : text.latest}</span>
                    </div>
                    ${this._loading && !curve ? html`<p class="muted">${text.curveLoading}</p>` : nothing}
                    ${this._error ? html`<p class="error">${text.curveError} ${this._error}</p>` : nothing}
                    ${curve ? html`
                        <div class="metrics">
                            <div class="metric"><div class="metric-label">SOC</div><div class="metric-value">${this._number(startSoc, 0)} → ${this._number(endSoc, 0)} %</div></div>
                            <div class="metric"><div class="metric-label">${text.duration}</div><div class="metric-value">${this._duration(durationSeconds)}</div></div>
                            <div class="metric"><div class="metric-label">${text.energy}</div><div class="metric-value">${this._number(energy, 2)} kWh</div></div>
                            <div class="metric"><div class="metric-label">${text.power}</div><div class="metric-value">${this._number(average, 1)} kW</div></div>
                        </div>
                        ${this._chart(curve.points, type)}
                        <span class="hint">${text.curveHint}</span>
                    ` : nothing}
                </div>
            </ha-card>`;
    }
}

customElements.define("e-c3-dashboard-charge-curve-card", CodexStellantisChargeCurveCardV1);
window.customCards.push({
    type: "e-c3-dashboard-charge-curve-card",
    name: "e-C3 Dashboard Charge Curve",
    preview: true,
});

class CodexStellantisChargeCurveBrowserCardV1 extends LitElement {
    static properties = {
        _hass: { state: true },
        _config: { state: true },
        _sessions: { state: true },
        _history: { state: true },
        _selectedId: { state: true },
        _loading: { state: true },
        _error: { state: true },
    };

    static styles = css`
        .header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        .title { font-size: var(--ha-font-size-l); font-weight: 500; }
        .muted { color: var(--secondary-text-color); }
        .error { color: var(--error-color); }
        select { width: 100%; margin: 12px 0 8px; padding: 9px 10px; color: var(--primary-text-color); background: var(--secondary-background-color); border: 1px solid var(--divider-color); border-radius: 10px; font: inherit; }
        .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 8px 0 4px; }
        .metric { min-width: 0; padding: 8px; border-radius: 10px; background: var(--secondary-background-color); }
        .metric-label { color: var(--secondary-text-color); font-size: var(--ha-font-size-xs); }
        .metric-value { margin-top: 3px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chart { width: 100%; height: 235px; overflow: visible; margin-top: 8px; }
        .grid { stroke: var(--divider-color); stroke-width: 1; }
        .axis { fill: var(--secondary-text-color); font-size: 11px; }
        .curve { fill: none; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
        .point { stroke: var(--card-background-color); stroke-width: 1.5; }
        .hint { display: block; margin-top: 8px; color: var(--secondary-text-color); font-size: var(--ha-font-size-xs); }
        @media (max-width: 500px) { .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    `;

    setConfig(config) {
        if (!config.charging_entity || !config.soc_entity) {
            throw new Error("charging_entity and soc_entity must be specified");
        }
        this._config = {
            hours_to_show: 2160,
            fallback_capacity_kwh: 43.4,
            ...config,
        };
        if (this._hass) this._loadHistory();
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._config) return;
        const updateKey = this._entityIds().map((entityId) => hass.states[entityId]?.last_updated ?? "").join("|");
        if (updateKey !== this._lastUpdated) {
            this._lastUpdated = updateKey;
            this._loadHistory();
        }
    }

    _entityIds() {
        return [this._config?.charging_entity, this._config?.soc_entity, this._config?.power_entity,
            this._config?.mode_entity, this._config?.capacity_entity].filter(Boolean);
    }

    _statesFor(response, entityIds, entityId) {
        if (!entityId) return [];
        if (Array.isArray(response)) {
            if (!Array.isArray(response[0])) return response;
            return response[entityIds.indexOf(entityId)] ?? [];
        }
        return response?.[entityId] ?? [];
    }

    async _loadHistory() {
        if (!this._hass || !this._config || this._loading) return;
        this._loading = true;
        this._error = null;
        try {
            const entityIds = this._entityIds();
            const response = await this._hass.callWS({
                type: "history/history_during_period",
                start_time: new Date(Date.now() - Number(this._config.hours_to_show) * 3600000).toISOString(),
                end_time: new Date().toISOString(),
                entity_ids: entityIds,
                minimal_response: false,
                no_attributes: true,
                significant_changes_only: false,
            });
            const history = {
                soc: this._statesFor(response, entityIds, this._config.soc_entity),
                modes: this._statesFor(response, entityIds, this._config.mode_entity),
            };
            const sessions = buildChargeSessions({
                chargingStates: this._statesFor(response, entityIds, this._config.charging_entity),
                socStates: history.soc,
                powerStates: this._statesFor(response, entityIds, this._config.power_entity),
                modeStates: history.modes,
                capacityStates: this._statesFor(response, entityIds, this._config.capacity_entity),
                fallbackCapacity: Number(this._config.fallback_capacity_kwh),
                includeActive: Boolean(this._config.include_active),
            }).reverse();
            this._history = history;
            this._sessions = sessions;
            if (!sessions.some((session) => session.start === this._selectedId)) {
                this._selectedId = sessions[0]?.start;
            }
        } catch (error) {
            this._sessions = [];
            this._history = null;
            this._error = error?.message ?? String(error);
        } finally {
            this._loading = false;
        }
    }

    _selectSession(event) {
        this._selectedId = event.target.value;
    }

    _number(value, digits = 1) {
        return Number.isFinite(Number(value))
            ? Number(value).toLocaleString(localeFor(this._config), { minimumFractionDigits: digits, maximumFractionDigits: digits })
            : "—";
    }

    _duration(seconds) {
        const total = Math.max(0, Math.round(Number(seconds) || 0));
        return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")} h`;
    }

    _formatSession(session) {
        const date = new Date(session.start).toLocaleString(localeFor(this._config), { dateStyle: "short", timeStyle: "short" });
        return `${date} · ${session.charge_type} · ${this._number(session.soc_start, 0)} → ${this._number(session.soc_end, 0)} %`;
    }

    _chart(points, type) {
        const text = textFor(this._config, "chargeHistory");
        if (points.length < 2) return html`<p class="muted">${text.notEnoughPoints}</p>`;
        const width = 720;
        const height = 235;
        const left = 48;
        const right = 16;
        const top = 18;
        const bottom = 34;
        const socValues = points.map((point) => point.soc);
        const powerValues = points.map((point) => point.power_kw);
        const minSoc = Math.max(0, Math.floor(Math.min(...socValues) / 5) * 5 - 2);
        const maxSoc = Math.min(100, Math.ceil(Math.max(...socValues) / 5) * 5 + 2);
        const spanSoc = Math.max(5, maxSoc - minSoc);
        const yMax = Math.ceil(Math.max(1, ...powerValues) / 5) * 5 || 5;
        const x = (value) => left + ((value - minSoc) / spanSoc) * (width - left - right);
        const y = (value) => top + (1 - value / yMax) * (height - top - bottom);
        const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.soc).toFixed(1)},${y(point.power_kw).toFixed(1)}`).join(" ");
        const color = type === "DC" ? "var(--success-color)" : "var(--primary-color)";
        return html`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${text.powerOverSoc}">
            <line class="grid" x1="${left}" y1="${y(0)}" x2="${width - right}" y2="${y(0)}"></line>
            <line class="grid" x1="${left}" y1="${y(yMax / 2)}" x2="${width - right}" y2="${y(yMax / 2)}"></line>
            <line class="grid" x1="${left}" y1="${y(yMax)}" x2="${width - right}" y2="${y(yMax)}"></line>
            <text class="axis" x="4" y="${y(yMax) + 4}">${this._number(yMax, 0)} kW</text>
            <text class="axis" x="4" y="${y(yMax / 2) + 4}">${this._number(yMax / 2, 0)} kW</text>
            <text class="axis" x="24" y="${y(0) + 4}">0</text>
            <path class="curve" style="stroke:${color}" d="${path}"></path>
            ${points.map((point) => html`<circle class="point" style="fill:${color}" cx="${x(point.soc)}" cy="${y(point.power_kw)}" r="3"></circle>`)}
            <text class="axis" x="${left}" y="${height - 10}">${this._number(minSoc, 0)} %</text>
            <text class="axis" text-anchor="end" x="${width - right}" y="${height - 10}">${this._number(maxSoc, 0)} % SOC</text>
        </svg>`;
    }

    render() {
        if (!this._config) return nothing;
        const sessions = this._sessions ?? [];
        const selected = sessions.find((session) => session.start === this._selectedId);
        const curve = selected && this._history ? buildChargeCurve({
            socStates: this._history.soc,
            modeStates: this._history.modes,
            start: selected.start,
            end: selected.end,
            capacityKwh: selected.capacity_kwh,
        }) : null;
        const type = curve?.charge_type !== "—" ? curve?.charge_type : selected?.charge_type;
        const text = textFor(this._config, "chargeHistory");
        return html`<ha-card>
            <div class="card-content">
                <div class="header"><span class="title">${this._config.title || text.curve}</span><span class="muted">${sessions.length} ${text.sessions}</span></div>
                ${this._loading && !sessions.length ? html`<p class="muted">${text.loading}</p>` : nothing}
                ${this._error ? html`<p class="error">${text.error} ${this._error}</p>` : nothing}
                ${sessions.length ? html`
                    <select aria-label="${text.selectSession}" .value=${this._selectedId ?? ""} @change=${this._selectSession}>
                        ${sessions.map((session) => html`<option value="${session.start}">${this._formatSession(session)}</option>`)}
                    </select>
                    ${selected ? html`
                        <div class="metrics">
                            <div class="metric"><div class="metric-label">SOC</div><div class="metric-value">${this._number(selected.soc_start, 0)} → ${this._number(selected.soc_end, 0)} %</div></div>
                            <div class="metric"><div class="metric-label">${text.duration}</div><div class="metric-value">${this._duration(selected.duration_seconds)}</div></div>
                            <div class="metric"><div class="metric-label">${text.energy}</div><div class="metric-value">${this._number(selected.energy_kwh, 2)} kWh</div></div>
                            <div class="metric"><div class="metric-label">${text.power}</div><div class="metric-value">${this._number(selected.average_power_kw, 1)} kW</div></div>
                        </div>
                        ${this._chart(curve?.points ?? [], type)}
                        <span class="hint">${type} · ${text.browserHint}</span>
                    ` : nothing}
                ` : !this._loading && !this._error ? html`<p class="muted">${text.empty}</p>` : nothing}
            </div>
        </ha-card>`;
    }
}

customElements.define("e-c3-dashboard-charge-curve-browser-card", CodexStellantisChargeCurveBrowserCardV1);
window.customCards.push({
    type: "e-c3-dashboard-charge-curve-browser-card",
    name: "e-C3 Dashboard Charge Curve Browser",
    preview: true,
});
