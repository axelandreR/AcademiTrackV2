
import React from 'react';
import { AlertCircle, ShieldCheck, UserCircle2, Calendar as CalendarIcon, Clock, ChevronRight } from 'lucide-react';
import { Conflict } from '../../services/conflictDetection';

interface ConflictsRadarProps {
    conflictData: Conflict[];
    onCorrectConflict: (view: 'Instructor' | 'Aula', filterValue: string, date: string) => void;
}

const ConflictsRadar: React.FC<ConflictsRadarProps> = ({ conflictData, onCorrectConflict }) => {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h3 className="text-xl font-black text-slate-900">Radar de Conflictos</h3>
                    <p className="text-sm text-slate-500">Detección proactiva de solapamientos en recursos (Docentes y Aulas).</p>
                </div>
                <div className="px-4 py-2 bg-rose-50 rounded-2xl border border-rose-100 text-rose-600 text-xs font-black uppercase tracking-widest flex items-center space-x-2">
                    <AlertCircle size={16} />
                    <span>{conflictData.length} Conflictos Detectados</span>
                </div>
            </div>

            {conflictData.length === 0 ? (
                <div className="bg-white rounded-[40px] p-20 flex flex-col items-center justify-center text-center shadow-xl border border-slate-100">
                    <div className="p-8 bg-emerald-50 text-emerald-500 rounded-full mb-6">
                        <ShieldCheck size={64} />
                    </div>
                    <h4 className="text-2xl font-black text-slate-900">Programación Limpia</h4>
                    <p className="text-slate-400 mt-2 max-w-sm">No se han detectado colisiones de horario en todo el semestre. ¡Excelente trabajo!</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {conflictData.map((c, idx) => (
                        <div key={idx} className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 hover:border-rose-200 transition-all flex flex-col">
                            <div className="flex items-start justify-between mb-6">
                                <div className="flex items-center space-x-4">
                                    <div className={`p-3 rounded-2xl ${c.type === 'instructor' ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600'}`}>
                                        {c.type === 'instructor' ? <UserCircle2 size={24} /> : <CalendarIcon size={24} />}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{c.type === 'instructor' ? 'Conflicto Docente' : 'Conflicto de Aula'}</p>
                                        <h4 className="text-base font-black text-slate-900 uppercase leading-none mt-1">{c.target}</h4>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-[10px] font-black uppercase tracking-tighter">Cruce Crítico</div>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-2xl p-4 flex-1 space-y-4">
                                <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-200 pb-2">
                                    <span>Desde: {c.weekLabel}</span>
                                    <span>Día: {c.day}</span>
                                </div>

                                <div className="grid grid-cols-1 gap-3">
                                    <div className="flex items-center space-x-3 text-xs font-bold text-slate-700">
                                        <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                        <span className="truncate flex-1">{c.taskA.courseName} ({c.taskA.startTime}-{c.taskA.endTime})</span>
                                    </div>
                                    <div className="flex items-center space-x-3 text-xs font-bold text-slate-700">
                                        <div className="w-2 h-2 rounded-full bg-rose-500" />
                                        <span className="truncate flex-1">{c.taskB.courseName} ({c.taskB.startTime}-{c.taskB.endTime})</span>
                                    </div>
                                </div>

                                <div className="pt-2 flex items-center space-x-2 text-rose-600 text-[10px] font-black uppercase">
                                    <Clock size={14} />
                                    <span>Solapamiento en: {c.overlapTime}</span>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    const view = c.type === 'instructor' ? 'Instructor' : 'Aula';
                                    onCorrectConflict(view, c.target, c.actualDate);
                                }}
                                className="mt-6 w-full py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all flex items-center justify-center space-x-2 shadow-lg shadow-slate-100"
                            >
                                <span>Corregir en Horario</span>
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ConflictsRadar;
