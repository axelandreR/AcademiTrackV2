import React, { useState } from 'react';
import { X, CalendarRange, FileSpreadsheet } from 'lucide-react';

interface WeeklyHEExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (weekStart: Date) => Promise<void> | void;
}

// Algoritmo estándar ISO 8601: el lunes de la semana ISO "AAAA-Www" es el lunes de la
// semana que contiene el primer jueves del año.
const isoWeekToMonday = (isoWeek: string): Date | null => {
    const m = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const week = parseInt(m[2], 10);
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const mondayWeek1 = new Date(jan4);
    mondayWeek1.setDate(jan4.getDate() - jan4Day + 1);
    const monday = new Date(mondayWeek1);
    monday.setDate(mondayWeek1.getDate() + (week - 1) * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
};

const getISOWeekString = (date: Date): string => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const fmtLong = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

/**
 * Pide qué semana exportar (input nativo type="week") antes de generar el Excel especial
 * de simulación: dos tablas con el formato Turno x Día de ExtraHoursModal, una con todo
 * el horario de esa semana y otra solo con la carga extra importada.
 */
const WeeklyHEExportModal: React.FC<WeeklyHEExportModalProps> = ({ isOpen, onClose, onExport }) => {
    const [weekValue, setWeekValue] = useState(() => getISOWeekString(new Date()));
    const [isExporting, setIsExporting] = useState(false);

    if (!isOpen) return null;

    const monday = isoWeekToMonday(weekValue);
    const sunday = monday ? new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6) : null;

    const handleExport = async () => {
        if (!monday || isExporting) return;
        setIsExporting(true);
        try {
            await onExport(monday);
            onClose();
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-amber-100 text-amber-600">
                            <FileSpreadsheet size={20} />
                        </div>
                        <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Exportar Semana</h3>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="p-2 hover:bg-white rounded-xl transition-all">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        Elige la semana que quieres exportar. El Excel incluirá dos tablas con el formato de Programación de Horas Extras: una con el horario completo de esa semana y otra solo con la carga extra importada.
                    </p>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Semana</label>
                        <input
                            type="week"
                            value={weekValue}
                            onChange={(e) => setWeekValue(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-amber-500 focus:ring-0 transition-all font-bold text-slate-800 text-sm"
                        />
                    </div>
                    {monday && sunday && (
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
                            <CalendarRange size={14} className="shrink-0" />
                            <span>{fmtLong(monday)} — {fmtLong(sunday)}</span>
                        </div>
                    )}
                </div>

                <div className="p-6 pt-0 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-2.5 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-slate-700 transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={!monday || isExporting}
                        className="px-6 py-2.5 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isExporting && <div className="animate-spin h-3 w-3 border-2 border-white rounded-full border-t-transparent" />}
                        {isExporting ? 'Generando...' : 'Exportar Excel'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WeeklyHEExportModal;
