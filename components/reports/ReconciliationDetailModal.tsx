
import React from 'react';
import { X, CheckCircle, AlertTriangle, Database, Activity } from 'lucide-react';
import { ReconciliationResult, ProcessedSchedule } from '../../types';

interface ReconciliationDetailModalProps {
    result: ReconciliationResult;
    schedules: ProcessedSchedule[];
    onClose: () => void;
}

const ReconciliationDetailModal: React.FC<ReconciliationDetailModalProps> = ({ result, schedules, onClose }) => {
    const sched = schedules.find(s => s.id === result.id);

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
                    <div className="flex items-center space-x-4">
                        <div className={`p-3 rounded-2xl text-white shadow-xl ${result.status === 'ok' ? 'bg-emerald-600 shadow-emerald-100' :
                            result.status === 'discrepancy' ? 'bg-rose-600 shadow-rose-100' : 'bg-slate-600'
                            }`}>
                            {result.status === 'ok' ? <CheckCircle size={24} /> : <AlertTriangle size={24} />}
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 leading-tight">Detalle de Discrepancia</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{result.nrc} | {result.reference?.dia} {result.reference?.hora_inicio}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-full transition-colors"><X size={24} className="text-slate-400" /></button>
                </div>

                <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/30">
                    <div className="grid grid-cols-2 gap-8">
                        {/* Referencia Sistema */}
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full w-fit">
                                <Database size={12} />
                                <span>Reporte Institucional (Truth)</span>
                            </div>
                            <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-3">
                                <div><p className="text-[9px] font-black text-slate-400 uppercase">Docente</p><p className="text-xs font-black text-slate-700">{result.reference?.instructor_nombre}</p><p className="text-[10px] font-bold text-slate-400">ID: {result.reference?.instructor_id}</p></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><p className="text-[9px] font-black text-slate-400 uppercase">Horario</p><p className="text-xs font-black text-slate-700">{result.reference?.hora_inicio} - {result.reference?.hora_fin}</p></div>
                                    <div><p className="text-[9px] font-black text-slate-400 uppercase">Día</p><p className="text-xs font-black text-slate-700">{result.reference?.dia}</p></div>
                                </div>
                                <div><p className="text-[9px] font-black text-slate-400 uppercase">Ubicación</p><p className="text-xs font-black text-slate-700">{result.reference?.edificio} - {result.reference?.salon}</p></div>
                            </div>
                        </div>

                        {/* Estado en la App */}
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2 text-[10px] font-black text-slate-600 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full w-fit">
                                <Activity size={12} />
                                <span>Estado en Aplicación</span>
                            </div>
                            <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-3">
                                {!sched ? (
                                    <p className="text-xs font-bold text-slate-400">Datos no disponibles</p>
                                ) : (
                                    <>
                                        <div><p className="text-[9px] font-black text-slate-400 uppercase">Docente en App</p><p className="text-xs font-black text-slate-700">{sched.instructor}</p><p className="text-[10px] font-bold text-slate-400">ID: {sched.instructorId}</p></div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><p className="text-[9px] font-black text-slate-400 uppercase">Horario en App</p><p className="text-xs font-black text-slate-700">{sched.startTime} - {sched.endTime}</p></div>
                                            <div><p className="text-[9px] font-black text-slate-400 uppercase">Día</p><p className="text-xs font-black text-slate-700">{sched.days.join(', ')}</p></div>
                                        </div>
                                        <div><p className="text-[9px] font-black text-slate-400 uppercase">Ubicación en App</p><p className="text-xs font-black text-slate-700">{sched.building} - {sched.room}</p></div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {result.errors.length > 0 && (
                        <div className="mt-8 space-y-3">
                            <h5 className="text-[10px] font-black text-rose-600 uppercase tracking-widest pl-2">Inconsistencias Detectadas</h5>
                            <div className="grid grid-cols-1 gap-2">
                                {result.errors.map((err, i) => (
                                    <div key={i} className="flex items-center space-x-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-[11px] font-bold text-rose-700">
                                        <AlertTriangle size={16} />
                                        <span>{err}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-8 border-t border-slate-100 bg-white flex justify-end items-center">
                    <button
                        onClick={onClose}
                        className="px-10 py-3 bg-slate-900 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all"
                    >
                        Cerrar Detalle
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReconciliationDetailModal;
