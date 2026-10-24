import { GUAVIARE_BBOX, isInsideGuaviare } from './guaviare-boundary.js';

export interface FireHotspot {
  id: string;
  source: string;
  inGuaviare: boolean;
  lat: number;
  lon: number;
  acqDate: string;
  acqTime: string;
  timestamp: string;
  localTime: string;
  confidence: 'l' | 'n' | 'h';
  frp: number;
  satellite: string;
}

export const FIRMS_DAY_RANGE = 5;
const FIRMS_SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'] as const;
const DEDUPLICATION_COORDINATE_DELTA = 0.005;
const DEDUPLICATION_TIME_WINDOW_MS = 2 * 60 * 60 * 1000;
const MAX_NOTIFY_WINDOW_HOURS = 48;

export interface DailyCount {
  date: string;
  inside: number;
  outside: number;
}

export interface FirmsHotspotsResult {
  hotspots: FireHotspot[];
  last5DaysCount: number;
  last5DaysCountAll: number;
  lastDetection: string | null;
  dailyCounts: DailyCount[];
}

export function getNotifyWindowHours(): number {
  const configuredHours = process.env.NOTIFY_WINDOW_HOURS;
  if (configuredHours === undefined || configuredHours.trim() === '') return 6;

  const hours = Number(configuredHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error('NOTIFY_WINDOW_HOURS debe ser un número mayor que cero.');
  }
  return Math.min(hours, MAX_NOTIFY_WINDOW_HOURS);
}

function splitCsvRow(row: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"') {
      if (quoted && row[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function isConfidence(value: string): value is FireHotspot['confidence'] {
  return value === 'l' || value === 'n' || value === 'h';
}

export function parseFirmsCsv(csv: string, source: string): FireHotspot[] {
  const content = csv.trim();
  if (!content) throw new Error('NASA FIRMS devolvió una respuesta vacía.');
  const rows = content.split(/\r?\n/);

  const headers = splitCsvRow(rows[0].replace(/^\uFEFF/, '')).map((header) => header.trim());
  const column = (name: string) => headers.indexOf(name);
  const requiredColumns = ['latitude', 'longitude', 'acq_date', 'acq_time', 'confidence', 'frp', 'satellite'];
  if (requiredColumns.some((header) => column(header) < 0)) {
    throw new Error('La respuesta de NASA FIRMS no contiene las columnas esperadas.');
  }
  if (rows.length < 2) return [];

  const hotspots: FireHotspot[] = [];
  for (const row of rows.slice(1)) {
    if (!row.trim()) continue;
    const values = splitCsvRow(row);
    const lat = Number(values[column('latitude')]);
    const lon = Number(values[column('longitude')]);
    const acqDate = values[column('acq_date')]?.trim();
    const acqTime = (values[column('acq_time')] ?? '').trim().padStart(4, '0');
    const confidenceValue = (values[column('confidence')] ?? '').trim().toLowerCase();
    const frp = Number(values[column('frp')]);
    const satellite = (values[column('satellite')] ?? '').trim();

    if (
      !Number.isFinite(lat) || !Number.isFinite(lon) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(acqDate ?? '') ||
      !/^\d{4}$/.test(acqTime) ||
      !isConfidence(confidenceValue) ||
      !Number.isFinite(frp) || !satellite
    ) {
      continue;
    }

    const timestamp = new Date(`${acqDate}T${acqTime.slice(0, 2)}:${acqTime.slice(2)}:00Z`);
    if (Number.isNaN(timestamp.getTime())) continue;
    const localTime = new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Bogota',
    }).format(timestamp);
    const stableLat = lat.toFixed(5);
    const stableLon = lon.toFixed(5);

    hotspots.push({
      id: `${source.toLowerCase()}-${stableLat}-${stableLon}-${acqDate}-${acqTime}`,
      source,
      inGuaviare: isInsideGuaviare(lat, lon),
      lat,
      lon,
      acqDate,
      acqTime,
      timestamp: timestamp.toISOString(),
      localTime,
      confidence: confidenceValue,
      frp,
      satellite,
    });
  }
  return hotspots;
}

function deduplicateHotspots(hotspots: FireHotspot[]): FireHotspot[] {
  const strongestFirst = [...hotspots].sort((first, second) => second.frp - first.frp);
  const unique: FireHotspot[] = [];

  for (const hotspot of strongestFirst) {
    const duplicate = unique.some((kept) =>
      kept.source !== hotspot.source &&
      Math.abs(kept.lat - hotspot.lat) < DEDUPLICATION_COORDINATE_DELTA &&
      Math.abs(kept.lon - hotspot.lon) < DEDUPLICATION_COORDINATE_DELTA &&
      Math.abs(Date.parse(kept.timestamp) - Date.parse(hotspot.timestamp)) < DEDUPLICATION_TIME_WINDOW_MS
    );
    if (!duplicate) unique.push(hotspot);
  }

  return unique;
}

async function fetchFirmsSource(
  source: typeof FIRMS_SOURCES[number],
  mapKey: string,
  dayRange: number
): Promise<FireHotspot[]> {
  const { west, south, east, north } = GUAVIARE_BBOX;
  const url =
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}` +
    `/${source}/${west},${south},${east},${north}/${dayRange}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`NASA FIRMS ${source} respondió con estado ${response.status}.`);
  }
  return parseFirmsCsv(await response.text(), source);
}

