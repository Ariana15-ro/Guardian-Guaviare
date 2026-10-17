import { SensorEvent } from '../types';
import { formatRelative, severityColor, typeLabel, typeIcon, severityLabel } from '../utils/format';
import { Send, Eye } from 'lucide-react';

interface Props {
  events: SensorEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAlert: (event: SensorEvent) => void;
}

export function EventList({ events, selectedId, onSelect, onAlert }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-700/60 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Eventos recientes</h2>
        <span className="text-xs text-slate-500">{events.length} total</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No hay eventos con los filtros actuales</div>
        ) : (
          events.map((ev) => (
            <div
              key={ev.id}
              onClick={() => onSelect(ev.id)}
              className={`px-4 py-3 border-b border-slate-800/60 cursor-pointer transition-colors hover:bg-slate-800/40 ${
                selectedId === ev.id ? 'bg-slate-800/70 border-l-2 border-l-emerald-500' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">{typeIcon(ev.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${severityColor(ev.severity)}`}>
                      {severityLabel(ev.severity)}
                    </span>
                    <span className="text-[10px] text-slate-500">{typeLabel(ev.type)}</span>
                  </div>
                  <p className="text-sm text-slate-200 truncate leading-snug">{ev.title}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-slate-500">{ev.municipality} · {formatRelative(ev.timestamp)}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(ev.id);
                        }}
                        className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition"
                        title="Ver en mapa"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAlert(ev);
                        }}
                        className="p-1 rounded hover:bg-emerald-600/30 text-slate-400 hover:text-emerald-400 transition"
                        title="Enviar alerta"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
