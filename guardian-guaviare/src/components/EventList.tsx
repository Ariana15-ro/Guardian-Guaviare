import { SensorEvent } from '../types';
import { formatRelative, severityColor, typeLabel, typeIcon, severityLabel } from '../utils/format';
import { Send, Eye } from 'lucide-react';

interface Props {
  realEvents: SensorEvent[];
  historicalEvents?: SensorEvent[];
  simulationEvents: SensorEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAlert: (event: SensorEvent) => void;
  last5DaysCount: number;
  influenceCount: number;
  lastDetection: string | null;
  loading: boolean;
  error: string | null;
}

const MUNICIPALITIES = [
  { name: 'San José del Guaviare', lat: 2.5728, lon: -72.6459 },
  { name: 'Calamar', lat: 1.9597, lon: -72.6531 },
  { name: 'El Retorno', lat: 2.3303, lon: -72.6278 },
  { name: 'Miraflores', lat: 1.3361, lon: -71.9511 },
];

function distanceToNearestMunicipality(event: SensorEvent): { name: string; distance: number } {
  return MUNICIPALITIES.reduce((nearest, municipality) => {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = toRadians(municipality.lat - event.lat);
    const longitudeDelta = toRadians(municipality.lon - event.lng);
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(toRadians(event.lat)) *
        Math.cos(toRadians(municipality.lat)) *
        Math.sin(longitudeDelta / 2) ** 2;
    const distance = 2 * 6371 * Math.asin(Math.sqrt(haversine));
    return distance < nearest.distance ? { name: municipality.name, distance } : nearest;
  }, { name: '', distance: Number.POSITIVE_INFINITY });
}

function formatBogotaTime(event: SensorEvent): string {
  return event.localTime ?? new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(event.timestamp));
}

function EventRow({
  event,
  selected,
  historical = false,
  onSelect,
  onAlert,
}: {
  event: SensorEvent;
  selected: boolean;
  historical?: boolean;
  onSelect: (id: string) => void;
  onAlert: (event: SensorEvent) => void;
}) {
  const nearestMunicipality = distanceToNearestMunicipality(event);

  return (
    <div
      key={event.id}
      onClick={() => onSelect(event.id)}
      className={`cursor-pointer border-b border-slate-800/60 px-4 py-3 transition-colors hover:bg-slate-800/40 ${
        selected ? 'border-l-2 border-l-emerald-500 bg-slate-800/70' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg">{typeIcon(event.type)}</span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className={`rounded border px-1.5 py-0.5 text-[10px] ${severityColor(event.severity)}`}>
              {severityLabel(event.severity)}
            </span>
            <span className="text-[10px] text-slate-500">{typeLabel(event.type)}</span>
            <span className={`text-[9px] font-semibold uppercase ${
              historical ? 'text-purple-300' : event.source === 'real' ? 'text-emerald-300' : 'text-amber-300'
            }`}>
              {historical ? 'HISTÓRICO' : event.source === 'real' ? 'NASA FIRMS' : 'SIMULADO'}
            </span>
          </div>
          <p className="truncate text-sm leading-snug text-slate-200">{event.title}</p>
          {event.type === 'incendio' && event.source === 'real' && (
            <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-400">
              <p>{formatBogotaTime(event)} (Bogotá) · Satélite {event.satellite ?? 'VIIRS'}</p>
              {event.frp !== undefined && <p>FRP: {event.frp.toFixed(2)} MW</p>}
              <p>
                a ~{nearestMunicipality.distance.toFixed(1)} km de {nearestMunicipality.name}
              </p>
              <p className={event.inGuaviare ? 'text-emerald-300' : 'text-orange-300'}>
                {event.inGuaviare ? 'Dentro del Guaviare' : 'Zona de influencia'}
              </p>
            </div>
          )}
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">{event.municipality} · {formatRelative(event.timestamp)}</span>
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(event.id);
                }}
                className="rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-white"
                title="Ver en mapa"
                aria-label={`Ver ${event.title} en el mapa`}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAlert(event);
                }}
                className="rounded p-1 text-slate-400 transition hover:bg-emerald-600/30 hover:text-emerald-400"
                title="Enviar alerta"
                aria-label={`Crear alerta para ${event.title}`}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {event.type === 'incendio' && event.source !== 'real' && (
            <p className="mt-1 text-[10px] font-semibold text-amber-300">SIMULADO · Dato de demostración</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function EventList({
  realEvents,
  historicalEvents = [],
  simulationEvents,
  selectedId,
  onSelect,
  onAlert,
  last5DaysCount,
  influenceCount,
  lastDetection,
  loading,
  error,
}: Props) {
  const bogotaLastDetection = lastDetection
    ? new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Bogota',
    }).format(new Date(lastDetection))
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Eventos detectados</h2>
        <span className="text-right text-[10px] leading-tight text-slate-400">
          {realEvents.filter((event) => event.inGuaviare).length} dentro
          <br />
          {influenceCount} zona de influencia
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section aria-labelledby="real-hotspots-title">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-emerald-500/20 bg-slate-900 px-4 py-2">
            <h3 id="real-hotspots-title" className="text-xs font-semibold text-emerald-200">
              Focos de calor reales (NASA FIRMS)
            </h3>
            <span className="text-[10px] text-slate-400">Últimas 24 h</span>
          </div>
          {realEvents.length === 0 && (
            <p className="px-4 py-3 text-xs leading-relaxed text-slate-400">
              {loading
                ? 'Consultando focos reales de NASA FIRMS…'
                : error
                  ? 'No fue posible consultar el resumen de NASA FIRMS.'
                  : last5DaysCount === 0
                    ? 'Sin focos detectados en los últimos 5 días'
                    : `Sin focos en las últimas 24 h · Últimos 5 días: ${last5DaysCount} · Último foco: ${bogotaLastDetection ?? 'sin registro'} (hora Bogotá)`}
            </p>
          )}
          {realEvents.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              selected={selectedId === event.id}
              onSelect={onSelect}
              onAlert={onAlert}
            />
          ))}
          {historicalEvents.length > 0 && (
            <>
              <p className="border-b border-purple-500/20 bg-purple-500/5 px-4 py-2 text-[10px] font-semibold text-purple-200">
                Captura histórica NASA FIRMS · 16-19/10/2026 · no es tiempo real
              </p>
              {historicalEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  selected={selectedId === event.id}
                  historical
                  onSelect={onSelect}
                  onAlert={onAlert}
                />
              ))}
            </>
          )}
        </section>

        <details className="border-t border-slate-700/60">
          <summary className="sticky top-0 z-10 flex cursor-pointer list-none items-center justify-between border-b border-slate-700/60 bg-slate-900 px-4 py-3 text-xs font-semibold text-amber-200">
            <span>Simulación (datos de demostración)</span>
            <span className="text-[10px] text-slate-400">{simulationEvents.length} eventos · SIMULADO</span>
          </summary>
          {simulationEvents.length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-500">No hay eventos simulados con los filtros actuales.</p>
          ) : (
            simulationEvents.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                selected={selectedId === event.id}
                onSelect={onSelect}
                onAlert={onAlert}
              />
            ))
          )}
        </details>
      </div>
    </div>
  );
}
