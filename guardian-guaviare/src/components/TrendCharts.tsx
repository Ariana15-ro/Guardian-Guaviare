import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

export interface TrendReading {
  timestamp: number;
  riverLevel: number;
  heatSpots: number;
}

interface Props {
  readings: TrendReading[];
  mode: 'real' | 'demo';
}

const options: ChartOptions<'line'> = {
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
      ticks: {
        color: '#94a3b8',
        maxTicksLimit: 6,
        maxRotation: 0,
        callback(_value, index) {
          const timestamp = this.chart.data.labels?.[index];
          return typeof timestamp === 'number'
            ? new Intl.DateTimeFormat('es-CO', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hourCycle: 'h23',
              timeZone: 'America/Bogota',
            }).format(timestamp)
            : '';
        },
      },
      grid: { color: 'rgba(71, 85, 105, 0.25)' },
      border: { color: '#475569' },
    },
    y: {
      beginAtZero: false,
      ticks: { color: '#cbd5e1', precision: 0 },
      grid: { color: 'rgba(71, 85, 105, 0.35)' },
      border: { color: '#475569' },
    },
  },
};

function buildData(
  readings: TrendReading[],
  key: 'riverLevel' | 'heatSpots',
  color: string,
  unit: string
) {
  return {
    labels: readings.map((reading) => reading.timestamp),
    datasets: [
      {
        data: readings.map((reading) => reading[key]),
        borderColor: color,
        backgroundColor: `${color}22`,
        pointBackgroundColor: color,
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        label: unit,
      },
    ],
  };
}

export function TrendCharts({ readings, mode }: Props) {
  return (
    <section aria-label="Gráficos de tendencia" className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      <article className="min-w-0 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Nivel del río (m · simulado)</h2>
        <div className="relative h-56 w-full sm:h-64">
          <Line
            data={buildData(readings, 'riverLevel', '#38bdf8', 'Nivel (m)')}
            options={{
              ...options,
              scales: {
                ...options.scales,
                y: { ...options.scales?.y, min: 3, max: 7, ticks: { color: '#cbd5e1', stepSize: 1 } },
              },
            }}
          />
        </div>
      </article>
      <article className="min-w-0 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">
          {mode === 'real' ? 'Focos NASA FIRMS · últimas 24 h' : 'Tendencia de focos de calor (simulada)'}
        </h2>
        <div className="relative h-56 w-full sm:h-64">
          <Line
            data={buildData(readings, 'heatSpots', '#fb7185', 'Focos')}
            options={{
              ...options,
              scales: {
                ...options.scales,
                y: { ...options.scales?.y, beginAtZero: true, ticks: { color: '#cbd5e1', precision: 0 } },
              },
            }}
          />
        </div>
      </article>
    </section>
  );
}
