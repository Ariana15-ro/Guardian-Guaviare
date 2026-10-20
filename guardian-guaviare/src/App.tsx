import { lazy, Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { SensorEvent, AlertLog, EventType, Severity, DashboardStats, LiveIndicators as LiveIndicatorValues } from './types';
import { generateInitialEvents, generateEvent, generateFireEvent, generateLiveIndicators, generateRealisticBurst } from './data/generator';
import { StatsCards } from './components/StatsCards';
import { LiveIndicators } from './components/LiveIndicators';
import { AlertHistory } from './components/AlertHistory';
import { EventList } from './components/EventList';
import { MapView } from './components/MapView';
import { Filters } from './components/Filters';
import { AlertModal } from './components/AlertModal';
import { AlertLogPanel } from './components/AlertLogPanel';
import { Flame, TreePine, Waves, Activity, RotateCcw, Volume2, Filter } from 'lucide-react';
import { fetchFuegos, type FuegoReal } from './services/fuegosApi';

const TrendCharts = lazy(() =>
  import('./components/TrendCharts').then((module) => ({ default: module.TrendCharts }))
);
const Charts = lazy(() =>
  import('./components/Charts').then((module) => ({ default: module.Charts }))
);

interface TrendReading {
  timestamp: number;
  riverLevel: number;
  heatSpots: number;
}

interface LiveDashboardState {
  indicators: LiveIndicatorValues;
  readings: TrendReading[];
}

type DataMode = 'real' | 'demo';

const MUNICIPALITIES = [
  { name: 'San José del Guaviare', lat: 2.5728, lon: -72.6459 },
  { name: 'Calamar', lat: 1.9597, lon: -72.6531 },
  { name: 'El Retorno', lat: 2.3303, lon: -72.6278 },
  { name: 'Miraflores', lat: 1.3361, lon: -71.9511 },
];

const HISTORICAL_FOCOS: Pick<
  FuegoReal,
  'id' | 'lat' | 'lon' | 'timestamp' | 'localTime' | 'confidence' | 'frp' | 'satellite'
>[] = [
  { id: 'viirs-2.93185--72.43925-2026-10-17-1834', lat: 2.93185, lon: -72.43925, timestamp: '2026-10-17T18:34:00.000Z', localTime: '17/10/2026, 13:34', confidence: 'n', frp: 2.38, satellite: 'VIIRS' },
  { id: 'viirs-2.97804--72.29705-2026-10-17-1834', lat: 2.97804, lon: -72.29705, timestamp: '2026-10-17T18:34:00.000Z', localTime: '17/10/2026, 13:34', confidence: 'n', frp: 2.23, satellite: 'VIIRS' },
  { id: 'viirs-2.97862--72.29320-2026-10-17-1834', lat: 2.97862, lon: -72.29320, timestamp: '2026-10-17T18:34:00.000Z', localTime: '17/10/2026, 13:34', confidence: 'n', frp: 4.01, satellite: 'VIIRS' },
  { id: 'viirs-2.98212--72.29372-2026-10-17-1834', lat: 2.98212, lon: -72.29372, timestamp: '2026-10-17T18:34:00.000Z', localTime: '17/10/2026, 13:34', confidence: 'n', frp: 3.78, satellite: 'VIIRS' },
];

function toFireEvent(fire: FuegoReal): SensorEvent {
  const municipality = MUNICIPALITIES.reduce((nearest, current) => {
    const currentDistance = (current.lat - fire.lat) ** 2 + (current.lon - fire.lon) ** 2;
    const nearestDistance = (nearest.lat - fire.lat) ** 2 + (nearest.lon - fire.lon) ** 2;
    return currentDistance < nearestDistance ? current : nearest;
  }).name;
  const confidenceLabel = fire.confidence === 'h' ? 'alta' : fire.confidence === 'n' ? 'nominal' : 'baja';

  return {
    id: fire.id,
    type: 'incendio',
    severity: fire.confidence === 'h' ? 'critica' : fire.confidence === 'n' ? 'alta' : 'media',
    lat: fire.lat,
    lng: fire.lon,
    title: `Foco de calor · ${municipality}`,
    description: `Detección satelital, no confirmada. Confianza ${confidenceLabel}. FRP: ${fire.frp} MW. ${fire.source}, satélite ${fire.satellite}.`,
    timestamp: fire.timestamp,
    value: fire.frp,
    municipality,
    status: 'activo',
    source: 'real',
    confidence: fire.confidence,
    frp: fire.frp,
    localTime: fire.localTime,
    satellite: fire.satellite,
    firmsSource: fire.source,
  };
}

function formatBogotaDateTime(timestamp: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(timestamp));
}

