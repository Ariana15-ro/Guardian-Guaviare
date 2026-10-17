import { EventType, Severity } from '../types';

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Bogota',
});

const relativeFormatter = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' });

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Fecha inválida: ${iso}`);
  return dateFormatter.format(date);
}

export function formatRelative(iso: string): string {
  const date = new Date(iso);
  const elapsedSeconds = (date.getTime() - Date.now()) / 1000;
  if (Number.isNaN(elapsedSeconds)) throw new RangeError(`Fecha inválida: ${iso}`);

  const units: {
    unit: Intl.RelativeTimeFormatUnit;
    seconds: number;
    threshold: number;
  }[] = [
    { unit: 'second', seconds: 1, threshold: 60 },
    { unit: 'minute', seconds: 60, threshold: 3_600 },
    { unit: 'hour', seconds: 3_600, threshold: 86_400 },
    { unit: 'day', seconds: 86_400, threshold: 604_800 },
    { unit: 'week', seconds: 604_800, threshold: 2_419_200 },
    { unit: 'month', seconds: 2_592_000, threshold: 31_536_000 },
    { unit: 'year', seconds: 31_536_000, threshold: Infinity },
  ];

  for (const { unit, seconds, threshold } of units) {
    if (Math.abs(elapsedSeconds) < threshold) {
      return relativeFormatter.format(Math.round(elapsedSeconds / seconds), unit);
    }
  }

  return relativeFormatter.format(Math.round(elapsedSeconds / 31_536_000), 'year');
}

export function severityColor(severity: Severity): string {
  const map: Record<Severity, string> = {
    baja: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    media: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    alta: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    critica: 'bg-red-500/20 text-red-400 border-red-500/40',
  };
  return map[severity];
}

export function typeColor(type: EventType): string {
  const map: Record<EventType, string> = {
    deforestacion: 'text-orange-400',
    incendio: 'text-red-400',
    nivel_rio: 'text-blue-400',
  };
  return map[type];
}

export function typeLabel(type: EventType): string {
  const map: Record<EventType, string> = {
    deforestacion: 'Deforestación',
    incendio: 'Incendio',
    nivel_rio: 'Nivel de Río',
  };
  return map[type];
}

export function typeIcon(type: EventType): string {
  const map: Record<EventType, string> = {
    deforestacion: '🌲',
    incendio: '🔥',
    nivel_rio: '🌊',
  };
  return map[type];
}

export function severityLabel(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}
