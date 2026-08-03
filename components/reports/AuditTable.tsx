
import React from 'react';
import { UserCircle2, Activity, Clock, Minus, CheckCircle, X } from 'lucide-react';
import { AuditRow, DeepAuditResult } from '../../services/auditCalculations';

interface AuditTableProps {
    filteredAudit: AuditRow[];
    onSelectAudit: (deepAudit: DeepAuditResult) => void;
}

const AuditTable: React.FC<AuditTableProps> = ({ filteredAudit, onSelectAudit }) => {
    return (
        <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left border-collapse">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Instructor / ID</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Carrera / Tipo</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Carga Archivo (S1)</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ejecución Real (S1)</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Auditoría Ciclo</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredAudit.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                            <td className="px-8 py-5">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors"><UserCircle2 size={20} /></div>
                                    <div><p className="text-sm font-black text-slate-900 leading-tight truncate max-w-[200px]">{row.name}</p><p className="text-[10px] font-bold text-slate-400 mt-0.5">{row.id}</p></div>
                                </div>
                            </td>
                            <td className="px-8 py-5">
                                <div className="flex flex-col"><span className="text-[10px] font-black text-slate-600 uppercase tracking-tighter truncate max-w-[150px]">{row.specialty}</span><span className={`text-[9px] font-black mt-1 px-2 py-0.5 rounded-md w-fit ${row.type === 'TC' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{row.type === 'TC' ? 'Tiempo Completo' : 'Tiempo Parcial'}</span></div>
                            </td>
                            <td className="px-8 py-5 text-sm font-black text-slate-500">{row.metaCarga.toFixed(2)}h</td>
                            <td className="px-8 py-5">
                                <div className="flex items-center space-x-2">
                                    <Activity size={14} className="text-slate-300" />
                                    <span className={`text-sm font-black ${row.status === 'DEFICIT' ? 'text-rose-600' : row.status === 'EXCESO' ? 'text-amber-600' : row.status === 'NO_LOAD' ? 'text-amber-500' : 'text-emerald-600'}`}>
                                        {row.cargaReal.toFixed(2)}h
                                    </span>
                                    {row.hasDailyBreachS1 && (
                                        <div className="flex items-center justify-center p-1 bg-rose-50 text-rose-600 rounded-lg" title="Exceso de jornada diaria">
                                            <Clock size={12} />
                                        </div>
                                    )}
                                </div>
                                {row.hasHolidayS1 && <span className="text-[8px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase mt-1 block w-fit">Feriado</span>}
                            </td>
                            <td className="px-8 py-5 text-center">
                                <button
                                    disabled={row.status === 'NO_LOAD'}
                                    onClick={() => onSelectAudit(row.deepAudit)}
                                    className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl transition-all shadow-md ${row.status !== 'NO_LOAD' ? 'hover:scale-110 active:scale-95' : 'opacity-80'} ${row.status === 'NO_LOAD' ? 'bg-amber-100 text-amber-500' : (row.deepAudit.isPerfect ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-rose-100 text-rose-600 hover:bg-rose-200')}`}
                                >
                                    {row.status === 'NO_LOAD' ? <Minus size={24} className="stroke-[3]" /> : (row.deepAudit.isPerfect ? <CheckCircle size={24} /> : <X size={24} />)}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
        </div>
    );
};

export default AuditTable;
