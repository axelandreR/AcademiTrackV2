import React, { useEffect, useState } from 'react';
import { Clock, X, Save } from 'lucide-react';
import { OccupancyAvailability, DayTypeWindow } from '../../services/occupancyCalculations';

interface OccupancyAvailabilityModalProps {
    isOpen: boolean;
    onClose: () => void;
    availability: OccupancyAvailability;
    onSave: (availability: OccupancyAvailability) => Promise<void>;
}

const DayWindowField: React.FC<{
    label: string;
    window: DayTypeWindow;
    onChange: (window: DayTypeWindow) => void;
    hint?: string;
}> = ({ label, window, onChange, hint }) => (
    <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        <div className="flex items-center gap-2">
            <input
                type="time"
                value={window.start}
                onChange={e => onChange({ ...window, start: e.target.value })}
                className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-400"
            />
            <span className="text-slate-400 font-black text-xs shrink-0">a</span>
            <input
                type="time"
                value={window.end}
                onChange={e => onChange({ ...window, end: e.target.value })}
                className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-400"
            />
        </div>
        {hint && <p className="text-[9px] text-slate-400 font-bold">{hint}</p>}
    </div>
);

/**
 * Ventana de disponibilidad de las aulas (Lunes-Viernes / Sábado / Domingo por separado
 * — domingo suele cortar más temprano que sábado), usada como el "disponible" del
 * reporte de Ocupabilidad. Vive en app_settings (igual que la fecha límite de
 * auditoría), así que aplica a todas las aulas del reporte, no aula por aula. Modal (no
 * panel inline) para no competir por espacio con el resto de la cabecera.
 */
const OccupancyAvailabilityModal: React.FC<OccupancyAvailabilityModalProps> = ({ isOpen, onClose, availability, onSave }) => {
    const [draft, setDraft] = useState(availability);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) setDraft(availability);
    }, [isOpen, availability]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(draft);
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-100">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-cyan-100 text-cyan-600"><Clock size={20} /></div>
                        <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Disponibilidad de Aulas</h3>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="p-2 hover:bg-white rounded-xl transition-all">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        Define el horario en que las aulas están disponibles — se usa como el "disponible" al calcular el % de ocupación de todos los reportes.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <DayWindowField
                            label="Lunes a Viernes"
                            window={draft.weekday}
                            onChange={w => setDraft(d => ({ ...d, weekday: w }))}
                        />
                        <DayWindowField
                            label="Sábado"
                            window={draft.saturday}
                            onChange={w => setDraft(d => ({ ...d, saturday: w }))}
                        />
                        <DayWindowField
                            label="Domingo"
                            window={draft.sunday}
                            onChange={w => setDraft(d => ({ ...d, sunday: w }))}
                            hint="Misma hora en ambos campos = sin disponibilidad ese día."
                        />
                    </div>
                </div>

                <div className="p-6 bg-slate-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-2.5 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-slate-700 transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Save size={14} />
                        <span>{isSaving ? 'Guardando...' : 'Guardar Disponibilidad'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OccupancyAvailabilityModal;
