import { LitElement, html, css, nothing } from "https://unpkg.com/lit?module";
import { localeFor, textFor } from "./i18n.js?v=0.4.7";

/**
 * Standalone Lovelace card for the historic Stellantis "last trip" sensor.
 * It intentionally does not depend on stellantis-vehicle-card.js.
 */
class CodexStellantisTripHistoryCardV4 extends LitElement {
    static properties = {
        _hass: { state: true },
        _config: { state: true },
        _trips: { state: true },
        _loading: { state: true },
        _error: { state: true },
    };

    static styles = css`
        .table-scroll {
            max-height: min(360px, 48vh);
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-y: contain;
            touch-action: pan-y;
            scrollbar-width: thin;
            scrollbar-color: var(--divider-color) transparent;
        }
        .table-scroll::-webkit-scrollbar { width: 8px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--divider-color); border-radius: 999px; }
        .table-scroll::-webkit-scrollbar-track { background: transparent; }
        .trip-table { width: 100%; border-collapse: collapse; font-size: var(--ha-font-size-s); }
        .trip-table th { position: sticky; top: 0; z-index: 1; color: var(--secondary-text-color); background: var(--card-background-color); font-weight: 500; text-align: left; padding: 0 8px 8px 0; white-space: nowrap; }
        .trip-table td { border-top: 1px solid var(--divider-color); padding: 9px 8px 9px 0; vertical-align: top; white-space: nowrap; }
        .trip-table td:first-child { white-space: normal; }
        .muted { color: var(--secondary-text-color); }
        .error { color: var(--error-color); }
    `;

    setConfig(config) {
        if (!config.entity) {
            throw new Error("Entity must be specified");
        }
        this._config = { hours_to_show: 2160, max_trips: 50, language: "auto", ...config };
        if (this._hass) {
            this._lastUpdated = undefined;
            this._loadHistory();
        }
    }

    set hass(hass) {
        this._hass = hass;
        const updateKey = [
            hass.states[this._config?.entity]?.last_updated,
            ...(this._energyEntityIds().map((entityId) => hass.states[entityId]?.last_updated)),
        ].join("|");
        if (updateKey && (this._trips === undefined || updateKey !== this._lastUpdated)) {
            this._lastUpdated = updateKey;
            this._loadHistory();
        }
    }

    _normalizeState(raw) {
        return {
            state: raw.state ?? raw.s,
            attributes: raw.attributes ?? raw.a ?? {},
            last_updated: raw.last_updated ?? raw.last_changed ??
                (Number.isFinite(raw.lu) ? new Date(raw.lu * 1000).toISOString() : undefined),
        };
    }

    _energyEntityIds() {
        if (!this._config) return [];
        return [...new Set([
            this._config.energy_entity,
            ...(this._config.energy_entities ?? []),
        ].filter(Boolean))];
    }