function computeStats(events: SensorEvent[], alerts: AlertLog[], mode: DataMode): DashboardStats {
  const activos = events.filter((e) => e.status === 'activo');
  return {
    totalActivos: activos.length,
    deforestacion: events.filter((e) => e.type === 'deforestacion' && e.status === 'activo').length,
    incendios: events.filter(
      (e) => e.type === 'incendio' && e.status === 'activo' && (mode === 'demo' || e.source === 'real')
    ).length,
    nivelesRio: events.filter((e) => e.type === 'nivel_rio' && e.status === 'activo').length,
    hectareasEstimadas: events
      .filter((e) => e.type === 'deforestacion')
      .reduce((sum, e) => sum + (e.value ?? 0), 0),
    alertasHoy: alerts.filter((a) => {
      const d = new Date(a.timestamp);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    }).length,
  };
}

function SimulationControls({
  onFire,
  onDeforestation,
  onRiver,
  fireDisabled,
  mobile = false,
}: {
  onFire: () => void;
  onDeforestation: () => void;
  onRiver: () => void;
  fireDisabled: boolean;
  mobile?: boolean;
}) {
  const buttonClass = mobile
    ? 'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-semibold'
    : 'flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs transition';

  return (
    <>
      <button
        type="button"
        onClick={onFire}
        disabled={fireDisabled}
        className={`${buttonClass} border border-red-500/30 bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-50`}
        title="Simular foco de calor"
        aria-label="Simular foco de calor"
      >
        <Flame className="h-4 w-4" />
        <span>{mobile ? 'SIMULACRO' : 'SIMULACRO · Foco de calor'}</span>
      </button>
      <button
        type="button"
        onClick={onDeforestation}
        className={`${buttonClass} border border-orange-500/30 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25`}
        title="Simular deforestación"
      >
        <TreePine className="h-4 w-4" />
        <span>Deforestación</span>
      </button>
      <button
        type="button"
        onClick={onRiver}
        className={`${buttonClass} border border-blue-500/30 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25`}
        title="Simular nivel de río"
      >
        <Waves className="h-4 w-4" />
        <span>Río</span>
      </button>
    </>
  );
}

async function playNotificationSound(): Promise<void> {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) throw new Error('Este navegador no permite reproducir el sonido de notificación.');

  const context = new AudioContextConstructor();
  try {
    await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.23);
    await new Promise<void>((resolve) => {
      oscillator.onended = () => resolve();
    });
  } finally {
    await context.close();
  }
}

