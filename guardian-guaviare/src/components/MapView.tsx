import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, GeoJSON as LeafletGeoJSON, Popup, useMap } from 'react-leaflet';
import { geoJSON } from 'leaflet';
import type { CircleMarker as LeafletCircleMarker } from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import { SensorEvent, EventType } from '../types';
import { formatDate, typeLabel, severityLabel, typeIcon } from '../utils/format';
import 'leaflet/dist/leaflet.css';

interface Props {
  events: SensorEvent[];
  focusEvents: SensorEvent[];
  frameKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  historicalMode: boolean;
  showSimulation: boolean;
  onToggleSimulation: (shown: boolean) => void;
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
  historicalMode,
  boundary,
  selectedId,
  resetToken,
}: {
  markers: React.RefObject<Map<string, LeafletCircleMarker | null>>;
  focusEvents: SensorEvent[];
  frameKey: string;
  historicalMode: boolean;
  boundary: GeoJsonObject | null;
  selectedId: string | null;
  resetToken: number;
}) {
  const map = useMap();
  const focusEventsRef = useRef(focusEvents);
  const frameEnabledRef = useRef(true);
  const programmaticMoveRef = useRef(false);
  const previousFrameKeyRef = useRef<string | null>(null);

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

    programmaticMoveRef.current = true;
    if (historicalMode) {
      const points: [number, number][] = focusEventsRef.current.map(({ lat, lng }) => [lat, lng]);
      if (points.length === 1) {
        map.flyTo(points[0], 10, { duration: 0.8 });
      } else if (points.length > 1) {
        map.fitBounds(points, { padding: [36, 36], maxZoom: 10, animate: true, duration: 0.8 });
      } else {
        map.flyTo([2.3, -72.6], 7, { duration: 0.8 });
      }
      return;
    }

    if (boundary) {
      const bounds = geoJSON(boundary).getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 8, animate: true, duration: 0.8 });
        return;
      }
    }

    map.flyTo([2.3, -72.6], 7, { duration: 0.8 });
  };

  useEffect(() => {
    const frameIdentity = `${historicalMode ? 'historical' : 'live'}:${frameKey}:${boundary ? 'boundary-ready' : 'boundary-loading'}`;
    if (previousFrameKeyRef.current === frameIdentity) return;
    previousFrameKeyRef.current = frameIdentity;
    frameEnabledRef.current = true;
    frameHotspots();
  }, [frameKey, historicalMode, boundary, map]);

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
      frameEnabledRef.current = true;
      frameHotspots(true);
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
  historicalMode,
  showSimulation,
  onToggleSimulation,
  pulseId = null,
  resetToken = 0,
}: Props) {
  const center = useMemo(() => [2.3, -72.6] as [number, number], []);
  const markers = useRef(new Map<string, LeafletCircleMarker | null>());
  const [boundary, setBoundary] = useState<GeoJsonObject | null>(null);
  const [boundaryError, setBoundaryError] = useState(false);
  const mapFrameKey = `${historicalMode ? 'historical' : 'live'}:${frameKey}`;

  useEffect(() => {
    let cancelled = false;
    const loadBoundary = async () => {
      try {
        const response = await fetch('/guaviare.geojson');
        if (!response.ok) throw new Error(`El contorno respondió con estado ${response.status}.`);
        const geoJson = await response.json() as GeoJsonObject;
        if (!cancelled) setBoundary(geoJson);
      } catch (error) {
        if (!cancelled) {
          console.error(error instanceof Error ? error.message : String(error));
          setBoundaryError(true);
        }
      }
    };
    void loadBoundary();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-700/60">
      {boundaryError && (
        <p role="status" className="absolute bottom-3 left-3 z-[1000] rounded bg-slate-900/90 px-2 py-1 text-[10px] text-amber-200">
          No se pudo cargar el contorno departamental.
        </p>
      )}
      {!historicalMode && (
        <label className="absolute left-3 top-3 z-[1000] flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow">
          <input
            type="checkbox"
            checked={showSimulation}
            onChange={(event) => onToggleSimulation(event.currentTarget.checked)}
            onClick={(event) => event.stopPropagation()}
            className="accent-amber-600"
            aria-label="Mostrar simulación en el mapa"
          />
          {showSimulation ? 'Ocultar simulación' : 'Mostrar simulación'}
        </label>
      )}
      <MapContainer
        center={center}
        zoom={7}
        className="h-full w-full"
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {boundary && (
          <LeafletGeoJSON
            data={boundary}
            interactive={false}
            style={{ color: '#86efac', weight: 1.25, fillColor: '#86efac', fillOpacity: 0.06 }}
          />
        )}

        <MapBehavior
          markers={markers}
          focusEvents={focusEvents}
          frameKey={mapFrameKey}
          historicalMode={historicalMode}
          boundary={boundary}
          selectedId={selectedId}
          resetToken={resetToken}
        />

        {events.map((ev) => {
          const isSelected = ev.id === selectedId;
          const isPulsing = ev.id === pulseId;
          const isRealHotspot = ev.type === 'incendio' && ev.source === 'real' && ev.inGuaviare === true;
          const isInfluenceHotspot = ev.type === 'incendio' && ev.source === 'real' && ev.inGuaviare === false;
          const color = isInfluenceHotspot ? '#fb923c' : ev.historicalSnapshot ? '#c084fc' : TYPE_COLORS[ev.type];
          const radius = SEVERITY_RADIUS[ev.severity] ?? 10;

          return (
            <CircleMarker
              key={ev.id}
              center={[ev.lat, ev.lng]}
              radius={isSelected ? radius + 4 : isRealHotspot ? Math.max(radius, 13) : isInfluenceHotspot ? 8 : radius}
              ref={(layer) => {
                if (layer) markers.current.set(ev.id, layer);
                else markers.current.delete(ev.id);
              }}
              pathOptions={{
                className: isPulsing ? 'fire-pulse' : undefined,
                color: isPulsing ? '#ef4444' : isSelected ? '#fff' : isRealHotspot ? '#fef08a' : color,
                fillColor: isPulsing ? '#ef4444' : isRealHotspot ? '#ef4444' : color,
                fillOpacity: isSelected ? 0.95 : isRealHotspot ? 0.95 : isInfluenceHotspot ? 0.45 : ev.historicalSnapshot ? 0.95 : 0.4,
                weight: isRealHotspot || isSelected ? 3 : 1.5,
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
                    {ev.historicalSnapshot ? 'HISTÓRICO · NASA FIRMS' : ev.source === 'real' ? 'Dato real · NASA FIRMS' : 'Dato simulado'}
                  </p>
                  {ev.type === 'incendio' && ev.source === 'real' && (
                    <p className={`mb-2 text-xs font-semibold ${ev.inGuaviare ? 'text-emerald-300' : 'text-orange-300'}`}>
                      {ev.inGuaviare ? 'Dentro del Guaviare' : 'Zona de influencia'}
                    </p>
                  )}
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