    async _loadHistory() {
        if (!this._hass || !this._config || this._loading) return;
        this._loading = true;
        this._error = null;
        try {
            const energyEntityIds = this._energyEntityIds();
            const entityIds = [this._config.entity, ...energyEntityIds];
            const response = await this._hass.callWS({
                type: "history/history_during_period",
                start_time: new Date(Date.now() - Number(this._config.hours_to_show) * 3600000).toISOString(),
                end_time: new Date().toISOString(),
                entity_ids: entityIds,
                minimal_response: false,
                no_attributes: false,
                significant_changes_only: false,
            });
            // HA returns one array of states for each requested entity.
            const states = Array.isArray(response)
                ? (Array.isArray(response[0]) ? response[0] : response)
                : (response[this._config.entity] ?? []);
            const statesFor = (entityId) => Array.isArray(response)
                ? (Array.isArray(response[0]) ? response[entityIds.indexOf(entityId)] ?? [] : response)
                : (response[entityId] ?? []);
            const energyResults = energyEntityIds
                .flatMap((entityId) => statesFor(entityId))
                .map((raw) => this._normalizeState(raw))
                .filter((item) => item.attributes?.end_time && item.attributes?.energy_kwh !== undefined);
            const seen = new Set();
            const uniqueTrips = states
                .map((raw) => this._normalizeState(raw))
                .filter((state) => {
                    const a = state.attributes ?? {};
                    return !["unknown", "unavailable"].includes(state.state) && a.duration && a.start_mileage;
                })
                .filter((state) => {
                    const a = state.attributes ?? {};
                    const key = [state.state, a.duration, a.start_mileage, a.avg_speed].join("|");
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            this._trips = uniqueTrips
                .map((trip) => {
                    const tripTime = new Date(trip.last_updated).getTime();
                    const tripDistance = Number.parseFloat(trip.state);
                    const result = energyResults
                        .map((energy) => ({
                            energy,
                            timeDelta: Math.abs(new Date(energy.attributes.end_time).getTime() - tripTime),
                            distanceDelta: Math.abs(Number(energy.attributes.distance_km) - tripDistance),
                        }))
                        .filter((candidate) => candidate.timeDelta <= 5 * 60 * 1000 && candidate.distanceDelta <= 2)
                        .sort((a, b) => a.timeDelta - b.timeDelta)[0]?.energy;
                    return result
                        ? { ...trip, attributes: { ...trip.attributes, ...result.attributes } }
                        : trip;
                })
                .reverse()
                .slice(0, Number(this._config.max_trips));
        } catch (error) {
            this._trips = [];
            this._error = error?.message ?? String(error);
        } finally {
            this._loading = false;
        }
    }

    _formatDate(value) {
        return new Date(value).toLocaleString(this._locale(), { dateStyle: "short", timeStyle: "short" });
    }

    _locale() {
        return localeFor(this._config);
    }

    _text() {
        return textFor(this._config, "tripHistory");
    }

    _value(value, fallback = "—") {
        return value === undefined || value === null || value === "" ? fallback : value;
    }

    render() {
        if (!this._config) return nothing;
        const text = this._text();
        const trips = this._trips ?? [];
        const hasMaxSpeed = trips.some((trip) => trip.attributes?.max_speed);
        const hasEnergy = trips.some((trip) => trip.attributes?.energy_kwh !== undefined);
        return html`
            <ha-card .header=${this._config.title || text.title}>
                <div class="card-content">
                    ${this._loading && trips.length === 0 ? html`<span class="muted">${text.loading}</span>` : nothing}
                    ${this._error ? html`<span class="error">${text.error} ${this._error}</span>` : nothing}
                    ${!this._loading && !this._error && trips.length === 0 ? html`<span class="muted">${text.empty}</span>` : nothing}
                    ${trips.length ? html`
                        <div class="table-scroll" tabindex="0" aria-label=${text.scroll}>
                            <table class="trip-table"><thead><tr><th>${text.date}</th><th>${text.duration}</th><th>${text.distance}</th><th>${text.average}</th>${hasEnergy ? html`<th>${text.energy}</th><th>${text.consumption}</th>` : nothing}${hasMaxSpeed ? html`<th>${text.maximum}</th>` : nothing}</tr></thead>
                            <tbody>${trips.map((trip) => html`<tr>
                                <td>${this._formatDate(trip.last_updated ?? trip.last_changed)}</td>
                                <td>${this._value(trip.attributes?.duration)}</td>
                                <td>${this._value(trip.state)} km</td>
                                <td>${this._value(trip.attributes?.avg_speed)}</td>
                                ${hasEnergy ? html`<td>${this._value(trip.attributes?.energy_kwh)}</td><td>${this._value(trip.attributes?.energy_per_100_km)}</td>` : nothing}
                                ${hasMaxSpeed ? html`<td>${this._value(trip.attributes?.max_speed)}</td>` : nothing}
                            </tr>`)}</tbody></table>
                        </div>` : nothing}
                </div>
            </ha-card>
        `;
    }
}

customElements.define("e-c3-dashboard-trip-history-card", CodexStellantisTripHistoryCardV4);
window.customCards = window.customCards ?? [];
window.customCards.push({
    type: "e-c3-dashboard-trip-history-card",
    name: "e-C3 Dashboard Trip History",
    preview: true,
});
