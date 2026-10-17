import { AlertLog } from '../types';
import { formatRelative } from '../utils/format';
import { Bell, MessageSquare, Phone } from 'lucide-react';

interface Props {
  logs: AlertLog[];
}

export function AlertLogPanel({ logs }: Props) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2">
        <Bell className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-semibold text-slate-200">Historial de alertas</h3>
        <span className="ml-auto text-xs text-slate-500">{logs.length}</span>
      </div>

      <div className="max-h-48 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-sm">Aún no se han enviado alertas</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="px-4 py-2.5 border-b border-slate-800/50 text-sm">
              <div className="flex items-center gap-2 mb-0.5">
                {log.channel === 'sms' && <Phone className="w-3.5 h-3.5 text-blue-400" />}
                {log.channel === 'whatsapp' && <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />}
                {log.channel === 'ambos' && (
                  <>
                    <Phone className="w-3.5 h-3.5 text-blue-400" />
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                  </>
                )}
                <span className="text-slate-300 font-medium capitalize">{log.channel}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {log.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">{log.message.split('\n')[0]}</p>
              <div className="text-[11px] text-slate-600 mt-0.5">
                {formatRelative(log.timestamp)} · {log.recipients} destinatarios
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
