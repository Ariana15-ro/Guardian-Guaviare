import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { SensorEvent } from '../types';
import { useMemo } from 'react';
import { format, subDays, isAfter } from 'date-fns';
import { es } from 'date-fns/locale';

interface Props {
  events: SensorEvent[];
  mode: 'real' | 'demo';
  dailyCounts?: Array<{ date: string; inside: number; outside: number }>;
}

const COLORS = {
  deforestacion: '#f97316',
  incendio: '#ef4444',
  nivel_rio: '#3b82f6',
};

export function Charts({ events, mode, dailyCounts = [] }: Props) {
  const trendData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i);
      return {
        date: format(d, 'EEE', { locale: es }),
        full: d,
        deforestacion: 0,
        incendio: 0,
        nivel_rio: 0,
      };
    });

    events.forEach((ev) => {
      const evDate = new Date(ev.timestamp);
      const day = days.find((d) => {
        const start = new Date(d.full);
        start.setHours(0, 0, 0, 0);
        const end = new Date(d.full);
        end.setHours(23, 59, 59, 999);
        return isAfter(evDate, start) && !isAfter(evDate, end);
      });
      if (day && ev.source !== 'real') {
        day[ev.type]++;
      }
    });

    dailyCounts.forEach((dc) => {
      const dcDate = new Date(dc.date + 'T00:00:00Z');
      const day = days.find((d) => {
        const start = new Date(d.full);
        start.setHours(0, 0, 0, 0);
        const end = new Date(d.full);
        end.setHours(23, 59, 59, 999);
        return isAfter(dcDate, start) && !isAfter(dcDate, end);
      });
      if (day) {
        day.incendio += dc.inside;
      }
    });

    return days;
  }, [events, dailyCounts]);

  const pieData = useMemo(() => {
    const counts = { deforestacion: 0, incendio: 0, nivel_rio: 0 };
    events.forEach((e) => counts[e.type]++);
    return [
      { name: 'Deforestación', value: counts.deforestacion, color: COLORS.deforestacion },
      { name: 'Focos de calor', value: counts.incendio, color: COLORS.incendio },
      { name: 'Nivel Río', value: counts.nivel_rio, color: COLORS.nivel_rio },
    ];
  }, [events]);

  const severityData = useMemo(() => {
    const counts = { baja: 0, media: 0, alta: 0, critica: 0 };
    events.forEach((e) => counts[e.severity]++);
    return [
      { name: 'Baja', value: counts.baja, fill: '#22c55e' },
      { name: 'Media', value: counts.media, fill: '#eab308' },
      { name: 'Alta', value: counts.alta, fill: '#f97316' },
      { name: 'Crítica', value: counts.critica, fill: '#ef4444' },
    ];
  }, [events]);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Trend */}
      <div className="min-w-0 overflow-hidden lg:col-span-2 bg-slate-800/50 border border-slate-700/60 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Tendencia últimos 7 días</h3>
        <p className="mb-2 text-xs text-slate-400">
          {mode === 'real' ? 'Focos de calor: NASA FIRMS · río y deforestación: simulados' : 'Datos de eventos simulados'}
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#e2e8f0' }}
            />
            <Area type="monotone" dataKey="incendio" stackId="1" stroke={COLORS.incendio} fill={COLORS.incendio} fillOpacity={0.4} name="Focos reales" />
            <Area type="monotone" dataKey="deforestacion" stackId="1" stroke={COLORS.deforestacion} fill={COLORS.deforestacion} fillOpacity={0.4} name="Deforestación (simulado)" />
            <Area type="monotone" dataKey="nivel_rio" stackId="1" stroke={COLORS.nivel_rio} fill={COLORS.nivel_rio} fillOpacity={0.4} name="Nivel Río (simulado)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Distribution */}
      <div className="min-w-0 overflow-hidden bg-slate-800/50 border border-slate-700/60 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Distribución por tipo</h3>
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={60}
              paddingAngle={3}
              dataKey="value"
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-4 mt-1">
          {pieData.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
              {d.name} ({d.value})
            </div>
          ))}
        </div>
      </div>

      {/* Severity bars */}
      <div className="min-w-0 overflow-hidden lg:col-span-3 bg-slate-800/50 border border-slate-700/60 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Severidad de eventos</h3>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={severityData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
              {severityData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
