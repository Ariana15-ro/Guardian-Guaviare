import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getNotifyWindowHours, GUAVIARE_BOUNDS } from './_lib/firms.js';

const CHECK_TIMEOUT_MS = 10_000;
const FIRMS_REQUIRED_COLUMNS = [
  'latitude',
  'longitude',
  'acq_date',
  'acq_time',
  'confidence',
  'frp',
  'satellite',
];

interface HealthChecks {
  firms: boolean;
  supabase: boolean;
  config: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function checkFirms(): Promise<void> {
  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) throw new Error('FIRMS health check failed: API key is not configured.');

  const { west, south, east, north } = GUAVIARE_BOUNDS;
  const url =
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}` +
    `/VIIRS_SNPP_NRT/${west},${south},${east},${north}/1`;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
  } catch {
    throw new Error('FIRMS health check failed: request was unsuccessful.');
  }

  if (!response.ok) {
    throw new Error(`FIRMS health check failed: HTTP ${response.status}.`);
  }

  let csv: string;
  try {
    csv = await response.text();
  } catch {
    throw new Error('FIRMS health check failed: response could not be read.');
  }
  const header = csv.trim().split(/\r?\n/, 1)[0]?.replace(/^\uFEFF/, '');
  const columns = new Set((header ?? '').split(',').map((column) => column.trim()));
  if (FIRMS_REQUIRED_COLUMNS.some((column) => !columns.has(column))) {
    throw new Error('FIRMS health check failed: expected CSV columns were not found.');
  }
}

async function checkSupabase(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase health check failed: server configuration is missing.');
  }

  let response: Response;
  try {
    response = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/rest/v1/notified_hotspots?select=id&limit=1`,
      {
        method: 'GET',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      }
    );
  } catch {
    throw new Error('Supabase health check failed: request was unsuccessful.');
  }

  if (!response.ok) {
    throw new Error(`Supabase health check failed: HTTP ${response.status}.`);
  }
}

function checkConfig(): void {
  if (
    !process.env.NTFY_TOPIC ||
    !process.env.CRON_SECRET ||
    !process.env.DASHBOARD_URL
  ) {
    throw new Error('Notification configuration is incomplete.');
  }

  try {
    getNotifyWindowHours();
  } catch {
    throw new Error('Notification window configuration is invalid.');
  }
}

async function runCheck(check: () => Promise<void> | void): Promise<boolean> {
  try {
    await check();
    return true;
  } catch (error) {
    console.error(errorMessage(error));
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'public, s-maxage=60');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Método no permitido. Usa GET.' });
    return;
  }

  const [firms, supabase, config] = await Promise.all([
    runCheck(checkFirms),
    runCheck(checkSupabase),
    runCheck(checkConfig),
  ]);
  const checks: HealthChecks = { firms, supabase, config };
  const ok = firms && supabase && config;

  res.status(ok ? 200 : 503).json({
    ok,
    checks,
    checkedAt: new Date().toISOString(),
  });
}
