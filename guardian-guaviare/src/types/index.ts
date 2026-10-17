export type EventType = 'deforestacion' | 'incendio' | 'nivel_rio';

export type Severity = 'baja' | 'media' | 'alta' | 'critica';

export interface SensorEvent {
  id: string;
  type: EventType;
  severity: Severity;
  lat: number;
  lng: number;
  title: string;
  description: string;
  timestamp: string;
  value?: number; // hectáreas, temperatura, o nivel en metros
  municipality: string;
  status: 'activo' | 'resuelto' | 'en_monitoreo';
  source?: 'real' | 'simulated';
  confidence?: 'l' | 'n' | 'h';
  frp?: number;
  localTime?: string;
  satellite?: string;
}

export interface AlertLog {
  id: string;
  eventId: string;
  message: string;
  channel: 'sms' | 'whatsapp' | 'ambos';
  timestamp: string;
  recipients: number;
  status: 'enviado' | 'simulado' | 'fallido';
}

export interface DashboardStats {
  totalActivos: number;
  deforestacion: number;
  incendios: number;
  nivelesRio: number;
  hectareasEstimadas: number;
  alertasHoy: number;
}

export interface LiveIndicators {
  riverLevel: number;
  heatSpots: number;
  deforestationAlerts: number;
}
