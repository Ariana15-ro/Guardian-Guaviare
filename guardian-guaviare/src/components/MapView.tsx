import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import type { CircleMarker as LeafletCircleMarker } from 'leaflet';
import { SensorEvent, EventType } from '../types';
import { formatDate, typeLabel, severityLabel, typeIcon } from '../utils/format';
import 'leaflet/dist/leaflet.css';

interface Props {
  events: SensorEvent[];
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

function FlyToSelected({
  events,
  selectedId,
  resetToken,
}: {
  events: SensorEvent[];
  selectedId: string | null;
  resetToken: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;
    const ev = events.find((e) => e.id === selectedId);
    if (ev) {
      map.flyTo([ev.lat, ev.lng], 11, { duration: 0.8 });
    }
  }, [selectedId, events, map]);

  useEffect(() => {
    if (resetToken > 0) map.flyTo([2.3, -72.6], 8, { duration: 0.8 });
  }, [resetToken, map]);

  return null;
}

export function MapView({ events, selectedId, onSelect, pulseId = null, resetToken = 0 }: Props) {
  const center = useMemo(() => [2.3, -72.6] as [number, number], []);
  const markers = useRef(new Map<string, LeafletCircleMarker>());

  useEffect(() => {
    if (selectedId) markers.current.get(selectedId)?.openPopup();
  }, [events, selectedId]);

  return (
    <div className="h-full w-full rounded-xl overflow-hidden border border-slate-700/60">
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

        <FlyToSelected events={events} selectedId={selectedId} resetToken={resetToken} />

        {events.map((ev) => {
          const isSelected = ev.id === selectedId;
          const isPulsing = ev.id === pulseId;
          const color = TYPE_COLORS[ev.type];
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
                fillOpacity: isSelected ? 0.9 : ev.source === 'real' ? 0.85 : 0.4,
                weight: isSelected ? 3 : 1.5,
                dashArray: ev.source === 'real' ? undefined : '4 3',
              }}
              eventHandlers={{
                click: () => onSelect(ev.id),
              }}
            >
              <Popup>
                <div className="min-w-[220px]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{typeIcon(ev.type)}</span>
                    <span className="font-semibold text-sm">{typeLabel(ev.type)}</span>
                  </div>
                  <p className="text-sm font-medium mb-1">{ev.title}</p>
                  <p className="text-xs text-slate-400 mb-2">{ev.description}</p>
                  <p className={`mb-2 text-[10px] font-semibold uppercase tracking-wide ${ev.source === 'real' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {ev.source === 'real' ? 'Dato real · NASA FIRMS' : 'Dato simulado'}
                  </p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div>
                      <span className="text-slate-500">Severidad:</span>{' '}
                      <span className="font-medium">{severityLabel(ev.severity)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Estado:</span>{' '}
                      <span className="font-medium capitalize">{ev.status.replace('_', ' ')}</span>
                    </div>
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