export default function App() {
  const [events, setEvents] = useState<SensorEvent[]>(() => generateInitialEvents(52));
  const [mode, setMode] = useState<DataMode>('real');
  const [fuegos, setFuegos] = useState<FuegoReal[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [last5DaysCount, setLast5DaysCount] = useState(0);
  const [lastDetection, setLastDetection] = useState<string | null>(null);
  const [fuegosError, setFuegosError] = useState<string | null>(null);
  const [fuegosLoading, setFuegosLoading] = useState(true);
  const [showHistoricalSnapshot, setShowHistoricalSnapshot] = useState(false);
  const historicalQueryPending = useRef(
    new URLSearchParams(window.location.search).get('demo') === 'historico'
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [liveState, setLiveState] = useState<LiveDashboardState>(() => {
    const indicators = generateLiveIndicators();
    indicators.heatSpots = 0;
    return {
      indicators,
      readings: [{ timestamp: Date.now(), riverLevel: indicators.riverLevel, heatSpots: indicators.heatSpots }],
    };
  });
  const liveIndicators = liveState.indicators;
  const trendReadings = liveState.readings;
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alertEvent, setAlertEvent] = useState<SensorEvent | null>(null);
  const [fireSimulation, setFireSimulation] = useState<{
    event: SensorEvent;
    baseline: LiveIndicatorValues;
  } | null>(null);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [mapResetToken, setMapResetToken] = useState(0);

  const [typeFilter, setTypeFilter] = useState<EventType | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fuegoEvents = useMemo(
    () => fuegos
      .filter((fire) => {
        const age = Date.now() - Date.parse(fire.timestamp);
        return age >= 0 && age <= 24 * 60 * 60 * 1000;
      })
      .map(toFireEvent),
    [fuegos]
  );
  const fuegoCount = fuegoEvents.length;
  const historicalEvents = useMemo(
    () => HISTORICAL_FOCOS.map((foco): SensorEvent => {
      const municipality = MUNICIPALITIES.reduce((nearest, current) => {
        const currentDistance = (current.lat - foco.lat) ** 2 + (current.lon - foco.lon) ** 2;
        const nearestDistance = (nearest.lat - foco.lat) ** 2 + (nearest.lon - foco.lon) ** 2;
        return currentDistance < nearestDistance ? current : nearest;
      }).name;

      return {
        id: foco.id,
        type: 'incendio',
        severity: 'baja',
        lat: foco.lat,
        lng: foco.lon,
        title: 'Foco de calor · captura histórica NASA FIRMS',
        description: 'Captura estática de la región del Guaviare y zona de influencia. Detección satelital, no confirmada.',
        timestamp: foco.timestamp,
        value: foco.frp,
        municipality,
        status: 'activo',
        source: 'real',
        localTime: foco.localTime,
        confidence: foco.confidence,
        frp: foco.frp,
        satellite: foco.satellite,
        historicalSnapshot: true,
      };
    }),
    []
  );
  const focoEventsForFrame = useMemo(() => {
    const realFocos = mode === 'real' ? fuegoEvents : [];
    return showHistoricalSnapshot
      ? [...realFocos, ...historicalEvents]
      : realFocos;
  }, [fuegoEvents, historicalEvents, mode, showHistoricalSnapshot]);
  const mapFrameKey = `${mode}:${focoEventsForFrame.map((event) => event.id).join(',')}`;
  const simulationId = fireSimulation?.event.id;
  const visibleEvents = useMemo(() => {
    if (mode === 'demo') return events;
    const syntheticEvents = events.filter(
      (event) => event.type !== 'incendio' || event.id === simulationId
    );
    return [...fuegoEvents, ...syntheticEvents];
  }, [events, fuegoEvents, mode, simulationId]);

  const refreshFuegos = useCallback(async () => {
    try {
      const response = await fetchFuegos();
      setFuegos(response.hotspots);
      setFetchedAt(response.fetchedAt);
      setLast5DaysCount(response.last5DaysCount);
      setLastDetection(response.lastDetection);
      setFuegosError(null);
      setFuegosLoading(false);
      if (historicalQueryPending.current) {
        historicalQueryPending.current = false;
        if (response.hotspots.length === 0) setShowHistoricalSnapshot(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error de conexión con NASA FIRMS.';
      setFuegosError(message);
      setFuegosLoading(false);
      setMode('demo');
    }
  }, []);

  useEffect(() => {
    void refreshFuegos();
    const interval = window.setInterval(() => void refreshFuegos(), 10 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [refreshFuegos]);

  useEffect(() => {
    if (mode !== 'real' || fuegosLoading) return;
    setLiveState((previous) => ({
      indicators: { ...previous.indicators, heatSpots: fuegoCount },
      readings: [
        ...previous.readings,
        { timestamp: Date.now(), riverLevel: previous.indicators.riverLevel, heatSpots: fuegoCount },
      ].slice(-20),
    }));
  }, [fuegoCount, fuegosLoading, mode]);

  // New synthetic activity remains limited to river and deforestation in real mode.
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.4) {
        const newEvent = mode === 'real'
          ? generateEvent(Math.random() > 0.5 ? 'deforestacion' : 'nivel_rio')
          : generateEvent();
        setEvents((prev) => [newEvent, ...prev].slice(0, 120));
      }
    }, 28000 + Math.random() * 12000);
    return () => clearInterval(interval);
  }, [mode]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const updateIndicators = () => {
      if (cancelled) return;
      setLiveState((previous) => {
        const indicators = generateLiveIndicators(previous.indicators);
        const heatSpots = mode === 'real'
          ? fuegoCount
          : indicators.heatSpots;
        indicators.heatSpots = heatSpots;
        const readings = [
          ...previous.readings,
          { timestamp: Date.now(), riverLevel: indicators.riverLevel, heatSpots },
        ].slice(-20);
        return { indicators, readings };
      });
      timeout = setTimeout(updateIndicators, 3000 + Math.random() * 2000);
    };

    timeout = setTimeout(updateIndicators, 3000 + Math.random() * 2000);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [mode, fuegoCount]);

  const focoQuery = useMemo(() => new URLSearchParams(window.location.search).get('foco'), []);
  useEffect(() => {
    if (!focoQuery || !fuegoEvents.some((event) => event.id === focoQuery)) return;
    setTypeFilter('all');
    setSeverityFilter('all');
    setStatusFilter('all');
    setSelectedId(focoQuery);
  }, [focoQuery, fuegoEvents]);

  const filtered = useMemo(() => {
    return visibleEvents.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (severityFilter !== 'all' && e.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      return true;
    });
  }, [visibleEvents, typeFilter, severityFilter, statusFilter]);

  const mapEvents = useMemo(
    () => showHistoricalSnapshot
      ? [...filtered, ...historicalEvents]
      : filtered,
    [filtered, historicalEvents, showHistoricalSnapshot]
  );
  const historicalListEvents = showHistoricalSnapshot
    ? fuegoCount > 0
      ? [...fuegoEvents, ...historicalEvents]
      : historicalEvents
    : filtered;
  const stats = useMemo(() => computeStats(visibleEvents, alerts, mode), [visibleEvents, alerts, mode]);

  const handleAlert = useCallback((event: SensorEvent) => {
    setAlertEvent(event);
  }, []);

  const handleConfirmAlert = useCallback(
    (event: SensorEvent, channel: 'sms' | 'whatsapp' | 'ambos', message: string) => {
      const log: AlertLog = {
        id: Math.random().toString(36).slice(2, 10),
        eventId: event.id,
        message,
        channel,
        timestamp: new Date().toISOString(),
        recipients: channel === 'ambos' ? 12 + Math.floor(Math.random() * 18) : 6 + Math.floor(Math.random() * 10),
        status: 'simulado',
      };
      setAlerts((prev) => [log, ...prev]);
    },
    []
  );

  const injectEvent = (type: EventType) => {
    const burst = generateRealisticBurst(type, 1);
    setEvents((prev) => [...burst, ...prev]);
    setSelectedId(burst[0].id);
  };

  const handleHistorySelect = (event: SensorEvent) => {
    setTypeFilter('all');
    setSeverityFilter('all');
    setStatusFilter('all');
    setSelectedId(event.id);
  };

  const simulateFire = () => {
    const event = generateFireEvent();
    const baseline = liveIndicators;
    setEvents((previous) => [event, ...previous].slice(0, 120));
    setTypeFilter('all');
    setSeverityFilter('all');
    setStatusFilter('all');
    setSelectedId(event.id);
    setFireSimulation({ event, baseline });
    setLiveState((previous) => {
      const indicators = {
        ...previous.indicators,
        heatSpots: mode === 'real' ? fuegoCount : previous.indicators.heatSpots + 1,
      };
      const readings = [
        ...previous.readings,
        { timestamp: Date.now(), riverLevel: indicators.riverLevel, heatSpots: indicators.heatSpots },
      ].slice(-20);
      return { indicators, readings };
    });
    setSoundError(null);
    void playNotificationSound().catch((error: unknown) => {
      setSoundError(error instanceof Error ? error.message : 'No se pudo reproducir el sonido.');
    });
  };

  const resetFireSimulation = () => {
    if (!fireSimulation) return;
    setEvents((previous) => previous.filter((event) => event.id !== fireSimulation.event.id));
    setLiveState((previous) => ({
      indicators: fireSimulation.baseline,
      readings: [
        ...previous.readings,
        {
        timestamp: Date.now(),
        riverLevel: fireSimulation.baseline.riverLevel,
        heatSpots: fireSimulation.baseline.heatSpots,
        },
      ].slice(-20),
    }));
    setFireSimulation(null);
    setSoundError(null);
    setSelectedId(null);
    setMapResetToken((previous) => previous + 1);
  };

  const activateHistoricalSnapshot = () => {
    historicalQueryPending.current = false;
    setTypeFilter('all');
    setSeverityFilter('all');
    setStatusFilter('all');
    setShowHistoricalSnapshot(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo-icon.png"
              alt=""
              aria-hidden="true"
              className="h-11 w-11 shrink-0 object-contain"
            />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-none">Guardián del Guaviare</h1>
              <p className="text-[11px] text-slate-400 mt-0.5">Monitoreo de deforestación · focos de calor · ríos</p>
            </div>
          </div>

          <div className="hidden items-center justify-between gap-2 sm:flex sm:justify-end">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              <Activity className="w-3 h-3 animate-pulse" />
              En vivo
            </div>
            <SimulationControls
              onFire={simulateFire}
              onDeforestation={() => injectEvent('deforestacion')}
              onRiver={() => injectEvent('nivel_rio')}
              fireDisabled={fireSimulation !== null}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 space-y-2 px-3 pb-28 pt-3 sm:space-y-4 sm:px-4 sm:py-4 sm:pb-4">
        <section className="flex flex-col gap-3 rounded-xl border border-slate-700/60 bg-slate-900/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Focos de calor</h2>
            <p className="mt-1 text-xs text-slate-400">
              {showHistoricalSnapshot
                ? fuegoCount > 0
                  ? `${fuegoCount} focos reales + 4 históricos`
                  : '4 focos (histórico)'
                : mode === 'real'
                  ? 'NASA FIRMS (VIIRS)'
                  : 'Modo demo · focos de calor sintéticos'}
              {mode === 'real' && fetchedAt && (
                <> · Última actualización: hace {Math.max(0, Math.floor((Date.now() - Date.parse(fetchedAt)) / 60_000))} min</>
              )}
            </p>
            {mode === 'real' && (
              <p className="mt-1 text-xs text-amber-300">Detección satelital, no confirmada.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Modo de datos">
            <button
              type="button"
              aria-pressed={mode === 'real'}
              onClick={() => {
                setMode('real');
                if (fuegosError) void refreshFuegos();
              }}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${mode === 'real' ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
            >
              Datos reales
            </button>
            <button
              type="button"
              aria-pressed={mode === 'demo'}
              onClick={() => setMode('demo')}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${mode === 'demo' ? 'border-amber-400 bg-amber-500/15 text-amber-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
            >
              Modo demo
            </button>
          </div>
        </section>
        {fuegosError && (
          <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            No se pudo conectar con NASA FIRMS, mostrando datos simulados. {fuegosError}
          </div>
        )}
        {mode === 'real' && !showHistoricalSnapshot && !fuegosLoading && !fuegosError && fuegoCount === 0 && (
          <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-200">
            {last5DaysCount === 0
              ? 'Sin focos detectados en los últimos 5 días'
              : `Sin focos en las últimas 24 h · Últimos 5 días: ${last5DaysCount} · Último foco: ${lastDetection ? `${formatBogotaDateTime(lastDetection)} (hora Bogotá)` : 'sin registro'}`}
          </p>
        )}
        {/* Stats */}
        <StatsCards
          stats={stats}
          mode={mode}
          historicalFocos={showHistoricalSnapshot ? historicalEvents.length : 0}
        />

        {/* Map + Event list */}
        <div className="grid min-h-[420px] grid-cols-1 gap-3 lg:grid-cols-3 sm:gap-4">
          <div className="min-w-0 lg:col-span-2">
            <div className="h-[360px] sm:h-[420px]">
              <MapView
                events={mapEvents}
                focusEvents={focoEventsForFrame}
                frameKey={mapFrameKey}
                selectedId={selectedId}
                onSelect={setSelectedId}
                pulseId={fireSimulation?.event.id}
                resetToken={mapResetToken}
              />
            </div>
            {mode === 'real' && !fuegosLoading && !fuegosError && (
              <div className="mt-2 flex flex-col gap-2">
                {showHistoricalSnapshot && (
                  <p className="rounded-lg border-2 border-amber-400 bg-amber-500/15 px-3 py-2 text-center text-xs font-bold text-amber-100 sm:text-sm">
                    Captura histórica NASA FIRMS · 17/10/2026 · no es tiempo real · región del Guaviare y zona de influencia
                  </p>
                )}
                {showHistoricalSnapshot ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowHistoricalSnapshot(false);
                      setSelectedId(null);
                    }}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
                  >
                    Volver a datos en vivo
                  </button>
                ) : fuegoCount === 0 ? (
                  <button
                    type="button"
                    onClick={activateHistoricalSnapshot}
                    className="w-full rounded-lg border border-amber-400/50 bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25"
                  >
                    Ver ejemplo con focos históricos
                  </button>
                ) : null}
              </div>
            )}
          </div>
          <div className="flex h-[360px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/60 sm:h-[420px]">
            <EventList
              events={historicalListEvents}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAlert={handleAlert}
              historicalSnapshot={showHistoricalSnapshot}
            />
          </div>
        </div>

        <section className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-2 sm:hidden">
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
            className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm font-medium text-slate-200"
          >
            <Filter className="h-4 w-4 text-slate-400" />
            Filtros
            <span className="ml-auto text-xs text-slate-400">{filtersOpen ? 'Ocultar' : 'Mostrar'}</span>
          </button>
          {filtersOpen && (
            <div className="pt-2">
              <Filters
                typeFilter={typeFilter}
                severityFilter={severityFilter}
                statusFilter={statusFilter}
                onTypeChange={setTypeFilter}
                onSeverityChange={setSeverityFilter}
                onStatusChange={setStatusFilter}
              />
            </div>
          )}
        </section>
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <Filters
            typeFilter={typeFilter}
            severityFilter={severityFilter}
            statusFilter={statusFilter}
            onTypeChange={setTypeFilter}
            onSeverityChange={setSeverityFilter}
            onStatusChange={setStatusFilter}
          />
        </div>

        <LiveIndicators values={liveIndicators} mode={mode} />
        <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-slate-800/50" />}>
          <TrendCharts readings={trendReadings} mode={mode} />
        </Suspense>
        {fireSimulation && (
          <section
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-red-500/50 bg-red-950/60 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <Flame className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-red-400" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-red-100">Foco de calor simulado · SIMULACRO</h2>
                <p className="text-sm text-red-200">{fireSimulation.event.municipality} · {fireSimulation.event.title}</p>
                <time className="text-xs text-red-300" dateTime={fireSimulation.event.timestamp}>
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'America/Bogota',
                  }).format(new Date(fireSimulation.event.timestamp))}
                </time>
                {soundError && <p className="mt-1 text-xs text-amber-200">{soundError}</p>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-2 text-xs text-red-200">
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                Sonido de aviso
              </span>
              <button
                onClick={resetFireSimulation}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Restablecer
              </button>
            </div>
          </section>
        )}

        {/* Charts + Alert log */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="min-w-0 lg:col-span-2">
            <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-slate-800/50" />}>
              <Charts events={visibleEvents} mode={mode} />
            </Suspense>
          </div>
          <div>
            <div className="space-y-4">
              <AlertHistory events={visibleEvents} onSelect={handleHistorySelect} />
              <AlertLogPanel logs={alerts} />
            </div>
          </div>
        </div>
      </main>

      <nav
        aria-label="Acciones de simulación"
        className="fixed inset-x-0 bottom-0 z-[1100] border-t border-slate-700 bg-slate-950/95 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-8px_24px_rgba(2,6,23,0.7)] backdrop-blur sm:hidden"
      >
        <div className="mx-auto flex max-w-md gap-2">
          <SimulationControls
            mobile
            onFire={simulateFire}
            onDeforestation={() => injectEvent('deforestacion')}
            onRiver={() => injectEvent('nivel_rio')}
            fireDisabled={fireSimulation !== null}
          />
        </div>
      </nav>

      <footer className="border-t border-slate-800 py-3 text-center text-[11px] text-slate-600">
        <p>Guardián del Guaviare · Proyecto de demostración; no es un sistema oficial de alerta.</p>
        <p className="mt-1">
          Fuentes: <a className="text-slate-400 underline" href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">NASA FIRMS (VIIRS)</a>
          {' · '}
          <a className="text-slate-400 underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
          {' · '}Río y deforestación: datos simulados.
        </p>
      </footer>

      <AlertModal
        event={alertEvent}
        onClose={() => setAlertEvent(null)}
        onConfirm={handleConfirmAlert}
      />
    </div>
  );
}
