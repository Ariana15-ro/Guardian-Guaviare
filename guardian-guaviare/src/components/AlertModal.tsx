import { useEffect, useRef, useState } from 'react';
import { SensorEvent } from '../types';
import { typeLabel, severityLabel, typeIcon } from '../utils/format';
import { X, MessageSquare, Phone, Send, CheckCircle2 } from 'lucide-react';

interface Props {
  event: SensorEvent | null;
  onClose: () => void;
  onConfirm: (event: SensorEvent, channel: 'sms' | 'whatsapp' | 'ambos', message: string) => void;
}

export function AlertModal({ event, onClose, onConfirm }: Props) {
  if (!event) return null;

  return (
    <AlertDialog
      key={event.id}
      event={event}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function AlertDialog({
  event,
  onClose,
  onConfirm,
}: {
  event: SensorEvent;
  onClose: () => void;
  onConfirm: Props['onConfirm'];
}) {
  const [channel, setChannel] = useState<'sms' | 'whatsapp' | 'ambos'>('ambos');
  const [sent, setSent] = useState(false);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [message, setMessage] = useState(() => {
    const value =
      event.type === 'deforestacion'
        ? `${event.value} ha`
        : event.type === 'incendio'
          ? `${event.value}°C`
          : `${event.value} m`;

    return `[Guardián Guaviare] ALERTA ${severityLabel(event.severity).toUpperCase()}
Tipo: ${typeLabel(event.type)}
Ubicación: ${event.municipality}
${event.title}
Valor: ${value}
Fecha: ${new Date(event.timestamp).toLocaleString('es-CO')}
Acción requerida.`;
  });

  useEffect(
    () => () => {
      if (closeTimeout.current) clearTimeout(closeTimeout.current);
    },
    []
  );

  const handleSend = () => {
    onConfirm(event, channel, message);
    setSent(true);
    closeTimeout.current = setTimeout(() => {
      setSent(false);
      onClose();
    }, 1800);
  };

  const handleClose = () => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">{typeIcon(event.type)}</span>
            <h3 className="font-semibold text-white">Enviar Alerta</h3>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {sent ? (
          <div className="p-10 flex flex-col items-center gap-3">
            <CheckCircle2 className="w-14 h-14 text-emerald-400" />
            <p className="text-lg font-medium text-white">Alerta simulada enviada</p>
            <p className="text-sm text-slate-400 text-center">
              En producción este mensaje saldría por {channel === 'ambos' ? 'SMS y WhatsApp' : channel.toUpperCase()}
            </p>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-4">
              <div className="bg-slate-800/60 rounded-lg p-3 text-sm">
                <div className="text-slate-400 text-xs mb-1">Evento seleccionado</div>
                <div className="text-white font-medium">{event.title}</div>
                <div className="text-slate-400 text-xs mt-1">
                  {typeLabel(event.type)} · {severityLabel(event.severity)} · {event.municipality}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-2 block">Canal de envío</label>
                <div className="flex gap-2">
                  {[
                    { id: 'sms' as const, label: 'SMS', icon: Phone },
                    { id: 'whatsapp' as const, label: 'WhatsApp', icon: MessageSquare },
                    { id: 'ambos' as const, label: 'Ambos', icon: Send },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setChannel(opt.id)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm transition ${
                        channel === opt.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                          : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <opt.icon className="w-4 h-4" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-2 block">Mensaje</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={7}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 resize-none font-mono"
                />
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-300">
                Modo simulación: no se envía ningún mensaje real. Se registra el log de la alerta.
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSend}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Simular envío
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
