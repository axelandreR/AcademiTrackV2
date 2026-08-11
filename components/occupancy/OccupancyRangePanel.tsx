import React, { useEffect, useState } from 'react';
import { CalendarRange, X, Save } from 'lucide-react';

interface OccupancyRangeModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** "YYYY-MM-DD" */
    rangeStart: string;
    rangeEnd: string;
    onSave: (rangeStart: string, rangeEnd: string) => Promise<void>;
}

/**
 * Rango de fechas sobre el que se calcula la Ocupabilidad — antes siempre era el
 * semestre completo. Semanas de cierre/exámenes con muy poca carga programada (ej. tras
 * un corte a mitad de ciclo) arrastran hacia abajo el promedio de TODO el periodo si se
 * incluyen; este control deja acotar el reporte al tramo que realmente se quiere medir.
 * Modal (no panel inline) para no competir por espacio con el resto de la cabecera.
 */
const OccupancyRangeModal: React.FC<OccupancyRangeModalProps> = ({ isOpen, onClose, rangeStart, rangeEnd, onSave }) => {
    const [draftStart, setDraftStart] = useState(rangeStart);
    const [draftEnd, setDraftEnd] = useState(rangeEnd);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) { setDraftStart(rangeStart); setDraftEnd(rangeEnd); }
    }, [isOpen, rangeStart, rangeEnd]);

    if (!isOpen) return null;

    const isValid = !!draftStart && !!draftEnd && draftStart <= draftEnd;

    const handleSave = async () => {
        if (!isValid) return;
        setIsSaving(true);
        try {
            await onSave(draftStart, draftEnd);
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-100">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600"><CalendarRange size={20} /></div>
                        <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Rango del Periodo</h3>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="p-2 hover:bg-white rounded-xl transition-all">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        Acota el reporte a un tramo de semanas — útil si un corte a mitad de ciclo (menos carga programada) está arrastrando hacia abajo el promedio de todo el periodo.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Inicio</label>
                            <input
                                type="date"
                                value={draftStart}
                                onChange={e => setDraftStart(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fin</label>
                            <input
                                type="date"
                                value={draftEnd}
                                onChange={e => setDraftEnd(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                    {!isValid && draftStart && draftEnd && (
                        <p className="text-[10px] font-bold text-rose-500">La fecha de inicio debe ser anterior o igual a la de fin.</p>
                    )}
                </div>

                <div className="p-6 bg-slate-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-2.5 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-slate-700 transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!isValid || isSaving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Save size={14} />
                        <span>{isSaving ? 'Guardando...' : 'Guardar Rango'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OccupancyRangeModal;
