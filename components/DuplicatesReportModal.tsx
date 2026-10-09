import React, { useMemo, useState } from 'react';
import { X, Copy, Search, CheckCircle, Layers } from 'lucide-react';
import { ProcessedSchedule } from '../types';
import { findDuplicateOccurrences } from '../services/simulationReconcile';

interface DuplicatesReportModalProps {
    isOpen: boolean;
    schedules: ProcessedSchedule[];
    onClose: () => void;
    /** Abre las filas de ese NRC en la tabla de Registro Base. */
    onViewNrc: (nrc: string) => void;
}

const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const fmtKey = (k: string) => { const [, m, d] = k.split('-'); return `${d}/${m}`; };

/**
 * Reporte de solo lectura: sesiones (NRC + fecha + horario) que aparecen en más de una fila del
 * horario real — lo que en el visualizador se ve como cursos "uno encima de otro". No decide
 * cuál fila es la correcta ni borra nada: da los IDs para revisarlos en Registro Base.
 */
const DuplicatesReportModal: React.FC<DuplicatesReportModalProps> = ({ isOpen, schedules, onClose, onViewNrc }) => {
    const [onlyClasses, setOnlyClasses] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const groups = useMemo(() => (isOpen ? findDuplicateOccurrences(schedules) : []), [isOpen, schedules]);

    if (!isOpen) return null;
    const shown = onlyClasses ? groups.filter(g => !g.admin) : groups;

    const copyIds = async (key: string, ids: string[]) => {
        try {
            await navigator.clipboard.writeText(ids.join('\n'));
            setCopied(key);
            setTimeout(() => setCopied(c => (c === key ? null : c)), 1500);
        } catch { /* sin portapapeles: el usuario puede seleccionar los IDs a mano */ }
    };

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Duplicados en el horario real">
            <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col border border-slate-100">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-100 text-amber-600"><Layers size={20} /></div>
                        <div>
                            <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Sesiones duplicadas en el horario real</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Mismo NRC (o tarea), misma fecha y mismo horario en más de una fila · solo lectura</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="p-2 hover:bg-white rounded-xl transition-all"><X size={20} className="text-slate-400" /></button>
                </div>

                <div className="px-6 pt-4 flex items-center justify-between gap-3 shrink-0">
                    <p className="text-xs font-bold text-slate-500">{shown.length} {shown.length === 1 ? 'registro con duplicados' : 'registros con duplicados'}</p>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
                        <input type="checkbox" checked={onlyClasses} onChange={e => setOnlyClasses(e.target.checked)} />
                        Solo clases (ocultar tareas administrativas)
                    </label>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {shown.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-emerald-600">
                            <CheckCircle size={32} />
                            <p className="text-sm font-black">No se encontraron sesiones duplicadas.</p>
                        </div>
                    ) : shown.map(g => (
                        <div key={g.key} className="border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-slate-900 truncate">{g.label}</p>
                                    <p className="text-[11px] font-bold text-amber-600">
                                        {g.duplicatedSessions} {g.duplicatedSessions === 1 ? 'sesión repetida' : 'sesiones repetidas'}
                                        {g.sampleDates.length > 0 && <span className="text-slate-400"> · ej. {g.sampleDates.map(fmtKey).join(', ')}</span>}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button onClick={() => copyIds(g.key, g.rows.map(r => r.id))} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100">
                                        <Copy size={12} />{copied === g.key ? 'Copiado' : 'Copiar IDs'}
                                    </button>
                                    {!g.admin && g.nrc && (
                                        <button onClick={() => onViewNrc(g.nrc)} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100">
                                            <Search size={12} />Ver NRC
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                            <th className="px-4 py-2">ID de la fila</th><th className="px-4 py-2">Instructor</th><th className="px-4 py-2">Días / horario</th><th className="px-4 py-2">Fechas</th><th className="px-4 py-2">Ambiente</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {g.rows.map(r => (
                                            <tr key={r.id} className="border-b border-slate-50 last:border-0">
                                                <td className="px-4 py-2 font-mono text-[11px] text-slate-600 break-all">{r.id}</td>
                                                <td className="px-4 py-2 font-bold text-slate-700">{r.instructor || '—'}</td>
                                                <td className="px-4 py-2 text-slate-600">{r.days.join('/')} {r.startTime}–{r.endTime}</td>
                                                <td className="px-4 py-2 text-slate-600">{fmt(r.startDate)}–{fmt(r.endDate)}</td>
                                                <td className="px-4 py-2 text-slate-600">{[r.building, r.room].filter(Boolean).join(' - ') || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-5 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
                    <p className="text-[11px] text-slate-400 font-medium">Revisa cada caso en Registro Base antes de borrar: aquí no se modifica nada.</p>
                    <button onClick={onClose} className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Cerrar</button>
                </div>
            </div>
        </div>
    );
};

export default DuplicatesReportModal;
