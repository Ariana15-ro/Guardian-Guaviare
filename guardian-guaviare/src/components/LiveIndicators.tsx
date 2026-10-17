import { Flame, Waves, TreePine } from 'lucide-react';
import { LiveIndicators as LiveIndicatorValues } from '../types';

interface Props {
  values: LiveIndicatorValues;
}

type IndicatorStatus = 'normal' | 'alerta' | 'critico';

function statusFor(value: number, warning: number, critical: number): IndicatorStatus {
  if (value >= critical) return 'critico';
  if (value >= warning) return 'alerta';
  return 'normal';
}

const STATUS_STYLES: Record<IndicatorStatus, string> = {
  normal: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  alerta: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  critico: 'border-red-500/50 bg-red-500/10 text-red-300',
};

export function LiveIndicators({ values }: Props) {
  const cards = [
    {
      label: 'Nivel del río',
      value: `${values.riverLevel.toFixed(2)} m`,
      status:
        values.riverLevel >= 5.2
          ? 'critico'
          : values.riverLevel >= 4.8
            ? 'alerta'
            : 'normal',
      icon: Waves,
      description: 'Umbral de alerta: 4.80 m',
    },
    {
      label: 'Focos de calor',
      value: values.heatSpots,
      status: statusFor(values.heatSpots, 6, 12),
      icon: Flame,
      description: 'Detecciones activas simuladas',
    },
    {
      label: 'Alertas de deforestación',
      value: values.deforestationAlerts,
      status: statusFor(values.deforestationAlerts, 5, 10),
      icon: TreePine,
      description: 'Alertas activas simuladas',
    },
  ] satisfies {
    label: string;
    value: string | number;
    status: IndicatorStatus;
    icon: typeof Waves;
    description: string;
  }[];

  return (
    <section aria-label="Indicadores ambientales en vivo" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cards.map(({ label, value, status, icon: Icon, description }) => (
        <article
          key={label}
          className={`rounded-xl border p-3 transition-colors duration-500 sm:p-4 ${label === 'Nivel del río' ? 'col-span-2 sm:col-span-1' : ''} ${STATUS_STYLES[status]}`}
          aria-label={`${label}: ${value}, estado ${status}`}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-slate-200">{label}</h2>
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{description}</p>
          <p className="sr-only">Estado: {status}</p>
        </article>
      ))}
    </section>
  );
}
