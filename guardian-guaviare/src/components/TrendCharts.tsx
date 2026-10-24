import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import type { FuegoReal } from '../services/fuegosApi';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

export interface DailyCount {
  date: string;
  inside: number;
  outside: number;
}

interface Props {
  readings?: Array<{ timestamp: number; riverLevel: number }>;
  mode: 'real' | 'demo';
  dailyCounts?: DailyCount[];
  hotspots?: FuegoReal[];
  last5DaysCount: number;
  showSimulation: boolean;
}

const barOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 250 },
  plugins: {
    legend: {
      display: true,
      labels: {
        color: '#cbd5e1',
        boxWidth: 12,
        boxHeight: 12,
      },
    },
    tooltip: {
      backgroundColor: '#0f172a',
      titleColor: '#e2e8f0',
      bodyColor: '#cbd5e1',
      borderColor: '#475569',
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      ticks: {
        color: '#94a3b8',
        maxRotation: 0,
      },
      grid: { color: 'rgba(71, 85, 105, 0.25)' },
      border: { color: '#475569' },
      stacked: true,
    },
    y: {
      beginAtZero: true,
      ticks: { color: '#cbd5e1', precision: 0 },
      grid: { color: 'rgba(71, 85, 105, 0.35)' },
      border: { color: '#475569' },
      stacked: true,
    },
  },
};

const lineOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 250 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0f172a',
      titleColor: '#e2e8f0',
      bodyColor: '#cbd5e1',
      borderColor: '#475569',
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
      grid: { color: 'rgba(71, 85, 105, 0.25)' },
      border: { color: '#475569' },
    },
    y: {
      beginAtZero: false,
      ticks: { color: '#cbd5e1' },
      grid: { color: 'rgba(71, 85, 105, 0.35)' },
      border: { color: '#475569' },
    },
  },
};

function formatDateLabel(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00Z');
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    timeZone: 'America/Bogota',
  }).format(date);
}

function formatHourLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  }).format(new Date(timestamp));
}

export function TrendCharts({
  readings = [],
  dailyCounts = [],
  hotspots = [],
  last5DaysCount,
  showSimulation,
}: Props) {
  const hasRecentHotspots = hotspots.length > 0;
  const dailySeries = dailyCounts.map((day) => ({
    label: formatDateLabel(day.date),
    inside: day.inside,
    outside: day.outside,
  }));
  const hasDailyCounts = dailySeries.some((day) => day.inside + day.outside > 0);
  const hotspotSeries = hasRecentHotspots
    ? [
      { label: 'hace 24–18 h', inside: 0, outside: 0 },
      { label: 'hace 18–12 h', inside: 0, outside: 0 },
      { label: 'hace 12–6 h', inside: 0, outside: 0 },
      { label: 'últimas 6 h', inside: 0, outside: 0 },
    ]
    : hasDailyCounts
      ? dailySeries
      : last5DaysCount > 0
        ? [{ label: 'últimos 5 días', inside: last5DaysCount, outside: 0 }]
        : [];

  if (hasRecentHotspots) {
    const now = Date.now();
    for (const hotspot of hotspots) {
      const ageHours = Math.max(0, (now - Date.parse(hotspot.timestamp)) / 3_600_000);
      const index = Math.min(3, Math.floor(ageHours / 6));
      const bucket = hotspotSeries[index];
      if (bucket) {
        if (hotspot.inGuaviare) bucket.inside += 1;
        else bucket.outside += 1;
      }
    }
  }

  const chartHasData = hotspotSeries.some((day) => day.inside + day.outside > 0);
  const firesData = {
    labels: hotspotSeries.map((day) => day.label),
    datasets: [
      {
        label: 'Dentro del Guaviare',
        data: hotspotSeries.map((day) => day.inside),
        backgroundColor: '#fb7185',
        borderColor: '#fb7185',
        borderWidth: 1,
      },
      {
        label: 'Zona de influencia',
        data: hotspotSeries.map((day) => day.outside),
        backgroundColor: '#f59e0b',
        borderColor: '#f59e0b',
        borderWidth: 1,
      },
    ],
  };
  const riverBuckets = new Map<number, number[]>();
  for (const reading of readings) {
    const minute = Math.floor(reading.timestamp / 60_000) * 60_000;
    const values = riverBuckets.get(minute) ?? [];
    values.push(reading.riverLevel);
    riverBuckets.set(minute, values);
  }
  const riverSeries = [...riverBuckets.entries()]
    .sort(([first], [second]) => first - second)
    .map(([timestamp, values]) => ({
      time: formatHourLabel(timestamp),
      level: values.reduce((sum, value) => sum + value, 0) / values.length,
    }));

  return (
    <section aria-label="Gráficos de tendencia" className="grid min-w-0 grid-cols-1 gap-4">
      <article className="min-w-0 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">
          Focos NASA FIRMS · {hasRecentHotspots ? 'últimas 24 h' : 'últimos 5 días'}
        </h2>
        <div className="relative h-56 w-full sm:h-64">
          {chartHasData ? (
            <Bar data={firesData} options={barOptions} />
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-slate-400">
              Sin focos detectados en los últimos 5 días.
            </p>
          )}
        </div>
      </article>
      {showSimulation && (
        <article className="min-w-0 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Nivel del río · simulado</h2>
          <div className="relative h-56 w-full sm:h-64">
            {riverSeries.length > 0 ? (
              <Line
                data={{
                  labels: riverSeries.map((point) => point.time),
                  datasets: [{
                    label: 'Nivel del río (m)',
                    data: riverSeries.map((point) => point.level),
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    pointRadius: 3,
                    tension: 0.25,
                  }],
                }}
                options={lineOptions}
              />
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-slate-400">
                Sin lecturas simuladas en el rango disponible.
              </p>
            )}
          </div>
        </article>
      )}
    </section>
  );
}
