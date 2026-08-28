const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseLocalDateKey(value) {
  if (typeof value !== "string" || !DATE_KEY_RE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function normalizeDateKey(value, now = new Date()) {
  const today = localDateKey(now);
  const parsed = parseLocalDateKey(value);
  if (!parsed) return today;
  return value > today ? today : value;
}

export function shiftDateKey(value, days, now = new Date()) {
  const normalized = normalizeDateKey(value, now);
  const parsed = parseLocalDateKey(normalized);
  parsed.setDate(parsed.getDate() + Number(days || 0));
  return normalizeDateKey(localDateKey(parsed), now);
}

export function dateWindow(value, now = new Date()) {
  const key = normalizeDateKey(value, now);
  const start = parseLocalDateKey(key);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const isToday = key === localDateKey(now);
  const endMs = isToday ? now.getTime() : end.getTime();
  return {
    key,
    isToday,
    startMs: start.getTime(),
    endMs,
    startIso: start.toISOString(),
    endIso: new Date(endMs).toISOString(),
    historyEnd: isToday ? "now" : end.toISOString(),
  };
}

function asDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function dateRangeWindow(startValue, endValue, now = new Date()) {
  const current = asDate(now) || new Date();
  const start = asDate(startValue);
  const suppliedEnd = asDate(endValue);
  if (!start || start.getTime() >= current.getTime()) {
    return dateWindow(localDateKey(current), current);
  }

  let end = suppliedEnd || current;
  if (end.getTime() <= start.getTime()) {
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  }

  const clampedEndMs = Math.min(end.getTime(), current.getTime());
  const effectiveEndMs = clampedEndMs > start.getTime()
    ? clampedEndMs
    : Math.min(start.getTime() + 1, current.getTime());

  return {
    key: `${start.toISOString()}..${end.toISOString()}`,
    isToday:
      localDateKey(start) === localDateKey(current) &&
      effectiveEndMs >= current.getTime(),
    startMs: start.getTime(),
    endMs: effectiveEndMs,
    startIso: start.toISOString(),
    endIso: new Date(effectiveEndMs).toISOString(),
    historyEnd: end.getTime() >= current.getTime()
      ? "now"
      : new Date(effectiveEndMs).toISOString(),
  };
}

function asTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function earliestGeoJsonTime(geojson) {
  if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    return null;
  }
  let earliest = null;
  for (const feature of geojson.features) {
    const properties = feature?.properties;
    if (!properties || typeof properties !== "object") continue;
    for (const value of [properties.start_time, properties.end_time]) {
      const timestamp = asTime(value);
      if (timestamp === null) continue;
      if (earliest === null || timestamp < earliest) earliest = timestamp;
    }
  }
  return earliest;
}

export function featureOverlapsWindow(feature, window) {
  const properties = feature?.properties;
  if (!properties || typeof properties !== "object") return false;
  const start = asTime(properties.start_time);
  const end = asTime(properties.end_time);
  if (start === null && end === null) return false;
  const first = start ?? end;
  const last = end ?? start;
  return last >= window.startMs && first < window.endMs;
}

export function filterGeoJsonByWindow(geojson, window) {
  if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    ...geojson,
    features: geojson.features.filter((feature) => featureOverlapsWindow(feature, window)),
  };
}
