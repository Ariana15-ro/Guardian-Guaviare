import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchFirmsHotspots, getNotifyWindowHours, type FireHotspot } from './_lib/firms.js';

const MAX_NOTIFICATIONS = 5;
const GRID_SIZE_DEGREES = 0.05;
const MUNICIPALITIES = [
  { name: 'San José del Guaviare', lat: 2.5728, lon: -72.6459 },
  { name: 'Calamar', lat: 1.9597, lon: -72.6531 },
  { name: 'El Retorno', lat: 2.3303, lon: -72.6278 },
  { name: 'Miraflores', lat: 1.3361, lon: -71.9511 },
];

interface HotspotGroup {
  key: string;
  hotspots: FireHotspot[];
}

function getNotifyMinFrp(): number {
  const configuredFrp = process.env.NOTIFY_MIN_FRP;
  if (configuredFrp === undefined || configuredFrp.trim() === '') return 0.4;

  const minimumFrp = Number(configuredFrp);
  if (!Number.isFinite(minimumFrp) || minimumFrp < 0) {
    throw new Error('NOTIFY_MIN_FRP debe ser un número no negativo.');
  }
  return minimumFrp;
}

function authorizationHeader(req: VercelRequest): string | undefined {
  const header = req.headers.authorization ?? req.headers.Authorization;
  return Array.isArray(header) ? header[0] : header;
}

