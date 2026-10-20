import { TreePine, Flame, Waves, AlertTriangle, MapPin, Bell } from 'lucide-react';
import { DashboardStats } from '../types';

interface Props {
  stats: DashboardStats;
  mode: 'real' | 'demo';
  historicalFocos?: number;
  historicalInfluenceFocos?: number;
}

export function StatsCards({
  stats,
  mode,
  historicalFocos = 0,
  historicalInfluenceFocos = 0,
}: Props) {
  const cards = [
    {
      label: 'Eventos Activos',
      value: stats.totalActivos,
      icon: AlertTriangle,
      color: 'from-amber-500/20 to-amber-600/5 border-amber-500/30',
      iconColor: 'text-amber-400',
    },
    {
      label: 'Deforestación · simulado',
      value: stats.deforestacion,
      icon: TreePine,
      color: 'from-orange-500/20 to-orange-600/5 border-orange-500/30',
      iconColor: 'text-orange-400',
    },
    {
      label: historicalFocos > 0
        ? 'Captura histórica · NASA FIRMS'
        : mode === 'real'
          ? 'Focos reales · NASA FIRMS'
          : 'Focos simulados · demo',
      value: historicalFocos > 0
        ? `${stats.incendios} dentro del Guaviare · ${historicalInfluenceFocos} en zona de influencia`
        : stats.incendios,
      icon: Flame,
      color: 'from-red-500/20 to-red-600/5 border-red-500/30',
      iconColor: 'text-red-400',
    },
    {
      label: 'Río · simulado',
      value: stats.nivelesRio,
      icon: Waves,
      color: 'from-blue-500/20 to-blue-600/5 border-blue-500/30',
      iconColor: 'text-blue-400',
    },
    {
      label: 'Hectáreas · simulado',
      value: stats.hectareasEstimadas.toFixed(1),
      icon: MapPin,
      color: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'Alertas hoy',
      value: stats.alertasHoy,
      icon: Bell,
      color: 'from-violet-500/20 to-violet-600/5 border-violet-500/30',
      iconColor: 'text-violet-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6 sm:gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`bg-gradient-to-br ${card.color} border rounded-xl p-3 sm:p-4 backdrop-blur-sm`}
        >
          <div className="flex items-center justify-between mb-2">
            <card.icon className={`w-5 h-5 ${card.iconColor}`} />
          </div>
          <div className={`${typeof card.value === 'string' ? 'text-base sm:text-lg' : 'text-2xl'} break-words font-bold text-white tracking-tight`}>
            {card.value}
          </div>
          <div className="text-xs text-slate-400 mt-1">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
