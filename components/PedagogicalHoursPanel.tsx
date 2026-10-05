import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { WeekPedagogicalHours, formatHP } from '../services/pedagogicalHours';

interface PedagogicalHoursPanelProps {
    week: WeekPedagogicalHours;
    top: number;
    onClose: () => void;
}

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const fmtDate = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });

const PedagogicalHoursPanel: React.FC<PedagogicalHoursPanelProps> = ({ week, top, onClose }) => {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const first = week.days[0]?.date;
    const last = week.days[week.days.length - 1]?.date;

    return (
        <div
            role="dialog"
            aria-label="Horas pedagógicas de la semana"
            className="absolute right-3 z-[96] w-[320px] max-w-[calc(100%-1.5rem)] bg-white/95 backdrop-blur border border-slate-200 rounded-2xl shadow-xl p-4"
            style={{ top }}
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-900 leading-none">Horas pedagógicas</h3>
                    {first && last && <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Semana {fmtDate(first)} – {fmtDate(last)}</p>}
                </div>
                <button onClick={onClose} aria-label="Cerrar panel de horas pedagógicas" className="p-1 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all">
                    <X size={14} />
                </button>
            </div>

            <table className="w-full text-xs">
                <thead>
                    <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <th className="text-left font-black pb-1">Día</th>
                        <th className="text-right font-black pb-1" title="Cursos del archivo ÷45 min (CNIU-108/126 y otras funciones ÷60)">Clases (HP)</th>
                        <th className="text-right font-black pb-1" title="Tareas administrativas asíncronas, en horas cronológicas">Asínc. (h)</th>
                    </tr>
                </thead>
                <tbody>
                    {week.days.map((d, i) => (
                        <tr key={i} className="border-t border-slate-100">
                            <td className="py-1 font-bold text-slate-700">{DAY_LABELS[i]} <span className="text-slate-400 font-medium">{fmtDate(d.date)}</span></td>
                            <td className={`py-1 text-right font-black tabular-nums ${d.classHP > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>{formatHP(d.classHP)}</td>
                            <td className={`py-1 text-right font-bold tabular-nums ${d.asyncAdminHours > 0 ? 'text-slate-600' : 'text-slate-300'}`}>{formatHP(d.asyncAdminHours)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="border-t-2 border-slate-900">
                        <td className="pt-1.5 font-black uppercase text-[10px] tracking-widest text-slate-900">Semana</td>
                        <td className="pt-1.5 text-right font-black tabular-nums text-emerald-700 text-sm">{formatHP(week.totalHP)} HP</td>
                        <td className="pt-1.5 text-right font-black tabular-nums text-slate-700">{formatHP(week.totalAsyncAdminHours)} h</td>
                    </tr>
                </tfoot>
            </table>

            <p className="text-[9px] leading-snug text-slate-400 mt-3">
                HP = cursos del archivo en horas pedagógicas (45 min; CNIU-108/126 y otras funciones, 60 min). Mismo criterio que la Meta de Horas Académicas de la auditoría. Las asíncronas administrativas se muestran aparte, en horas cronológicas.
            </p>
        </div>
    );
};

export default PedagogicalHoursPanel;
