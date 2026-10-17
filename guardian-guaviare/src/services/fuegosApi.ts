export interface FuegoReal {
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

export interface FuegosResponse {
  source: string;
  fetchedAt: string;
  hotspots: FuegoReal[];
}

const RETRY_DELAYS_MS = [1_000, 2_000];

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function fetchFuegos(): Promise<FuegosResponse> {
  let lastError: Error = new Error('No fue posible consultar los focos.');
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch('/api/fuegos', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      const payload = await response.json() as FuegosResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : `La API respondió con estado ${response.status}.`);
      }
      if (!('hotspots' in payload) || !Array.isArray(payload.hotspots) || !payload.fetchedAt) {
        throw new Error('La respuesta de la API de incendios tiene un formato inválido.');
      }
      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Error de conexión con NASA FIRMS.');
      if (attempt < RETRY_DELAYS_MS.length) await delay(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}
