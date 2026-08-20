import { LitElement, html, css, nothing } from "https://unpkg.com/lit?module";
import { localeFor, textFor } from "./i18n.js?v=0.5.5";

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
        _expandedTripKey: { state: true },
        _filterDays: { state: true },
        _showZeroEvents: { state: true },
        _hideShortTrips: { state: true },
        _onlyConsumption: { state: true },
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
        .trip-row { cursor: pointer; }
        .trip-row:hover td, .trip-row:focus td { background: color-mix(in srgb, var(--primary-color) 8%, transparent); }
        .trip-row:focus { outline: 2px solid var(--primary-color); outline-offset: -2px; }
        .trip-details td { padding: 0 0 10px 0; border-top: 0; white-space: normal; }
        .trip-details-content { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 8px 10px; border-left: 3px solid var(--primary-color); background: color-mix(in srgb, var(--primary-color) 7%, transparent); }
        .muted { color: var(--secondary-text-color); }
        .error { color: var(--error-color); }
        .filters { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; margin: 0 0 12px; font-size: var(--ha-font-size-s); }
        .filters label { display: inline-flex; align-items: center; gap: 5px; color: var(--secondary-text-color); }
        .filters select { min-height: 30px; border: 1px solid var(--divider-color); border-radius: 7px; color: var(--primary-text-color); background: var(--secondary-background-color); font: inherit; }
        .filter-note { margin: 0 0 12px; color: var(--secondary-text-color); font-size: var(--ha-font-size-s); }
    `;

    setConfig(config) {
        if (!config.entity) {
            throw new Error("Entity must be specified");
        }
        this._config = { hours_to_show: 2160, max_trips: 50, language: "auto", ...config };
        this._compactFilters = Boolean(config.compact_filters);
        this._filterDays = Number(config.filter_days ?? (this._compactFilters ? 30 : 0));
        this._showZeroEvents = this._compactFilters ? false : Boolean(config.show_zero_events);
        this._hideShortTrips = this._compactFilters ? true : Boolean(config.hide_short_trips);
        this._onlyConsumption = this._compactFilters ? false : Boolean(config.only_consumption);
        if (this._hass) {
            this._lastUpdated = undefined;
            this._loadHistory();
        }
    }

    set hass(hass) {
        this._hass = hass;
        const updateKey = [
            hass.states[this._config?.entity]?.last_updated,
            hass.states[this._config?.server_entity]?.last_updated,
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

    _tripEntityIds() {
        if (!this._config) return [];
        return [...new Set([
            this._config.entity,
            ...(this._config.trip_entities ?? []),
        ].filter(Boolean))];
    }

    async _loadHistory() {
        if (!this._hass || !this._config || this._loading) return;
        this._loading = true;
        this._error = null;
        try {
            const serverState = this._config.server_entity ? this._hass.states[this._config.server_entity] : null;
            const tripColumns = serverState?.attributes?.trip_columns;
            const packedTrips = serverState?.attributes?.trip_rows;
            const serverTrips = serverState?.attributes?.server_history_ready
                ? (Array.isArray(packedTrips) && Array.isArray(tripColumns)
                    ? packedTrips.map((values) => Object.fromEntries(
                        tripColumns.map((column, index) => [column, values[index]])
                    ))
                    : serverState.attributes.trips)
                : null;
            if (Array.isArray(serverTrips)) {
                const packedZero = serverState.attributes.zero_trip_rows;
                const zeroEvents = Array.isArray(packedZero) && Array.isArray(tripColumns)
                    ? packedZero.map((values) => ({
                        ...Object.fromEntries(tripColumns.map((column, index) => [column, values[index]])),
                        is_zero_event: true,
                    }))
                    : (serverState.attributes.zero_distance_events ?? []);
                const allServerTrips = [
                    ...serverTrips,
                    ...(this._showZeroEvents ? zeroEvents : []),
                ];
                this._trips = this._filterServerTrips(allServerTrips).map((trip) => ({
                    state: trip.distance_km,
                    last_updated: trip.end_time || trip.start_time,
                    _sourceEntityId: this._config.server_entity,
                    _rowId: `stellantis|${trip.server_id}`,
                    attributes: {
                        ...trip,
                        id: trip.server_id,
                        start_time: trip.start_time,
                        end_time: trip.end_time,
                        start_mileage: trip.start_mileage,
                        duration_seconds: trip.duration_seconds,
                        energy_kwh: trip.energy_kwh,
                        energy_per_100_km: trip.energy_per_100_km,
                        avg_speed: trip.average_speed,
                    },
                })).reverse().slice(0, Number(this._config.max_trips));
                return;
            }
            const tripEntityIds = this._tripEntityIds();
            const energyEntityIds = this._energyEntityIds();
            const entityIds = [...new Set([...tripEntityIds, ...energyEntityIds])];
            const response = await this._hass.callWS({
                type: "history/history_during_period",
                start_time: new Date(Date.now() - Number(this._config.hours_to_show) * 3600000).toISOString(),
                end_time: new Date().toISOString(),
                entity_ids: entityIds,
                minimal_response: false,
                no_attributes: false,
                significant_changes_only: false,
            });
            const statesFor = (entityId) => Array.isArray(response)
                ? (Array.isArray(response[0]) ? response[entityIds.indexOf(entityId)] ?? [] : response)
                : (response[entityId] ?? []);
            const energyResults = energyEntityIds
                .flatMap((entityId) => statesFor(entityId))
                .map((raw) => this._normalizeState(raw))
                .filter((item) => item.attributes?.end_time && item.attributes?.energy_kwh !== undefined);
            // Recorder/history responses may omit attributes that did not
            // change between two state rows. Carry the last known attribute
            // set forward so a trip row is not discarded merely because HA
            // returned its unchanged duration/mileage metadata compactly.
            const enrichAttributes = (rawStates) => {
                let carriedAttributes = {};
                return rawStates
                    .map((raw) => this._normalizeState(raw))
                    .sort((a, b) => new Date(a.last_updated).getTime() - new Date(b.last_updated).getTime())
                    .map((state) => {
                        carriedAttributes = {
                            ...carriedAttributes,
                            ...(state.attributes ?? {}),
                        };
                        return { ...state, attributes: { ...carriedAttributes } };
                    });
            };
            const enrichedStates = tripEntityIds
                .flatMap((entityId) => enrichAttributes(statesFor(entityId))
                    .map((state) => ({ ...state, _sourceEntityId: entityId })))
                .sort((a, b) => new Date(a.last_updated).getTime() - new Date(b.last_updated).getTime());
            const parseNumber = (value) => Number.parseFloat(String(value ?? "").replace(",", "."));
            const durationSeconds = (value) => {
                const text = String(value ?? "");
                const clock = text.match(/^(\d+):(\d{2})(?::(\d{2}))?/);
                if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] || 0);
                const minutes = text.match(/(\d+)\s*min/);
                return minutes ? Number(minutes[1]) * 60 : NaN;
            };
            const candidateTrips = enrichedStates
                .filter((state) => {
                    const attributes = state.attributes ?? {};
                    return !["unknown", "unavailable"].includes(state.state) &&
                        attributes.duration && attributes.start_mileage;
                })
                .map((state) => ({
                    ...state,
                    _rowId: [
                        state._sourceEntityId,
                        state.last_updated ?? state.last_changed ?? "",
                        state.state,
                        state.attributes?.start_time ?? "",
                        state.attributes?.end_time ?? "",
                    ].join("|"),
                }));
            const isSameSourceRepeat = (left, right) => {
                const leftAttributes = left.attributes ?? {};
                const rightAttributes = right.attributes ?? {};
                const isLocal = left._sourceEntityId === this._config.entity &&
                    right._sourceEntityId === this._config.entity;
                if (isLocal && leftAttributes.id && leftAttributes.id === rightAttributes.id) return true;
                const leftDistance = parseNumber(left.state);
                const rightDistance = parseNumber(right.state);
                const leftStart = parseNumber(leftAttributes.start_mileage);
                const rightStart = parseNumber(rightAttributes.start_mileage);
                if (![leftDistance, rightDistance, leftStart, rightStart].every(Number.isFinite)) return false;
                if (Math.abs(leftDistance - rightDistance) > 0.01 || Math.abs(leftStart - rightStart) > 0.01) return false;
                const leftDuration = durationSeconds(leftAttributes.duration);
                const rightDuration = durationSeconds(rightAttributes.duration);
                if (!Number.isFinite(leftDuration) || !Number.isFinite(rightDuration) || leftDuration !== rightDuration) return false;
                if (!isLocal) return true;
                const leftTime = Date.parse(left.last_updated || "");
                const rightTime = Date.parse(right.last_updated || "");
                return Number.isFinite(leftTime) && Number.isFinite(rightTime) && Math.abs(leftTime - rightTime) <= 90 * 1000;
            };
            const uniquePerSource = (trips) => trips.reduce((result, trip) => {
                if (!result.some((existing) => isSameSourceRepeat(existing, trip))) result.push(trip);
                return result;
            }, []);
            const localTrips = uniquePerSource(candidateTrips.filter((trip) =>
                trip._sourceEntityId === this._config.entity
            ));
            const nativeTrips = uniquePerSource(candidateTrips.filter((trip) =>
                trip._sourceEntityId !== this._config.entity
            ));
            const isNativeDuplicateOfLocal = (nativeTrip) => localTrips.some((localTrip) => {
                const nativeAttributes = nativeTrip.attributes ?? {};
                const localAttributes = localTrip.attributes ?? {};
                const nativeDistance = parseNumber(nativeTrip.state);
                const localDistance = parseNumber(localTrip.state);
                const nativeStart = parseNumber(nativeAttributes.start_mileage);
                const localStart = parseNumber(localAttributes.start_mileage);
                const nativeDuration = durationSeconds(nativeAttributes.duration);
                const localDuration = durationSeconds(localAttributes.duration);
                return [nativeDistance, localDistance, nativeStart, localStart, nativeDuration, localDuration]
                    .every(Number.isFinite) &&
                    Math.abs(nativeDistance - localDistance) <= 0.1 &&
                    Math.abs(nativeStart - localStart) <= 0.1 &&
                    Math.abs(nativeDuration - localDuration) <= 120;
            });
            const uniqueTrips = [...localTrips, ...nativeTrips.filter((trip) => !isNativeDuplicateOfLocal(trip))]
                .sort((a, b) => new Date(a.last_updated).getTime() - new Date(b.last_updated).getTime());
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

    _filterServerTrips(trips) {
        const days = Number(this._filterDays);
        const cutoff = Number.isFinite(days) && days > 0 ? Date.now() - days * 86400000 : null;
        return trips.filter((trip) => {
            const distance = Number(trip.distance_km);
            const timestamp = Date.parse(trip.end_time || trip.start_time || "");
            if (cutoff && (!Number.isFinite(timestamp) || timestamp < cutoff)) return false;
            if (!this._showZeroEvents && distance === 0) return false;
            if (this._hideShortTrips && distance > 0 && distance <= 1) return false;
            if (this._onlyConsumption && (!Number.isFinite(Number(trip.energy_kwh)) || Number(trip.energy_kwh) <= 0)) return false;
            return true;
        });
    }

    _changeFilter(name, event) {
        this[name] = event.target.type === "checkbox" ? event.target.checked : Number(event.target.value);
        this._loadHistory();
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

    _tripKey(trip, index) {
        return trip._rowId || `${trip._sourceEntityId ?? "trip"}|${trip.last_updated ?? trip.last_changed}|${trip.state}|${index}`;
    }

    _toggleTrip(key) {
        this._expandedTripKey = this._expandedTripKey === key ? undefined : key;
    }

    _formatMileage(value) {
        const numeric = Number.parseFloat(String(value ?? "").replace(",", "."));
        return Number.isFinite(numeric)
            ? `${numeric.toLocaleString(this._locale(), { maximumFractionDigits: 1 })} km`
            : this._value(value);
    }

    _formatDuration(trip) {
        const seconds = Number(trip.attributes?.duration_seconds);
        const raw = String(trip.attributes?.duration ?? "");
        const clock = raw.match(/^(\d+):(\d{2})(?::(\d{2}))?/);
        const fromRaw = clock
            ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] || 0)
            : Number.NaN;
        const total = Number.isFinite(seconds) ? seconds : fromRaw;
        if (!Number.isFinite(total)) return "—";
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        return `${hours}:${String(minutes).padStart(2, "0")} h`;
    }

    _formatDistance(value) {
        const numeric = Number.parseFloat(String(value ?? "").replace(",", "."));
        return Number.isFinite(numeric)
            ? `${numeric.toLocaleString(this._locale(), { maximumFractionDigits: 1 })} km`
            : "—";
    }

    _formatSpeed(trip) {
        const numeric = Number.parseFloat(String(trip.attributes?.average_speed ?? trip.attributes?.avg_speed ?? "").replace(",", "."));
        return Number.isFinite(numeric)
            ? `${numeric.toLocaleString(this._locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km/h`
            : "—";
    }

    _endMileage(trip) {
        const explicit = trip.attributes?.end_mileage;
        if (explicit !== undefined && explicit !== null && explicit !== "") {
            return explicit;
        }
        const start = Number.parseFloat(String(trip.attributes?.start_mileage ?? "").replace(",", "."));
        const distance = Number.parseFloat(String(trip.state ?? "").replace(",", "."));
        return Number.isFinite(start) && Number.isFinite(distance) ? start + distance : undefined;
    }

    render() {
        if (!this._config) return nothing;
        const text = this._text();
        const trips = this._trips ?? [];
        const hasMaxSpeed = trips.some((trip) => trip.attributes?.max_speed);
        const hasEnergy = trips.some((trip) => trip.attributes?.energy_kwh !== undefined);
        const columnCount = 4 + (hasEnergy ? 2 : 0) + (hasMaxSpeed ? 1 : 0);
        const de = this._locale().startsWith("de");
        return html`
            <ha-card .header=${this._config.title || text.title}>
                <div class="card-content">
                    ${this._config.server_entity ? (this._compactFilters ? html`
                        <div class="filter-note">${de ? "Letzte 30 Tage; Kurzstrecken ≤ 1 km und 0-km-Ereignisse ausgeblendet." : "Last 30 days; trips ≤ 1 km and 0 km events are hidden."}</div>
                    ` : html`<div class="filters">
                        <label>${de ? "Zeitraum" : "Period"}
                            <select .value=${String(this._filterDays ?? 0)} @change=${(event) => this._changeFilter("_filterDays", event)}>
                                <option value="0">${de ? "Alle" : "All"}</option>
                                <option value="7">7 ${de ? "Tage" : "days"}</option>
                                <option value="30">30 ${de ? "Tage" : "days"}</option>
                                <option value="90">90 ${de ? "Tage" : "days"}</option>
                            </select>
                        </label>
                        <label><input type="checkbox" .checked=${this._hideShortTrips} @change=${(event) => this._changeFilter("_hideShortTrips", event)}> ${de ? "≤ 1 km ausblenden" : "Hide ≤ 1 km"}</label>
                        <label><input type="checkbox" .checked=${this._onlyConsumption} @change=${(event) => this._changeFilter("_onlyConsumption", event)}> ${de ? "nur Verbrauch" : "Consumption only"}</label>
                        <label><input type="checkbox" .checked=${this._showZeroEvents} @change=${(event) => this._changeFilter("_showZeroEvents", event)}> ${de ? "0-km-Ereignisse" : "0 km events"}</label>
                    </div>`) : nothing}
                    ${this._loading && trips.length === 0 ? html`<span class="muted">${text.loading}</span>` : nothing}
                    ${this._error ? html`<span class="error">${text.error} ${this._error}</span>` : nothing}
                    ${!this._loading && !this._error && trips.length === 0 ? html`<span class="muted">${text.empty}</span>` : nothing}
                    ${trips.length ? html`
                        <div class="table-scroll" tabindex="0" aria-label=${text.scroll}>
                            <table class="trip-table"><thead><tr><th>${text.date}</th><th>${text.duration}</th><th>${text.distance}</th><th>${text.average}</th>${hasEnergy ? html`<th>${text.energy}</th><th>${text.consumption}</th>` : nothing}${hasMaxSpeed ? html`<th>${text.maximum}</th>` : nothing}</tr></thead>
                            <tbody>${trips.map((trip, index) => {
                                const key = this._tripKey(trip, index);
                                const expanded = this._expandedTripKey === key;
                                return html`<tr class="trip-row" tabindex="0" role="button" aria-expanded=${expanded} @click=${() => this._toggleTrip(key)} @keydown=${(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this._toggleTrip(key); } }}>
                                <td>${this._formatDate(trip.last_updated ?? trip.last_changed)}</td>
                                <td>${this._formatDuration(trip)}</td>
                                <td>${this._formatDistance(trip.state)}</td>
                                <td>${this._formatSpeed(trip)}</td>
                                ${hasEnergy ? html`<td>${this._value(trip.attributes?.energy_kwh)}</td><td>${this._value(trip.attributes?.energy_per_100_km)}</td>` : nothing}
                                ${hasMaxSpeed ? html`<td>${this._value(trip.attributes?.max_speed)}</td>` : nothing}
                            </tr>${expanded ? html`<tr class="trip-details">
                                <td colspan=${columnCount}>
                                    <div class="trip-details-content">
                                        <span><strong>${text.startMileage}:</strong> ${this._formatMileage(trip.attributes?.start_mileage)}</span>
                                        <span><strong>${text.endMileage}:</strong> ${this._formatMileage(this._endMileage(trip))}</span>
                                        <span><strong>SOC Start:</strong> ${this._value(trip.attributes?.soc_start)} %</span>
                                        <span><strong>SOC Ende:</strong> ${this._value(trip.attributes?.soc_end)} %</span>
                                    </div>
                                </td>
                            </tr>` : nothing}`;
                            })}</tbody></table>
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
