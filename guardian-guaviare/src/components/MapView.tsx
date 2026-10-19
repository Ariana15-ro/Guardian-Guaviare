import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import type { CircleMarker as LeafletCircleMarker } from 'leaflet';
import { SensorEvent, EventType } from '../types';
import { formatDate, typeLabel, severityLabel, typeIcon } from '../utils/format';
import 'leaflet/dist/leaflet.css';

interface Props {
  events: SensorEvent[];
  focusEvents: SensorEvent[];
  frameKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  pulseId?: string | null;
  resetToken?: number;
}

const TYPE_COLORS: Record<EventType, string> = {
  deforestacion: '#f97316',
  incendio: '#ef4444',
  nivel_rio: '#3b82f6',
};

const SEVERITY_RADIUS: Record<string, number> = {
  baja: 7,
  media: 10,
  alta: 14,
  critica: 18,
};

function MapBehavior({
  markers,
  focusEvents,
  frameKey,
  selectedId,
  resetToken,
}: {
  markers: React.RefObject<Map<string, LeafletCircleMarker | null>>;
  focusEvents: SensorEvent[];
  frameKey: string;
  selectedId: string | null;
  resetToken: number;
}) {
  const map = useMap();
  const focusEventsRef = useRef(focusEvents);
  const frameEnabledRef = useRef(true);
  const programmaticMoveRef = useRef(false);

  focusEventsRef.current = focusEvents;

  useEffect(() => {
    const disableAutomaticFraming = () => {
      if (!programmaticMoveRef.current) frameEnabledRef.current = false;
    };
    const finishProgrammaticMove = () => {
      programmaticMoveRef.current = false;
    };

    map.on('dragstart', disableAutomaticFraming);
    map.on('zoomstart', disableAutomaticFraming);
    map.on('moveend', finishProgrammaticMove);

    return () => {
      map.off('dragstart', disableAutomaticFraming);
      map.off('zoomstart', disableAutomaticFraming);
      map.off('moveend', finishProgrammaticMove);
    };
  }, [map]);

  const frameHotspots = (force = false) => {
    if (!force && !frameEnabledRef.current) return;

    const points: [number, number][] = focusEventsRef.current.map(({ lat, lng }) => [lat, lng]);
    if (points.length === 0) {
      if (force) {
        programmaticMoveRef.current = true;
        map.flyTo([2.3, -72.6], 8, { duration: 0.8 });
      }
      return;
    }

    programmaticMoveRef.current = true;
    if (points.length === 1) {
      map.flyTo(points[0], 10, { duration: 0.8 });
      return;
    }
    map.fitBounds(points, { padding: [36, 36], maxZoom: 10, animate: true, duration: 0.8 });
  };

  useEffect(() => {
    frameEnabledRef.current = true;
    frameHotspots();
  }, [frameKey, map]);

  useEffect(() => {
    if (!selectedId) return;
    const marker = markers.current?.get(selectedId);
    if (!marker) return;

    frameEnabledRef.current = true;
    programmaticMoveRef.current = true;
    map.flyTo(marker.getLatLng(), 11, { duration: 0.8 });
    marker.openPopup();
  }, [selectedId, map]);

  useEffect(() => {
    if (resetToken > 0) {
      programmaticMoveRef.current = true;
      map.flyTo([2.3, -72.6], 8, { duration: 0.8 });
    }
  }, [resetToken, map]);

  return (
    <button
      type="button"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        frameEnabledRef.current = true;
        frameHotspots(true);
      }}
      className="absolute right-3 top-3 z-[1000] rounded-md border border-slate-300 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
    >
      Recentrar
    </button>
  );
}

export function MapView({
  events,
  focusEvents,
  frameKey,
  selectedId,
  onSelect,
  pulseId = null,
  resetToken = 0,
}: Props) {
  const center = useMemo(() => [2.3, -72.6] as [number, number], []);
  const markers = useRef(new Map<string, LeafletCircleMarker | null>());

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-700/60">
      <MapContainer
        center={center}
        zoom={8}
        className="h-full w-full"
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <MapBehavior
          markers={markers}
          focusEvents={focusEvents}
          frameKey={frameKey}
          selectedId={selectedId}
          resetToken={resetToken}
        />

        {events.map((ev) => {
          const isSelected = ev.id === selectedId;
          const isPulsing = ev.id === pulseId;
          const color = ev.historicalSnapshot ? '#c084fc' : TYPE_COLORS[ev.type];
          const radius = SEVERITY_RADIUS[ev.severity] ?? 10;

          return (
            <CircleMarker
              key={ev.id}
              center={[ev.lat, ev.lng]}
              radius={isSelected ? radius + 4 : radius}
              ref={(layer) => {
                if (layer) markers.current.set(ev.id, layer);
                else markers.current.delete(ev.id);
              }}
              pathOptions={{
                className: isPulsing ? 'fire-pulse' : undefined,
                color: isPulsing ? '#ef4444' : isSelected ? '#fff' : color,
                fillColor: isPulsing ? '#ef4444' : color,
                fillOpacity: isSelected ? 0.9 : ev.historicalSnapshot ? 0.95 : ev.source === 'real' ? 0.85 : 0.4,
                weight: isSelected ? 3 : 1.5,
                dashArray: ev.historicalSnapshot ? '2 3' : ev.source === 'real' ? undefined : '4 3',
              }}
              eventHandlers={{
                click: () => onSelect(ev.id),
              }}
            >
              <Popup>
                <div className="min-w-[220px]">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-lg">{typeIcon(ev.type)}</span>
                    <span className="text-sm font-semibold">{typeLabel(ev.type)}</span>
                  </div>
                  <p className="mb-1 text-sm font-medium">{ev.title}</p>
                  <p className="mb-2 text-xs text-slate-400">{ev.description}</p>
                  <p className={`mb-2 text-[10px] font-semibold uppercase tracking-wide ${ev.historicalSnapshot ? 'text-purple-300' : ev.source === 'real' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {ev.historicalSnapshot ? 'Captura histórica · NASA FIRMS' : ev.source === 'real' ? 'Dato real · NASA FIRMS' : 'Dato simulado'}
                  </p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div>
                      <span className="text-slate-500">{ev.historicalSnapshot ? 'Registro:' : 'Severidad:'}</span>{' '}
                      <span className="font-medium">
                        {ev.historicalSnapshot ? 'captura histórica' : severityLabel(ev.severity)}
                      </span>
                    </div>
                    {!ev.historicalSnapshot && (
                      <div>
                        <span className="text-slate-500">Estado:</span>{' '}
                        <span className="font-medium capitalize">{ev.status.replace('_', ' ')}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-500">Municipio:</span>{' '}
                      <span className="font-medium">{ev.municipality}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Valor:</span>{' '}
                      <span className="font-medium">
                        {ev.type === 'deforestacion' && `${ev.value} ha`}
                        {ev.type === 'incendio' && ev.frp !== undefined && `${ev.frp} MW FRP`}
                        {ev.type === 'incendio' && ev.frp === undefined && `${ev.value}°C`}
                        {ev.type === 'nivel_rio' && `${ev.value} m`}
                      </span>
                    </div>
                    {ev.confidence && (
                      <div>
                        <span className="text-slate-500">Confianza:</span>{' '}
                        <span className="font-medium">
                          {{ l: 'Baja', n: 'Nominal', h: 'Alta' }[ev.confidence]}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    {ev.localTime ?? formatDate(ev.timestamp)}
                    {ev.satellite && ` · ${ev.satellite}`}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
