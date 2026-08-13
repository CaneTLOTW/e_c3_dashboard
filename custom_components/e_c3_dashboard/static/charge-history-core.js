export function normalizeHistoryState(raw) {
    const lastUpdated = raw?.last_updated ?? raw?.last_changed ?? raw?.lu;
    let timestamp;
    if (typeof lastUpdated === "number") {
        timestamp = lastUpdated * 1000;
    } else {
        timestamp = Date.parse(lastUpdated);
    }

    return {
        state: String(raw?.state ?? raw?.s ?? "").trim(),
        timestamp,
    };
}

function normalizedStates(states) {
    return (states ?? [])
        .map(normalizeHistoryState)
        .filter((item) => Number.isFinite(item.timestamp))
        .sort((a, b) => a.timestamp - b.timestamp);
}

function numericState(value) {
    const normalized = String(value ?? "").replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function stateAt(states, timestamp) {
    let latest = null;
    for (const item of states) {
        if (item.timestamp > timestamp) break;
        if (numericState(item.state) !== null) latest = item;
    }
    if (latest) return latest;
    return states.find((item) => numericState(item.state) !== null) ?? null;
}

function normalizeChargeType(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (["ac", "slow", "normal", "standard"].includes(normalized)) return "AC";
    if (["dc", "quick", "fast", "rapid"].includes(normalized)) return "DC";
    return null;
}

function extractIntervals(chargingStates, mergeGapMs, includeActive = false) {
    const intervals = [];
    let start = null;
    let partialStart = false;
    let seenKnownState = false;

    for (const item of chargingStates) {
        const state = item.state.toLowerCase();
        if (state === "on") {
            if (start === null) {
                start = item.timestamp;
                partialStart = !seenKnownState;
            }
            seenKnownState = true;
            continue;
        }
        if (state !== "off") continue;

        if (start !== null && !partialStart && item.timestamp > start) {
            intervals.push({ start, end: item.timestamp });
        }
        start = null;
        partialStart = false;
        seenKnownState = true;
    }

    // A dashboard may explicitly request the still-running session for the
    // live curve. The default remains completed sessions only, so historical
    // tables are not altered by an in-progress charge.
    if (includeActive && start !== null && !partialStart && Date.now() > start) {
        intervals.push({ start, end: Date.now() });
    }

    const merged = [];
    for (const interval of intervals) {
        const previous = merged.at(-1);
        if (previous && interval.start - previous.end <= mergeGapMs) {
            previous.end = interval.end;
        } else {
            merged.push({ ...interval });
        }
    }
    return merged;
}

function maximumPowerFromStates(powerStates, start, end) {
    const values = powerStates
        .filter((item) => item.timestamp >= start && item.timestamp <= end)
        .map((item) => numericState(item.state))
        .filter((value) => value !== null && value >= 0 && value <= 500);
    return values.length ? Math.max(...values) : null;
}

function maximumPowerFromSoc(socStates, start, end, startSoc, capacity) {
    const points = [{ timestamp: start, value: startSoc }];
    for (const item of socStates) {
        if (item.timestamp <= start || item.timestamp > end) continue;
        const value = numericState(item.state);
        if (value !== null) points.push({ timestamp: item.timestamp, value });
    }

    let maximum = null;
    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        const durationSeconds = (current.timestamp - previous.timestamp) / 1000;
        const socDelta = current.value - previous.value;
        if (durationSeconds < 120 || socDelta <= 0) continue;
        const power = (socDelta * capacity / 100) / (durationSeconds / 3600);
        if (Number.isFinite(power) && power >= 0 && power <= 500) {
            maximum = maximum === null ? power : Math.max(maximum, power);
        }
    }
    return maximum;
}

function chargeTypeForInterval(modeStates, start, end) {
    const values = [];
    const modeAtStart = [...modeStates]
        .reverse()
        .find((item) => item.timestamp <= start && normalizeChargeType(item.state));
    if (modeAtStart) values.push(normalizeChargeType(modeAtStart.state));
    for (const item of modeStates) {
        if (item.timestamp < start || item.timestamp > end) continue;
        const type = normalizeChargeType(item.state);
        if (type) values.push(type);
    }
    if (values.includes("DC")) return "DC";
    if (values.includes("AC")) return "AC";
    return "—";
}

function timestampValue(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    return Date.parse(value);
}

/**
 * Builds the points for one charging-session curve.
 *
 * The Stellantis API publishes a whole-number SOC rather than a direct
 * charging-power value.  Each segment therefore represents the battery-side
 * average power between two increasing SOC reports.  This deliberately does
 * not claim to be the power measured at the charging station.
 */
