export interface FireHotspot {
  id: string;
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

export const GUAVIARE_BOUNDS = {
  west: -74.0,
  south: 1.3,
  east: -71.5,
  north: 3.0,
}; // TODO: Este rectángulo es aproximado; se puede reemplazar por filtrado con el polígono del departamento.

export const FIRMS_DAY_RANGE = 2;
const MAX_NOTIFY_WINDOW_HOURS = 48;

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

export function parseFirmsCsv(csv: string): FireHotspot[] {
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
      id: `viirs-${stableLat}-${stableLon}-${acqDate}-${acqTime}`,
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

export async function fetchFirmsHotspots(windowHours = 24): Promise<FireHotspot[]> {
  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) throw new Error('FIRMS_MAP_KEY no está configurada.');

  const dayRange = Math.max(FIRMS_DAY_RANGE, Math.ceil(windowHours / 24));
  const { west, south, east, north } = GUAVIARE_BOUNDS;
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/VIIRS_SNPP_NRT/${west},${south},${east},${north}/${dayRange}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`NASA FIRMS respondió con estado ${response.status}.`);
  }
  const fetchedHotspots = parseFirmsCsv(await response.text());
  const now = Date.now();
  const windowMilliseconds = windowHours * 60 * 60 * 1000;
  const filteredHotspots = fetchedHotspots.filter((hotspot) => {
    const age = now - Date.parse(hotspot.timestamp);
    return age >= 0 && age <= windowMilliseconds;
  });
  console.log('[NASA FIRMS] Hotspots returned:', fetchedHotspots.length, 'passing time window:', filteredHotspots.length);
  return filteredHotspots;
}
