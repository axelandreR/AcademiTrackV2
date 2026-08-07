import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

export interface ToastState {
    message: string;
    type: 'success' | 'error';
}

interface ToastProps {
    toast: ToastState | null;
    onDismiss: () => void;
}

/**
 * Reemplaza alert() nativo para feedback de operaciones no bloqueantes (guardar/cargar/
 * aplicar/eliminar escenario, etc.) — alert() bloquea el hilo y en algunos contextos
 * (PWA instalada, ciertas políticas de seguridad, iframes) lanza una excepción no
 * capturada en vez de mostrarse, dejando la operación fallando en silencio.
 */
const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(onDismiss, 4000);
        return () => clearTimeout(timer);
    }, [toast, onDismiss]);

    if (!toast) return null;

    const isError = toast.type === 'error';

    return (
        <div className="fixed bottom-6 right-6 z-[500] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className={`flex items-start gap-3 max-w-sm w-full sm:w-auto bg-white rounded-2xl shadow-2xl border p-4 pr-3 ${isError ? 'border-rose-200' : 'border-emerald-200'}`}>
                <div className={`p-1.5 rounded-xl shrink-0 ${isError ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {isError ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
                </div>
                <p className="text-xs font-bold text-slate-700 leading-relaxed pt-1">{toast.message}</p>
                <button onClick={onDismiss} aria-label="Cerrar" className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all shrink-0">
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};

export default Toast;