export function buildChargeCurve({
    socStates,
    modeStates = [],
    start,
    end,
    capacityKwh = 43.4,
}) {
    const startTimestamp = timestampValue(start);
    const endTimestamp = timestampValue(end);
    if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp <= startTimestamp) {
        return { points: [], charge_type: "—" };
    }

    const soc = normalizedStates(socStates);
    const modes = normalizedStates(modeStates);
    const startState = stateAt(soc, startTimestamp);
    const startSoc = numericState(startState?.state);
    if (startSoc === null) return { points: [], charge_type: chargeTypeForInterval(modes, startTimestamp, endTimestamp) };

    const capacity = Number.isFinite(Number(capacityKwh)) && Number(capacityKwh) > 0
        ? Number(capacityKwh)
        : 43.4;
    const points = [];
    let previous = { timestamp: startTimestamp, soc: startSoc };

    for (const item of soc) {
        if (item.timestamp <= startTimestamp || item.timestamp > endTimestamp) continue;
        const currentSoc = numericState(item.state);
        if (currentSoc === null || currentSoc <= previous.soc) continue;

        const durationSeconds = (item.timestamp - previous.timestamp) / 1000;
        const deltaSoc = currentSoc - previous.soc;
        const powerKw = durationSeconds > 0
            ? (deltaSoc * capacity / 100) / (durationSeconds / 3600)
            : null;

        // Reject implausible outliers, but retain the SOC point as the new
        // reference so a malformed report cannot poison the next segment.
        if (Number.isFinite(powerKw) && powerKw >= 0 && powerKw <= 350) {
            points.push({
                timestamp: previous.timestamp,
                soc: previous.soc,
                power_kw: powerKw,
            });
            points.push({
                timestamp: item.timestamp,
                soc: currentSoc,
                power_kw: powerKw,
            });
        }
        previous = { timestamp: item.timestamp, soc: currentSoc };
    }

    return {
        points,
        start_soc: startSoc,
        end_soc: previous.soc,
        charge_type: chargeTypeForInterval(modes, startTimestamp, endTimestamp),
    };
}

export function buildChargeSessions({
    chargingStates,
    socStates,
    powerStates = [],
    modeStates = [],
    capacityStates = [],
    fallbackCapacity = 43.4,
    mergeGapMinutes = 3,
    includeActive = false,
}) {
    const charging = normalizedStates(chargingStates);
    const soc = normalizedStates(socStates);
    const power = normalizedStates(powerStates);
    const modes = normalizedStates(modeStates);
    const capacities = normalizedStates(capacityStates);
    const intervals = extractIntervals(
        charging, mergeGapMinutes * 60000, includeActive
    );

    return intervals.map((interval) => {
        const startState = stateAt(soc, interval.start);
        const endState = stateAt(soc, interval.end);
        const capacityState = stateAt(capacities, interval.start);
        const startSoc = numericState(startState?.state);
        const endSoc = numericState(endState?.state);
        const measuredCapacity = numericState(capacityState?.state);
        const capacity = measuredCapacity && measuredCapacity > 0
            ? measuredCapacity
            : fallbackCapacity;
        const durationSeconds = (interval.end - interval.start) / 1000;
        const socDelta = startSoc !== null && endSoc !== null
            ? Math.max(0, endSoc - startSoc)
            : null;
        const energy = socDelta !== null ? socDelta * capacity / 100 : null;
        const averagePower = energy !== null && durationSeconds > 0
            ? energy / (durationSeconds / 3600)
            : null;
        const recordedMaximum = maximumPowerFromStates(power, interval.start, interval.end);
        const derivedMaximum = startSoc !== null
            ? maximumPowerFromSoc(soc, interval.start, interval.end, startSoc, capacity)
            : null;
        const maximumPower = recordedMaximum !== null && recordedMaximum > 0
            ? recordedMaximum
            : derivedMaximum;

        return {
            start: new Date(interval.start).toISOString(),
            end: new Date(interval.end).toISOString(),
            duration_seconds: Math.round(durationSeconds),
            soc_start: startSoc,
            soc_end: endSoc,
            capacity_kwh: capacity,
            energy_kwh: energy,
            average_power_kw: averagePower,
            maximum_power_kw: maximumPower,
            charge_type: chargeTypeForInterval(modes, interval.start, interval.end),
            estimated: true,
        };
    });
}
