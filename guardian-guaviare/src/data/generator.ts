import { LiveIndicators, SensorEvent, EventType, Severity } from '../types';

// Coordenadas reales aproximadas del departamento del Guaviare
const MUNICIPALITIES = [
  { name: 'San José del Guaviare', lat: 2.5728, lng: -72.6459 },
  { name: 'Calamar', lat: 1.9597, lng: -72.6531 },
  { name: 'El Retorno', lat: 2.3303, lng: -72.6278 },
  { name: 'Miraflores', lat: 1.3361, lng: -71.9511 },
  { name: 'La Macarena (límite)', lat: 2.1828, lng: -73.7847 },
];

const FIRE_SIMULATION_MUNICIPALITIES = MUNICIPALITIES.slice(0, 4);

// Zonas conocidas de alta presión de deforestación / incendios
const HOTSPOTS = [
  { lat: 2.15, lng: -72.85, weight: 3 },
  { lat: 1.85, lng: -72.40, weight: 2 },
  { lat: 2.45, lng: -72.20, weight: 2 },
  { lat: 1.60, lng: -72.90, weight: 3 },
  { lat: 2.70, lng: -72.50, weight: 1 },
  { lat: 1.40, lng: -72.10, weight: 2 },
];

function randomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAround(center: number, radius: number): number {
  return center + (Math.random() - 0.5) * radius * 2;
}

export function generateFireEvent(): SensorEvent {
  const municipality = randomFrom(FIRE_SIMULATION_MUNICIPALITIES);
  const event = generateEvent('incendio', 'critica');

  return {
    ...event,
    lat: municipality.lat,
    lng: municipality.lng,
    municipality: municipality.name,
    timestamp: new Date().toISOString(),
    title: `Incendio simulado en ${municipality.name}`,
    status: 'activo',
  };
}

function randomStep(value: number, maximumStep: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value + randomAround(0, maximumStep)));
}

export function generateLiveIndicators(previous?: LiveIndicators): LiveIndicators {
  if (!previous) {
    return {
      riverLevel: Math.round((3.8 + Math.random() * 1.1) * 100) / 100,
      heatSpots: 2 + Math.floor(Math.random() * 6),
      deforestationAlerts: 1 + Math.floor(Math.random() * 6),
    };
  }

  return {
    riverLevel: Math.round(randomStep(previous.riverLevel, 0.12, 3.2, 6.4) * 100) / 100,
    heatSpots: Math.round(randomStep(previous.heatSpots, 1, 0, 30)),
    deforestationAlerts: Math.round(randomStep(previous.deforestationAlerts, 1, 0, 30)),
  };
}

function generateTitle(type: EventType, mun: string): string {
  const titles: Record<EventType, string[]> = {
    deforestacion: [
      `Pérdida de cobertura detectada cerca de ${mun}`,
      `Tala ilegal reportada en zona de ${mun}`,
      `Cambio de uso de suelo en ${mun}`,
      `Apertura de vía ilegal detectada`,
    ],
    incendio: [
      `Punto de calor activo cerca de ${mun}`,
      `Incendio forestal en progreso`,
      `Foco de calor de alta intensidad`,
      `Quema detectada en área protegida`,
    ],
    nivel_rio: [
      `Nivel del río elevado en estación ${mun}`,
      `Creciente reportada en afluente`,
      `Nivel crítico del río Guaviare`,
      `Alerta hidrológica en ${mun}`,
    ],
  };
  return randomFrom(titles[type]);
}

function generateDescription(type: EventType, value: number): string {
  if (type === 'deforestacion') {
    return `Se estima una pérdida de aproximadamente ${value.toFixed(1)} hectáreas de cobertura boscosa. Confianza del sensor: ${(70 + Math.random() * 25).toFixed(0)}%.`;
  }
  if (type === 'incendio') {
    return `Temperatura detectada: ${value.toFixed(0)}°C. Área aproximada afectada: ${(value / 8).toFixed(1)} ha. Viento predominante desde el este.`;
  }
  return `Nivel actual: ${value.toFixed(2)} m. Umbral de alerta: 4.80 m. Tendencia: ${value > 5.2 ? 'ascendente' : 'estable'}.`;
}

function pickSeverity(): Severity {
  const r = Math.random();
  if (r < 0.35) return 'baja';
  if (r < 0.65) return 'media';
  if (r < 0.88) return 'alta';
  return 'critica';
}

function pickType(): EventType {
  const r = Math.random();
  if (r < 0.42) return 'deforestacion';
  if (r < 0.78) return 'incendio';
  return 'nivel_rio';
}

export function generateEvent(forceType?: EventType, forceSeverity?: Severity): SensorEvent {
  const type = forceType ?? pickType();
  const severity = forceSeverity ?? pickSeverity();
  const mun = randomFrom(MUNICIPALITIES);

  // Prefer hotspots for higher severity
  let lat: number, lng: number;
  if (severity === 'alta' || severity === 'critica' || Math.random() > 0.4) {
    const hotspot = randomFrom(HOTSPOTS);
    lat = randomAround(hotspot.lat, 0.18);
    lng = randomAround(hotspot.lng, 0.22);
  } else {
    lat = randomAround(mun.lat, 0.35);
    lng = randomAround(mun.lng, 0.40);
  }

  let value: number;
  if (type === 'deforestacion') {
    value = severity === 'critica' ? 15 + Math.random() * 40 :
            severity === 'alta' ? 5 + Math.random() * 15 :
            severity === 'media' ? 1 + Math.random() * 6 : 0.3 + Math.random() * 2;
  } else if (type === 'incendio') {
    value = severity === 'critica' ? 280 + Math.random() * 120 :
            severity === 'alta' ? 180 + Math.random() * 100 :
            severity === 'media' ? 90 + Math.random() * 90 : 50 + Math.random() * 50;
  } else {
    value = severity === 'critica' ? 5.8 + Math.random() * 1.4 :
            severity === 'alta' ? 5.1 + Math.random() * 0.7 :
            severity === 'media' ? 4.4 + Math.random() * 0.7 : 3.6 + Math.random() * 0.8;
  }

  const hoursAgo = Math.floor(Math.random() * 72);
  const timestamp = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

  return {
    id: randomId(),
    type,
    severity,
    lat,
    lng,
    title: generateTitle(type, mun.name),
    description: generateDescription(type, value),
    timestamp,
    value: Math.round(value * 100) / 100,
    municipality: mun.name,
    status: Math.random() > 0.25 ? 'activo' : (Math.random() > 0.5 ? 'en_monitoreo' : 'resuelto'),
    source: 'simulated',
  };
}

export function generateInitialEvents(count = 48): SensorEvent[] {
  const events: SensorEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push(generateEvent());
  }
  // Sort by timestamp descending
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function generateRealisticBurst(type: EventType, count = 3): SensorEvent[] {
  return Array.from({ length: count }, () => generateEvent(type, randomFrom(['alta', 'critica'] as Severity[])));
}
