import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    /** Texto del botón que ejecuta la acción. Por defecto "Confirmar". */
    confirmLabel?: string;
    /** 'danger' (rojo) para acciones destructivas; 'default' (oscuro) para el resto. */
    variant?: 'danger' | 'default';
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Diálogo de confirmación con el mismo lenguaje visual del resto de la app (esquinas
 * redondeadas, animación de entrada), en vez del window.confirm() nativo que se veía
 * ajeno y no permitía mostrar contexto del registro afectado.
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen, title, message, confirmLabel = 'Confirmar', variant = 'default', onConfirm, onCancel
}) => {
    if (!isOpen) return null;

    const isDanger = variant === 'danger';

    return (
        <div
            className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-100">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-xl ${isDanger ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>
                            <AlertTriangle size={20} />
                        </div>
                        <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">{title}</h3>
                    </div>
                    <button onClick={onCancel} aria-label="Cerrar" className="p-2 hover:bg-white rounded-xl transition-all">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">{message}</p>
                </div>
                <div className="p-6 bg-slate-50 flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-6 py-2.5 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-slate-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        autoFocus
                        className={`px-6 py-2.5 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 ${isDanger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800'}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