function logSourceFailure(error: unknown, mapKey: string, source: string): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[NASA FIRMS ${source}]`, mapKey ? message.replaceAll(mapKey, '[redacted]') : message);
}

export async function fetchFirmsHotspots(windowHours = 24): Promise<FirmsHotspotsResult> {
  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) throw new Error('FIRMS_MAP_KEY no está configurada.');

  const queryDayRange = Math.max(FIRMS_DAY_RANGE, Math.ceil(windowHours / 24));
  const sourceResults = await Promise.all(FIRMS_SOURCES.map(async (source) => {
    try {
      return await fetchFirmsSource(source, mapKey, queryDayRange);
    } catch (error) {
      logSourceFailure(error, mapKey, source);
      return null;
    }
  }));
  const availableSources = sourceResults.filter((result) => result !== null);
  if (availableSources.length === 0) {
    throw new Error('NASA FIRMS no pudo responder desde ninguna fuente VIIRS.');
  }

  const now = Date.now();
  const fiveDayWindowMilliseconds = FIRMS_DAY_RANGE * 24 * 60 * 60 * 1000;
  const fetchedHotspots = availableSources.flat();
  const fiveDayHotspots = deduplicateHotspots(
    fetchedHotspots.filter((hotspot) => {
      const age = now - Date.parse(hotspot.timestamp);
      return age >= 0 && age <= fiveDayWindowMilliseconds;
    })
  );
  const fiveDayHotspotsInGuaviare = fiveDayHotspots.filter((hotspot) => hotspot.inGuaviare);
  const windowMilliseconds = Math.max(0, windowHours) * 60 * 60 * 1000;
  const filteredHotspots = fiveDayHotspots.filter((hotspot) => {
    const age = now - Date.parse(hotspot.timestamp);
    return age >= 0 && age <= windowMilliseconds;
  });
  const lastDetection = fiveDayHotspotsInGuaviare.reduce<string | null>((latest, hotspot) =>
    latest === null || Date.parse(hotspot.timestamp) > Date.parse(latest)
    ? hotspot.timestamp
    : latest,
  null);

  const dailyCountsMap = new Map<string, { inside: number; outside: number }>();
  for (const hotspot of fiveDayHotspots) {
    const key = hotspot.acqDate;
    const entry = dailyCountsMap.get(key) ?? { inside: 0, outside: 0 };
    if (hotspot.inGuaviare) {
      entry.inside += 1;
    } else {
      entry.outside += 1;
    }
    dailyCountsMap.set(key, entry);
  }

  const dailyCounts: DailyCount[] = [];
  for (let i = FIRMS_DAY_RANGE - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - i));
    const dateKey = date.toISOString().slice(0, 10);
    const entry = dailyCountsMap.get(dateKey) ?? { inside: 0, outside: 0 };
    dailyCounts.push({ date: dateKey, inside: entry.inside, outside: entry.outside });
  }

  console.log(
    '[NASA FIRMS] Sources available:',
    availableSources.length,
    'hotspots returned:',
    fetchedHotspots.length,
    'unique hotspots in 5 days:',
    fiveDayHotspots.length,
    'inside Guaviare:',
    fiveDayHotspotsInGuaviare.length,
    'hotspots passing requested window:',
    filteredHotspots.length
  );

  return {
    hotspots: filteredHotspots,
    last5DaysCount: fiveDayHotspotsInGuaviare.length,
    last5DaysCountAll: fiveDayHotspots.length,
    lastDetection,
    dailyCounts,
  };
}
