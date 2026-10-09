import React, { useEffect, useMemo, useState } from 'react';
import { X, Scissors, AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { ProcessedSchedule, RoomData } from '../types';
import { getBlockWeeks, planClassSplit, minutesToTime, SplitPlan } from '../services/classSplit';
import { timeToMinutes } from '../utils/timeUtils';

interface SplitClassModalProps {
    isOpen: boolean;
    schedule: ProcessedSchedule | null;
    allSchedules: ProcessedSchedule[];
    rooms: RoomData[];
    onClose: () => void;
    onConfirm: (original: ProcessedSchedule, plan: SplitPlan) => void;
}

const fieldCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none';
const labelCls = 'block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1';

const SplitClassModal: React.FC<SplitClassModalProps> = ({ isOpen, schedule, allSchedules, rooms, onClose, onConfirm }) => {
    const [fromWeek, setFromWeek] = useState(0);
    const [toWeek, setToWeek] = useState(0);
    const [part1End, setPart1End] = useState('');
    const [part2Start, setPart2Start] = useState('');
    const [b1, setB1] = useState(''); const [r1, setR1] = useState('');
    const [b2, setB2] = useState(''); const [r2, setR2] = useState('');
    const [refrigerio, setRefrigerio] = useState(false);

    const weeks = useMemo(() => schedule ? getBlockWeeks(schedule.startDate, schedule.endDate, schedule.days) : [], [schedule]);

    useEffect(() => {
        if (!isOpen || !schedule) return;
        const start = timeToMinutes(schedule.startTime), end = timeToMinutes(schedule.endTime);
        const half = start + Math.max(15, Math.round((end - start) / 2 / 15) * 15);
        const p1 = Math.min(half, end - 15);
        setFromWeek(0);
        setToWeek(Math.max(0, weeks.length - 1));
        setPart1End(minutesToTime(p1));
        setPart2Start(minutesToTime(Math.min(p1 + 45, end)));
        setB1(schedule.building || ''); setR1(schedule.room || '');
        setB2(schedule.building || ''); setR2(schedule.room || '');
        setRefrigerio(false);
    }, [isOpen, schedule, weeks.length]);

    const plan = useMemo(() => {
        if (!schedule) return null;
        return planClassSplit(schedule, {
            fromWeekIdx: fromWeek, toWeekIdx: toWeek, part1End, part2Start,
            part1Building: b1, part1Room: r1, part2Building: b2, part2Room: r2, createRefrigerio: refrigerio,
        }, allSchedules);
    }, [schedule, fromWeek, toWeek, part1End, part2Start, b1, r1, b2, r2, refrigerio, allSchedules]);

    if (!isOpen || !schedule || !plan) return null;

    const buildings = Array.from(new Set(rooms.map(r => r.building).filter(Boolean))).sort();
    const roomsOf = (b: string) => Array.from(new Set(rooms.filter(r => !b || r.building === b).map(r => r.room).filter(Boolean))).sort();
    const total = timeToMinutes(schedule.endTime) - timeToMinutes(schedule.startTime);
    const fmtDur = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}min` : ''}`;
    const hasErrors = plan.errors.length > 0;
    const sums = !hasErrors && plan.part1Min + plan.part2Min === plan.totalMin;

    const roomPicker = (b: string, r: string, setB: (v: string) => void, setR: (v: string) => void) => (
        <div className="grid grid-cols-2 gap-2">
            <div>
                <label className={labelCls}>Edificio</label>
                <select className={fieldCls} value={b} onChange={e => { setB(e.target.value); setR(''); }}>
                    {b && !buildings.includes(b) && <option value={b}>{b}</option>}
                    {buildings.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
            </div>
            <div>
                <label className={labelCls}>Aula</label>
                <select className={fieldCls} value={r} onChange={e => setR(e.target.value)}>
                    {r && !roomsOf(b).includes(r) && <option value={r}>{r}</option>}
                    {!r && <option value="">Elegir…</option>}
                    {roomsOf(b).map(x => <option key={x} value={x}>{x}</option>)}
                </select>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col border border-white/20">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-100 shrink-0"><Scissors size={20} /></div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-tight">Dividir clase</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 truncate">
                                NRC {schedule.nrc} · {schedule.courseName} · {schedule.days.map(d => d.slice(0, 3)).join('/')} {schedule.startTime}–{schedule.endTime} ({fmtDur(total)})
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="p-2.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-900 shrink-0"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl text-amber-700 text-[11px] font-bold leading-snug">
                        Solo en simulación: los cambios no se guardan en la BD real hasta que uses "Aplicar cambios reales".
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Aplicar desde</label>
                            <select className={fieldCls} value={fromWeek} onChange={e => setFromWeek(Number(e.target.value))}>
                                {weeks.map(w => <option key={w.index} value={w.index}>{w.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Hasta</label>
                            <select className={fieldCls} value={toWeek} onChange={e => setToWeek(Number(e.target.value))}>
                                {weeks.map(w => <option key={w.index} value={w.index}>{w.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl border border-slate-200 space-y-3">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-900">Parte 1</p>
                            <div className="grid grid-cols-2 gap-2">
                                <div><label className={labelCls}>Inicio (fijo)</label><div className={`${fieldCls} bg-slate-100 text-slate-500`}>{schedule.startTime}</div></div>
                                <div><label className={labelCls}>Termina</label><input type="time" step={60} className={fieldCls} value={part1End} onChange={e => setPart1End(e.target.value)} /></div>
                            </div>
                            {roomPicker(b1, r1, setB1, setR1)}
                        </div>
                        <div className="p-4 rounded-2xl border border-slate-200 space-y-3">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-900">Parte 2</p>
                            <div className="grid grid-cols-2 gap-2">
                                <div><label className={labelCls}>Inicia</label><input type="time" step={60} className={fieldCls} value={part2Start} onChange={e => setPart2Start(e.target.value)} /></div>
                                <div><label className={labelCls}>Termina (auto)</label><div className={`${fieldCls} bg-slate-100 text-slate-500`}>{hasErrors && plan.part2Min <= 0 ? '—' : plan.part2End}</div></div>
                            </div>
                            {roomPicker(b2, r2, setB2, setR2)}
                        </div>
                    </div>

                    <div className={`p-3 rounded-2xl text-xs font-black flex items-center gap-2 ${sums ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                        {sums && <CheckCircle size={16} className="shrink-0" />}
                        <span>
                            Parte 1: {plan.part1Min > 0 ? plan.part1Min : '—'} min + Parte 2: {plan.part2Min > 0 ? plan.part2Min : '—'} min = {sums ? plan.part1Min + plan.part2Min : '—'} min (original {plan.totalMin} min)
                            {plan.gapMin > 0 && !hasErrors ? ` · hueco ${plan.gapMin} min (${part1End}–${part2Start})` : ''}
                        </span>
                    </div>

                    <label className={`flex items-center gap-3 p-3 rounded-2xl border text-sm font-bold ${plan.gapMin > 0 && !hasErrors ? 'border-slate-200 text-slate-700 cursor-pointer' : 'border-slate-100 text-slate-300'}`}>
                        <input type="checkbox" className="w-4 h-4" checked={refrigerio && plan.gapMin > 0} disabled={!(plan.gapMin > 0 && !hasErrors)} onChange={e => setRefrigerio(e.target.checked)} />
                        <span>Crear refrigerio en el hueco {plan.gapMin > 0 && !hasErrors ? `(${part1End}–${part2Start} · ${plan.gapMin} min)` : '(no hay hueco entre las partes)'}</span>
                    </label>

                    {plan.errors.map((e, i) => (
                        <div key={i} className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-black flex items-start gap-2"><AlertCircle size={16} className="shrink-0 mt-0.5" />{e}</div>
                    ))}
                    {plan.warnings.map((w, i) => (
                        <div key={i} className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-700 text-xs font-bold flex items-start gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{w}</div>
                    ))}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 transition-all">Cancelar</button>
                    <button
                        onClick={() => onConfirm(schedule, plan)}
                        disabled={hasErrors}
                        className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Dividir clase
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SplitClassModal;
