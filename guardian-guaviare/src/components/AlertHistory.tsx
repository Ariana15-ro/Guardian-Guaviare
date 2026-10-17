import { SensorEvent } from '../types';
import { formatDate, severityColor, typeIcon, typeLabel, severityLabel } from '../utils/format';

interface Props {
  events: SensorEvent[];
  onSelect: (event: SensorEvent) => void;
}

export function AlertHistory({ events, onSelect }: Props) {
  const alerts = events
    .filter((event) => event.severity === 'alta' || event.severity === 'critica')
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 8);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/50">
      <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Historial de alertas</h2>
        <span className="text-xs text-slate-500">{alerts.length} recientes</span>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {alerts.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400">Aún no hay alertas de alta severidad.</p>
        ) : (
          <ul>
            {alerts.map((event) => (
              <li key={event.id} className="border-b border-slate-800/70 last:border-0">
                <button
                  type="button"
                  onClick={() => onSelect(event)}
                  className="w-full px-4 py-3 text-left transition-colors hover:bg-slate-700/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
                  aria-label={`Ver ${typeLabel(event.type)} en ${event.municipality}, ${formatDate(event.timestamp)}`}
                >
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">{typeIcon(event.type)}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${severityColor(event.severity)}`}>
                      {severityLabel(event.severity)}
                    </span>
                    <span className="truncate text-xs text-slate-300">{typeLabel(event.type)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-white">{event.municipality}</p>
                  <time className="mt-0.5 block text-xs text-slate-400" dateTime={event.timestamp}>
                    {formatDate(event.timestamp)}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
