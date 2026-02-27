export type LocationLatLng = {
  lat: number;
  lng: number;
};

export const IRAN_BOUNDS: [[number, number], [number, number]] = [
  [24.0, 44.0],
  [40.8, 63.5],
];

export const IRAN_CENTER: [number, number] = [32.4279, 53.688];

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;

const normalizeDigitsToEnglish = (raw: string): string =>
  raw
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

const safeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = normalizeDigitsToEnglish(String(value)).trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isValidLatLng = (lat: number, lng: number): boolean =>
  lat >= MIN_LAT && lat <= MAX_LAT && lng >= MIN_LNG && lng <= MAX_LNG;

const fromObject = (value: Record<string, unknown>): LocationLatLng | null => {
  const lat = safeNumber(value.lat ?? value.latitude);
  const lng = safeNumber(value.lng ?? value.lon ?? value.long ?? value.longitude);
  if (lat === null || lng === null) return null;
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
};

const fromCommaPair = (value: string): LocationLatLng | null => {
  const normalized = normalizeDigitsToEnglish(value);
  const match = normalized.match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
};

const fromMapUrl = (raw: string): LocationLatLng | null => {
  const normalized = normalizeDigitsToEnglish(raw);

  const atMatch = normalized.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  try {
    const url = new URL(normalized);
    const pairParams = ['q', 'll', 'center'];
    for (const param of pairParams) {
      const val = url.searchParams.get(param);
      if (!val) continue;
      const parsed = fromCommaPair(val);
      if (parsed) return parsed;
    }

    const lat = safeNumber(url.searchParams.get('lat') ?? url.searchParams.get('latitude'));
    const lng = safeNumber(url.searchParams.get('lng') ?? url.searchParams.get('lon') ?? url.searchParams.get('longitude'));
    if (lat !== null && lng !== null && isValidLatLng(lat, lng)) {
      return { lat, lng };
    }
  } catch {
    return null;
  }

  return null;
};

export const parseLocationValue = (value: unknown): LocationLatLng | null => {
  if (value === null || value === undefined) return null;

  if (typeof value === 'object' && !Array.isArray(value)) {
    return fromObject(value as Record<string, unknown>);
  }

  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return fromObject(parsed as Record<string, unknown>);
      }
    } catch {
      // Ignore invalid JSON and continue parsing with other strategies.
    }
  }

  return fromCommaPair(raw) || fromMapUrl(raw);
};

export const formatLocationValue = (latLng: LocationLatLng, precision = 6): string =>
  `${latLng.lat.toFixed(precision)}, ${latLng.lng.toFixed(precision)}`;

export const isInsideIran = (latLng: LocationLatLng): boolean => {
  const [[minLat, minLng], [maxLat, maxLng]] = IRAN_BOUNDS;
  return latLng.lat >= minLat && latLng.lat <= maxLat && latLng.lng >= minLng && latLng.lng <= maxLng;
};
