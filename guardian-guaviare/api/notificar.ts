import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchFirmsHotspots, getNotifyWindowHours, type FireHotspot } from './_lib/firms.js';

interface NotificationClaim {
  hotspots: FireHotspot[];
  keys: string[];
}

const memoryNotified = new Set<string>();
const memoryPending = new Set<string>();
const REDIS_TTL_SECONDS = 86_400;
const MAX_NOTIFICATIONS = 5;
const INDIVIDUAL_NOTIFICATIONS = MAX_NOTIFICATIONS - 1;

function authorizationHeader(req: VercelRequest): string | undefined {
  const header = req.headers.authorization ?? req.headers.Authorization;
  return Array.isArray(header) ? header[0] : header;
}

function isRecent(hotspot: FireHotspot, now: number, windowHours: number): boolean {
  const age = now - Date.parse(hotspot.timestamp);
  return age >= 0 && age <= windowHours * 60 * 60 * 1000;
}

async function redisCommand(...parts: string[]): Promise<unknown> {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!baseUrl || !token) throw new Error('La configuración de Upstash está incompleta.');

  const path = parts.map((part) => encodeURIComponent(part)).join('/');
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Upstash respondió con estado ${response.status}.`);
  const result = await response.json() as { result?: unknown; error?: string };
  if (result.error) throw new Error(`Upstash: ${result.error}`);
  return result.result;
}

async function claimHotspots(hotspots: FireHotspot[]): Promise<NotificationClaim> {
  const useRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const claimed: NotificationClaim = { hotspots: [], keys: [] };
  try {
    for (const hotspot of hotspots) {
      const key = `guardian-guaviare:fire:${hotspot.id}`;
      if (useRedis) {
        const result = await redisCommand('set', key, '1', 'EX', String(REDIS_TTL_SECONDS), 'NX');
        if (result === 'OK') {
          claimed.hotspots.push(hotspot);
          claimed.keys.push(key);
        }
      } else if (!memoryNotified.has(hotspot.id) && !memoryPending.has(hotspot.id)) {
        memoryPending.add(hotspot.id);
        claimed.hotspots.push(hotspot);
        claimed.keys.push(key);
      }
    }
  } catch (error) {
    await releaseClaims(claimed);
    throw error;
  }
  return claimed;
}

async function releaseClaims(claim: NotificationClaim): Promise<void> {
  const useRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  if (useRedis) {
    for (const key of claim.keys) await redisCommand('del', key);
  } else {
    claim.hotspots.forEach((hotspot) => memoryPending.delete(hotspot.id));
  }
}

function nearestPlace(hotspot: FireHotspot): string {
  const municipalities = [
    { name: 'San José del Guaviare', lat: 2.5728, lon: -72.6459 },
    { name: 'Calamar', lat: 1.9597, lon: -72.6531 },
    { name: 'El Retorno', lat: 2.3303, lon: -72.6278 },
    { name: 'Miraflores', lat: 1.3361, lon: -71.9511 },
  ];
  return municipalities.reduce((nearest, current) => {
    const currentDistance = (current.lat - hotspot.lat) ** 2 + (current.lon - hotspot.lon) ** 2;
    const nearestDistance = (nearest.lat - hotspot.lat) ** 2 + (nearest.lon - hotspot.lon) ** 2;
    return currentDistance < nearestDistance ? current : nearest;
  }).name;
}

async function publish(hotspots: FireHotspot[], summary: boolean): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  const dashboardUrl = process.env.DASHBOARD_URL;
  if (!topic || !dashboardUrl) throw new Error('NTFY_TOPIC y DASHBOARD_URL deben estar configuradas.');

  let click: string;
  try {
    const url = new URL(dashboardUrl);
    url.searchParams.set('foco', hotspots[0].id);
    click = url.toString();
  } catch {
    throw new Error('DASHBOARD_URL debe ser una URL absoluta válida.');
  }

  const confidenceLabel = (confidence: FireHotspot['confidence']) =>
    confidence === 'h' ? 'alta' : confidence === 'n' ? 'nominal' : 'baja';
  const hotspotMessage = summary
    ? `${hotspots.length} focos nuevos: ${hotspots.slice(0, 10).map((hotspot) =>
      `${nearestPlace(hotspot)} (${hotspot.localTime}, confianza ${confidenceLabel(hotspot.confidence)}, FRP ${hotspot.frp} MW)`
    ).join('; ')}${hotspots.length > 10 ? '; y más' : ''}.`
    : `${nearestPlace(hotspots[0])} · ${hotspots[0].localTime} (Bogotá) · confianza ${confidenceLabel(hotspots[0].confidence)} · FRP ${hotspots[0].frp} MW.`;
  const message = `${hotspotMessage} Detección satelital, no confirmada.`;

  const response = await fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      topic,
      title: summary ? `${hotspots.length} focos nuevos en Guaviare` : 'Nuevo foco de calor en Guaviare',
      message,
      priority: summary || hotspots.some((hotspot) => hotspot.confidence === 'h') ? 5 : 4,
      tags: ['fire', 'warning'],
      click,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`ntfy respondió con estado ${response.status}.`);
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
    if (authorizationHeader(req) !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }
    if (!process.env.NTFY_TOPIC || !process.env.DASHBOARD_URL) {
      res.status(500).json({ error: 'NTFY_TOPIC y DASHBOARD_URL deben estar configuradas.' });
      return;
    }
    if (Boolean(process.env.UPSTASH_REDIS_REST_URL) !== Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)) {
      res.status(500).json({ error: 'Configura UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN juntas, o deja ambas vacías.' });
      return;
    }

    const notifyWindowHours = getNotifyWindowHours();
    const allHotspots = await fetchFirmsHotspots();
    const now = Date.now();
    const eligible = allHotspots.filter(
      (hotspot) =>
        (hotspot.confidence === 'n' || hotspot.confidence === 'h') &&
        isRecent(hotspot, now, notifyWindowHours)
    );
    let notified = 0;
    let notificationsSent = 0;
    const groups: FireHotspot[][] = eligible.length > MAX_NOTIFICATIONS
      ? [
        ...eligible.slice(0, INDIVIDUAL_NOTIFICATIONS).map((hotspot) => [hotspot]),
        eligible.slice(INDIVIDUAL_NOTIFICATIONS),
      ]
      : eligible.map((hotspot) => [hotspot]);

    for (const group of groups) {
      const claim = await claimHotspots(group);
      if (!claim.hotspots.length) continue;

      try {
        await publish(claim.hotspots, group.length > 1);
        notificationsSent += 1;
        notified += claim.hotspots.length;
        if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
          claim.hotspots.forEach((hotspot) => {
            memoryPending.delete(hotspot.id);
            memoryNotified.add(hotspot.id);
          });
        }
      } catch (error) {
        await releaseClaims(claim);
        throw error;
      }
    }

    res.status(200).json({
      notified,
      omitted: allHotspots.length - notified,
      notificationsSent,
      fetchedAt: new Date().toISOString(),
      deduplication: process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? 'upstash-24h'
        : 'memoria-mejor-esfuerzo',
    });
  } catch (error) {
    console.error('[api/notificar] Invocation failed:', error);
    res.status(500).json({ error: 'No fue posible completar el proceso de notificación.' });
  }
}
