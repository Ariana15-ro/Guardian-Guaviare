import { fetchFirmsHotspots } from './_lib/firms';

interface ApiRequest {
  method?: string;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Método no permitido. Usa GET.' });
    return;
  }

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
  try {
    const hotspots = await fetchFirmsHotspots();
    res.status(200).json({ source: 'NASA FIRMS (VIIRS)', fetchedAt: new Date().toISOString(), hotspots });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al consultar NASA FIRMS.';
    res.status(502).json({ error: `No fue posible consultar NASA FIRMS: ${message}` });
  }
}
