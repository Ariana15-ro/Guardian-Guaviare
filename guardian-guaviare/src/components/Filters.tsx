import { EventType, Severity } from '../types';
import { Filter } from 'lucide-react';

interface Props {
  typeFilter: EventType | 'all';
  severityFilter: Severity | 'all';
  statusFilter: string;
  onTypeChange: (v: EventType | 'all') => void;
  onSeverityChange: (v: Severity | 'all') => void;
  onStatusChange: (v: string) => void;
}

export function Filters({
  typeFilter,
  severityFilter,
  statusFilter,
  onTypeChange,
  onSeverityChange,
  onStatusChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5 text-slate-400 text-sm">
        <Filter className="w-4 h-4" />
        <span>Filtros:</span>
      </div>

      <select
        value={typeFilter}
        onChange={(e) => onTypeChange(e.target.value as EventType | 'all')}
        className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
      >
        <option value="all">Todos los tipos</option>
        <option value="deforestacion">Deforestación</option>
        <option value="incendio">Incendios</option>
        <option value="nivel_rio">Nivel de río</option>
      </select>

      <select
        value={severityFilter}
        onChange={(e) => onSeverityChange(e.target.value as Severity | 'all')}
        className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
      >
        <option value="all">Todas las severidades</option>
        <option value="baja">Baja</option>
        <option value="media">Media</option>
        <option value="alta">Alta</option>
        <option value="critica">Crítica</option>
      </select>

      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
        className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
      >
        <option value="all">Todos los estados</option>
        <option value="activo">Activo</option>
        <option value="en_monitoreo">En monitoreo</option>
        <option value="resuelto">Resuelto</option>
      </select>
    </div>
  );
}
