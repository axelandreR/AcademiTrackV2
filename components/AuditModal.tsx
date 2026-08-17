
import React from 'react';
import { ShieldCheck, X, Activity, CheckCircle, Calendar as CalendarIcon, ShieldAlert, Clock, AlertTriangle, GitMerge, ArrowRight } from 'lucide-react';
import { Conflict } from '../services/conflictDetection';

interface AuditObservation {
    date: Date;
    type: 'academic' | 'contractual' | 'daily';
    meta: number;
    real: number;
}

interface AuditModalProps {
    isOpen: boolean;
    onClose: () => void;
    instructorName: string;
    instructorType: 'TC' | 'TP';
    observations: AuditObservation[];
    conflicts?: Conflict[];
    // Si no se provee, la sección de conflictos no ofrece salto (ej. contextos sin grilla).
    onJumpToWeek?: (date: Date) => void;
}

// Mismo parseo que el ?date= de SchedulePage (año/mes/día locales, sin pasar por el
// parser de strings de Date para evitar desfases de zona horaria).
const parseConflictDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const AuditModal: React.FC<AuditModalProps> = ({ isOpen, onClose, instructorName, instructorType, observations, conflicts = [], onJumpToWeek }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center space-x-5">
                        <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-100"><ShieldCheck size={28} /></div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase">Auditoría de Carga</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{instructorName} • {instructorType}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-900"><X size={24} /></button>
                </div>
                <div className="p-10 overflow-y-auto custom-scrollbar flex-1 space-y-10">
                    <section>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-rose-50 text-rose-600 rounded-xl"><GitMerge size={20} /></div>
                                <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Cruces de Horario</h4>
                            </div>
                            {conflicts.length === 0
                                ? <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><CheckCircle size={14} /><span>Sin cruces</span></div>
                                : <div className="flex items-center space-x-2 text-rose-600 bg-rose-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><AlertTriangle size={14} /><span>{conflicts.length} detectado{conflicts.length === 1 ? '' : 's'}</span></div>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {conflicts.map((c, i) => {
                                const conflictDate = parseConflictDate(c.actualDate);
                                const clickable = !!onJumpToWeek;
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        disabled={!clickable}
                                        onClick={() => onJumpToWeek?.(conflictDate)}
                                        title={clickable ? 'Ir a la semana de este cruce' : undefined}
                                        className={`p-5 bg-rose-50 border border-rose-100 rounded-3xl flex items-center justify-between text-left w-full transition-all ${clickable ? 'hover:bg-rose-100 hover:border-rose-300 cursor-pointer active:scale-[0.99]' : 'cursor-default'}`}
                                    >
                                        <div className="flex items-center space-x-4 min-w-0">
                                            <GitMerge size={20} className="text-rose-400 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-black text-rose-800/60 uppercase">{c.weekLabel} · {c.day}</p>
                                                <p className="text-xs font-black text-rose-900 truncate">{c.taskA.courseName} vs. {c.taskB.courseName}</p>
                                                <p className="text-[9px] font-bold text-rose-400 uppercase mt-0.5">Solapan: {c.overlapTime}</p>
                                            </div>
                                        </div>
                                        {clickable && <ArrowRight size={16} className="text-rose-400 shrink-0 ml-2" />}
                                    </button>
                                );
                            })}
                            {conflicts.length === 0 && <div className="col-span-full p-10 border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center text-slate-300"><CheckCircle size={48} className="mb-4 opacity-20" /><p className="text-xs font-black uppercase tracking-widest">Sin cruces de horario en el semestre.</p></div>}
                        </div>
                    </section>
                    <section className="pt-8 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Activity size={20} /></div>
                                <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Auditoría Académica (Hasta 28/06)</h4>
                            </div>
                            {observations.filter(o => o.type === 'academic').length === 0
                                ? <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><CheckCircle size={14} /><span>Sin discrepancias</span></div>
                                : <div className={`flex items-center space-x-2 ${instructorType === 'TC' ? 'text-amber-600 bg-amber-50' : 'text-rose-600 bg-rose-50'} px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest`}><AlertTriangle size={14} /><span>{instructorType === 'TC' ? 'Diferencia Informativa' : 'Observaciones'}</span></div>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {observations.filter(o => o.type === 'academic').map((obs, i) => (
                                <div key={i} className={`p-5 ${instructorType === 'TC' ? 'bg-amber-50/30 border-amber-100' : 'bg-rose-50 border-rose-100'} border rounded-3xl flex items-center justify-between`}>
                                    <div className="flex items-center space-x-4">
                                        <CalendarIcon size={20} className={instructorType === 'TC' ? 'text-amber-400' : 'text-rose-400'} />
                                        <div>
                                            <p className={`text-[10px] font-black ${instructorType === 'TC' ? 'text-amber-800/60' : 'text-rose-800/60'} uppercase`}>Semana {obs.date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</p>
                                            <p className={`text-xs font-black ${instructorType === 'TC' ? 'text-amber-900' : 'text-rose-900'}`}>Obs. Carga Académica</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-[10px] font-black ${instructorType === 'TC' ? 'text-amber-600' : 'text-rose-500'} uppercase`}>Dif: {(obs.real - obs.meta).toFixed(2)}h</p>
                                        <p className={`text-[9px] font-bold ${instructorType === 'TC' ? 'text-amber-400' : 'text-rose-400'} uppercase`}>Total: {obs.real.toFixed(2)}h / {obs.meta.toFixed(2)}h</p>
                                    </div>
                                </div>
                            ))}
                            {observations.filter(o => o.type === 'academic').length === 0 && <div className="col-span-full p-10 border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center text-slate-300"><CheckCircle size={48} className="mb-4 opacity-20" /><p className="text-xs font-black uppercase tracking-widest">Carga académica perfecta.</p></div>}
                        </div>
                    </section>
                    {instructorType === 'TC' && (
                        <section className="pt-8 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center space-x-3"><div className="p-2 bg-violet-50 text-violet-600 rounded-xl"><ShieldAlert size={20} /></div><h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Auditoría Contractual (Meta 46h)</h4></div>
                                {observations.filter(o => o.type === 'contractual').length === 0 ? <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><CheckCircle size={14} /><span>Cumple 46h</span></div> : <div className="flex items-center space-x-2 text-rose-600 bg-rose-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><AlertTriangle size={14} /><span>Fuera de contrato</span></div>}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {observations.filter(o => o.type === 'contractual').map((obs, i) => (
                                    <div key={i} className="p-5 bg-amber-50 border border-amber-100 rounded-3xl flex items-center justify-between">
                                        <div className="flex items-center space-x-4"><Clock size={20} className="text-amber-500" /><div><p className="text-[10px] font-black text-amber-800/60 uppercase">Semana {obs.date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</p><p className="text-xs font-black text-amber-900">Obs. Contractual (Meta 46h)</p></div></div>
                                        <div className="text-right"><p className="text-[10px] font-black text-amber-600 uppercase">Var: {(obs.real - 46).toFixed(2)}h</p><p className="text-[9px] font-bold text-amber-400 uppercase">Total: {obs.real.toFixed(2)}h / 46h</p></div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                    <section className="pt-8 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center space-x-3"><div className="p-2 bg-rose-50 text-rose-600 rounded-xl"><Clock size={20} /></div><h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Validación de Jornada Diaria</h4></div>
                            {observations.filter(o => o.type === 'daily').length === 0
                                ? <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><CheckCircle size={14} /><span>Sin excesos</span></div>
                                : <div className="flex items-center space-x-2 text-rose-600 bg-rose-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><AlertTriangle size={14} /><span>Exceso detectado</span></div>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {observations.filter(o => o.type === 'daily').map((obs, i) => (
                                <div key={i} className="p-5 bg-rose-50 border border-rose-100 rounded-3xl flex items-center justify-between">
                                    <div className="flex items-center space-x-4"><Clock size={20} className="text-rose-400" /><div><p className="text-[10px] font-black text-rose-800/60 uppercase">{obs.date.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'short' })}</p><p className="text-xs font-black text-rose-900">Exceso Jornada (Límite {obs.meta}h)</p></div></div>
                                    <div className="text-right"><p className="text-[10px] font-black text-rose-600 uppercase">Total: {obs.real.toFixed(2)}h</p><p className="text-[9px] font-bold text-rose-400 uppercase">Dif: +{(obs.real - obs.meta).toFixed(2)}h</p></div>
                                </div>
                            ))}
                            {observations.filter(o => o.type === 'daily').length === 0 && <div className="col-span-full p-10 border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center text-slate-300"><CheckCircle size={48} className="mb-4 opacity-20" /><p className="text-xs font-black uppercase tracking-widest">Jornadas diarias correctas.</p></div>}
                        </div>
                    </section>
                </div>
                <div className="px-10 py-8 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                    <button onClick={onClose} className="px-12 py-4 bg-slate-900 text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl hover:bg-slate-800 transition-all active:scale-95">Cerrar</button>
                </div>
            </div>
        </div>
    );
};

export default AuditModal;
