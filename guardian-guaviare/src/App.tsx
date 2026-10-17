import { lazy, Suspense, useState, useMemo, useCallback, useEffect } from 'react';
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
import { Shield, Flame, TreePine, Waves, Activity, RotateCcw, Volume2 } from 'lucide-react';
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
    description: `Confianza ${confidenceLabel}. FRP: ${fire.frp} MW. Detección VIIRS del satélite ${fire.satellite}.`,
    timestamp: fire.timestamp,
    value: fire.frp,
    municipality,
    status: 'activo',
    source: 'real',
    confidence: fire.confidence,
    frp: fire.frp,
    localTime: fire.localTime,
    satellite: fire.satellite,
  };
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
  const [fuegosError, setFuegosError] = useState<string | null>(null);
  const [fuegosLoading, setFuegosLoading] = useState(true);
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
      setFuegosError(null);
      setFuegosLoading(false);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-none">Guardián del Guaviare</h1>
              <p className="text-[11px] text-slate-400 mt-0.5">Monitoreo de deforestación · incendios · ríos</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              <Activity className="w-3 h-3 animate-pulse" />
              En vivo
            </div>

            <div className="flex gap-1.5">
              <button
                onClick={simulateFire}
                className="flex flex-1 items-center justify-center gap-1.5 px-2.5 py-2 text-xs rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition sm:flex-none"
                title="Simular incendio"
                aria-label="Simular incendio"
                disabled={fireSimulation !== null}
                aria-disabled={fireSimulation !== null}
              >
                <Flame className="w-3.5 h-3.5" />
                <span className="leading-tight text-center md:inline">SIMULACRO · Incendio</span>
              </button>
              <button
                onClick={() => injectEvent('deforestacion')}
                className="flex flex-1 items-center justify-center gap-1.5 px-2.5 py-2 text-xs rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-400 hover:bg-orange-500/25 transition sm:flex-none"
                title="Simular deforestación"
              >
                <TreePine className="w-3.5 h-3.5" />
                <span className="md:inline">Deforestación</span>
              </button>
              <button
                onClick={() => injectEvent('nivel_rio')}
                className="flex flex-1 items-center justify-center gap-1.5 px-2.5 py-2 text-xs rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition sm:flex-none"
                title="Simular nivel de río"
              >
                <Waves className="w-3.5 h-3.5" />
                <span className="md:inline">Río</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 space-y-4 px-4 py-4">
        <section className="flex flex-col gap-3 rounded-xl border border-slate-700/60 bg-slate-900/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Origen de incendios y focos de calor</h2>
            <p className="mt-1 text-xs text-slate-400">
              {mode === 'real' ? 'NASA FIRMS (VIIRS)' : 'Modo demo · incendios sintéticos'}
              {mode === 'real' && fetchedAt && (
                <> · Última actualización: hace {Math.max(0, Math.floor((Date.now() - Date.parse(fetchedAt)) / 60_000))} min</>
              )}
            </p>
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
        {mode === 'real' && !fuegosLoading && !fuegosError && fuegoCount === 0 && (
          <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-200">
            Sin focos detectados en las últimas 24 h.
          </p>
        )}
        {/* Stats */}
        <StatsCards stats={stats} mode={mode} />
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
                <h2 className="font-semibold text-red-100">Incendio simulado detectado</h2>
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

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Filters
            typeFilter={typeFilter}
            severityFilter={severityFilter}
            statusFilter={statusFilter}
            onTypeChange={setTypeFilter}
            onSeverityChange={setSeverityFilter}
            onStatusChange={setStatusFilter}
          />
        </div>

        {/* Map + Event list */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: 420 }}>
          <div className="lg:col-span-2 h-[420px]">
            <MapView
              events={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
              pulseId={fireSimulation?.event.id}
              resetToken={mapResetToken}
            />
          </div>
          <div className="h-[420px] bg-slate-900/60 border border-slate-700/60 rounded-xl overflow-hidden flex flex-col">
            <EventList
              events={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAlert={handleAlert}
            />
          </div>
        </div>

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