function hasValidAuthorization(header: string | undefined, secret: string): boolean {
  if (!header) return false;

  const provided = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function isRecent(hotspot: FireHotspot, now: number, windowHours: number): boolean {
  const age = now - Date.parse(hotspot.timestamp);
  return age >= 0 && age <= windowHours * 60 * 60 * 1000;
}

function groupHotspots(hotspots: FireHotspot[]): HotspotGroup[] {
  const groups = new Map<string, HotspotGroup>();

  for (const hotspot of hotspots) {
    const latitudeCell = Math.floor(hotspot.lat / GRID_SIZE_DEGREES);
    const longitudeCell = Math.floor(hotspot.lon / GRID_SIZE_DEGREES);
    const utcDate = hotspot.timestamp.slice(0, 10);
    const key = `cell-${latitudeCell}-${longitudeCell}-${utcDate}`;
    const group = groups.get(key);

    if (group) {
      group.hotspots.push(hotspot);
    } else {
      groups.set(key, { key, hotspots: [hotspot] });
    }
  }

  return [...groups.values()];
}

function nearestPlace(hotspots: FireHotspot[]): string {
  const center = hotspots.reduce(
    (sum, hotspot) => ({ lat: sum.lat + hotspot.lat, lon: sum.lon + hotspot.lon }),
    { lat: 0, lon: 0 }
  );
  center.lat /= hotspots.length;
  center.lon /= hotspots.length;

  const nearest = MUNICIPALITIES.reduce((closest, municipality) => {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = toRadians(municipality.lat - center.lat);
    const longitudeDelta = toRadians(municipality.lon - center.lon);
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(toRadians(center.lat)) *
        Math.cos(toRadians(municipality.lat)) *
        Math.sin(longitudeDelta / 2) ** 2;
    const distance = 2 * 6371 * Math.asin(Math.sqrt(haversine));

    return distance < closest.distance ? { name: municipality.name, distance } : closest;
  }, { name: '', distance: Number.POSITIVE_INFINITY });

  if (nearest.distance > 80) {
    return 'zona de influencia, a más de 80 km de cualquier cabecera del Guaviare';
  }
  return `a ~${Math.round(nearest.distance)} km de ${nearest.name}`;
}

function highestConfidence(hotspots: FireHotspot[]): FireHotspot['confidence'] {
  if (hotspots.some((hotspot) => hotspot.confidence === 'h')) return 'h';
  return hotspots.some((hotspot) => hotspot.confidence === 'n') ? 'n' : 'l';
}

function formatConfidence(confidence: FireHotspot['confidence']): string {
  return confidence === 'h' ? 'alta' : confidence === 'n' ? 'nominal' : 'baja';
}

async function checkSupabaseAvailability(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase environment variables are not configured.');
  }

  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/notified_hotspots?select=id&limit=1`,
    {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok) {
    throw new Error(`Supabase REST responded with status ${response.status}.`);
  }
}

async function findNewGroupsWithSupabase(groups: HotspotGroup[]): Promise<HotspotGroup[]> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase environment variables are not configured.');
  }
  if (groups.length === 0) return [];

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/notified_hotspots`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(groups.map(({ key }) => ({ id: key }))),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Supabase REST responded with status ${response.status}.`);
  }

  const insertedRows = (await response.json()) as { id: string }[];
  if (!Array.isArray(insertedRows) || insertedRows.some((row) => typeof row?.id !== 'string')) {
    throw new Error('Supabase REST returned an invalid representation.');
  }

  const insertedIds = new Set(insertedRows.map((row) => row.id));
  return groups.filter((group) => insertedIds.has(group.key));
}

async function releaseClaimedGroups(groups: HotspotGroup[]): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey || groups.length === 0) return;

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/notified_hotspots`;
  const chunkSize = 100;

  for (let offset = 0; offset < groups.length; offset += chunkSize) {
    const ids = groups.slice(offset, offset + chunkSize).map(({ key }) => key);
    const url = new URL(endpoint);
    url.searchParams.set('id', `in.(${ids.join(',')})`);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: 'return=minimal',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Supabase REST delete responded with status ${response.status}.`);
    }
  }
}

async function publish(group: HotspotGroup): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  const dashboardUrl = process.env.DASHBOARD_URL;
  if (!topic || !dashboardUrl) {
    throw new Error('NTFY_TOPIC y DASHBOARD_URL deben estar configuradas.');
  }

  const latestHotspot = group.hotspots.reduce((latest, hotspot) =>
    Date.parse(hotspot.timestamp) > Date.parse(latest.timestamp) ? hotspot : latest
  );
  const confidence = highestConfidence(group.hotspots);
  const totalFrp = group.hotspots.reduce((total, hotspot) => total + hotspot.frp, 0);
  const message =
    `${group.hotspots.length} focos de calor ${nearestPlace(group.hotspots)} · ` +
    `confianza ${formatConfidence(confidence)} · más reciente: ${latestHotspot.localTime} (Bogotá) · ` +
    `FRP total: ${totalFrp.toFixed(1)} MW. Detección satelital, no confirmada.`;

  let click: string;
  try {
    const url = new URL(dashboardUrl);
    url.searchParams.set('foco', latestHotspot.id);
    click = url.toString();
  } catch {
    throw new Error('DASHBOARD_URL debe ser una URL absoluta válida.');
  }

  const response = await fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      topic,
      title: 'Foco de calor en la zona de influencia del Guaviare',
      message,
      priority: confidence === 'h' ? 5 : 4,
      tags: ['fire', 'warning'],
      click,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`ntfy respondió con estado ${response.status}.`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'Método no permitido. Usa GET o POST.' });
      return;
    }

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      res.status(500).json({ error: 'CRON_SECRET no está configurada.' });
      return;
    }
    if (!hasValidAuthorization(authorizationHeader(req), cronSecret)) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    try {
      await checkSupabaseAvailability();
    } catch (error) {
      console.error(errorMessage(error));
      res.status(503).json({
        error: 'El servicio de deduplicación no está disponible.',
        deduplication: 'no-disponible',
      });
      return;
    }

    if (!process.env.NTFY_TOPIC || !process.env.DASHBOARD_URL) {
      res.status(500).json({ error: 'NTFY_TOPIC y DASHBOARD_URL deben estar configuradas.' });
      return;
    }

    const notifyWindowHours = getNotifyWindowHours();
    const minimumFrp = getNotifyMinFrp();
    const firmsResult = await fetchFirmsHotspots(notifyWindowHours);
    const allHotspots = firmsResult.hotspots;
    const now = Date.now();
    const eligible = allHotspots.filter(
      (hotspot) =>
        hotspot.inGuaviare &&
        (hotspot.confidence === 'n' || hotspot.confidence === 'h') &&
        hotspot.frp >= minimumFrp &&
        isRecent(hotspot, now, notifyWindowHours)
    );

    const candidateGroups = groupHotspots(eligible);
    let newGroups: HotspotGroup[];
    try {
      newGroups = await findNewGroupsWithSupabase(candidateGroups);
    } catch (error) {
      console.error(errorMessage(error));
      res.status(503).json({
        error: 'El servicio de deduplicación no está disponible.',
        deduplication: 'no-disponible',
      });
      return;
    }

    let notified = 0;
    let notificationsSent = 0;

    for (let index = 0; index < newGroups.length; index += 1) {
      const group = newGroups[index];
      if (!group) continue;

      if (notificationsSent >= MAX_NOTIFICATIONS) {
        try {
          await releaseClaimedGroups(newGroups.slice(index));
        } catch (error) {
          console.error(errorMessage(error));
          res.status(500).json({ error: 'No fue posible completar el proceso de notificación.' });
          return;
        }
        break;
      }

      try {
        await publish(group);
        notificationsSent += 1;
        notified += group.hotspots.length;
      } catch (error) {
        try {
          await releaseClaimedGroups(newGroups.slice(index));
        } catch (cleanupError) {
          console.error(errorMessage(cleanupError));
        }
        throw error;
      }
    }

    res.status(200).json({
      notified,
      omitted: Math.max(0, eligible.length - notified),
      notificationsSent,
      fetchedAt: new Date().toISOString(),
      deduplication: 'supabase',
    });
  } catch (error) {
    console.error(errorMessage(error));
    res.status(500).json({ error: 'No fue posible completar el proceso de notificación.' });
  }
}
