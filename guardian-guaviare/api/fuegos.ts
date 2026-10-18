import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchFirmsHotspots } from './_lib/firms.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Método no permitido. Usa GET.' });
      return;
    }

    const hotspots = await fetchFirmsHotspots();
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
    res.status(200).json({ source: 'NASA FIRMS (VIIRS)', fetchedAt: new Date().toISOString(), hotspots });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: 'No fue posible consultar los focos de calor.' });
  }
}
