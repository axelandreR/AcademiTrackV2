
import React, { useState } from 'react';
import { Upload, Database, ClipboardCheck, ArrowLeft, ArrowRight, CheckCircle, FileWarning, SearchCode, ChevronRight, AlertCircle, Info } from 'lucide-react';
import { InstitutionalReference, ReconciliationResult, ProcessedSchedule } from '../../types';

interface ReconciliationViewProps {
    institutionalReferences: InstitutionalReference[];
    reconciliationResults: ReconciliationResult[];
    schedules: ProcessedSchedule[];
    onUploadReference: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSelectResult: (res: ReconciliationResult) => void;
}

const ReconciliationView: React.FC<ReconciliationViewProps> = ({
    institutionalReferences,
    reconciliationResults,
    schedules,
    onUploadReference,
    onSelectResult
}) => {
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    const formatDisplayDate = (dateStr: string | Date | null | undefined) => {
        if (!dateStr) return 'N/A';
        const d = typeof dateStr === 'string' ? new Date(dateStr + 'T00:00:00') : dateStr;
        if (isNaN(d.getTime())) return String(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Conciliación Institucional</h3>
                    <p className="text-slate-500 text-sm mt-1">Contraste de programación App vs Datos maestros del sistema.</p>
                </div>
                <div className="flex items-center space-x-4">
                    <label className="cursor-pointer flex items-center space-x-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100">
                        <Upload size={18} />
                        <span>Cargar Reporte Sistema</span>
                        <input type="file" className="hidden" accept=".xlsx,.xls" onChange={onUploadReference} />
                    </label>
                </div>
            </div>

            {institutionalReferences.length === 0 ? (
                <div className="bg-white rounded-[40px] p-24 flex flex-col items-center justify-center text-center shadow-2xl border border-slate-100">
                    <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-8 border-4 border-dashed border-slate-100">
                        <Database size={48} />
                    </div>
                    <h4 className="text-2xl font-black text-slate-900">Sin Datos de Referencia</h4>
                    <p className="text-slate-400 mt-4 max-w-md text-balance">Para iniciar la auditoría, carga el reporte oficial del sistema (50+ columnas). El sistema extraerá automáticamente los datos relevantes para el cruce.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-[32px] shadow-lg border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Analizados</p>
                            <h4 className="text-3xl font-black text-slate-900">{reconciliationResults.length}</h4>
                        </div>
                        <div className="bg-white p-6 rounded-[32px] shadow-lg border border-slate-100">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Sincronizados OK</p>
                            <h4 className="text-3xl font-black text-emerald-600">{reconciliationResults.filter(r => r.status === 'ok').length}</h4>
                        </div>
                        <div className="bg-white p-6 rounded-[32px] shadow-lg border border-slate-100">
                            <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Discrepancias</p>
                            <h4 className="text-3xl font-black text-rose-600">{reconciliationResults.filter(r => r.status === 'discrepancy').length}</h4>
                        </div>
                        <div className="bg-white p-6 rounded-[32px] shadow-lg border border-slate-100">
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Extras en App</p>
                            <h4 className="text-3xl font-black text-amber-600">{reconciliationResults.filter(r => r.status === 'extra').length}</h4>
                        </div>
                    </div>

                    <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100">
                        <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center space-x-2">
                                <ClipboardCheck size={16} className="text-indigo-600" />
                                <span>Auditoría de Cumplimiento (Master List Sistema)</span>
                            </h4>
                        </div>
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">NRC / Sistema</th>
                                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Hallazgos</th>
                                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {(() => {
                                    const filtered = reconciliationResults.filter(r => r.status !== 'extra');
                                    const totalPages = Math.ceil(filtered.length / itemsPerPage);
                                    const startIdx = (currentPage - 1) * itemsPerPage;
                                    const paginated = filtered.slice(startIdx, startIdx + itemsPerPage);

                                    return (
                                        <>
                                            {paginated.map((res, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => onSelectResult(res)}>
                                                    <td className="px-8 py-5">
                                                        <p className="text-sm font-black text-slate-900">{res.nrc}</p>
                                                        <p className="text-[10px] font-bold text-slate-400 truncate max-w-[200px]">{res.reference?.curso_nombre}</p>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase ${res.status === 'ok' ? 'bg-emerald-100 text-emerald-700' :
                                                            res.status === 'discrepancy' ? 'bg-rose-100 text-rose-700' :
                                                                'bg-slate-100 text-slate-600'
                                                            }`}>
                                                            {res.status === 'ok' ? <CheckCircle size={14} /> : res.status === 'discrepancy' ? <FileWarning size={14} /> : <SearchCode size={14} />}
                                                            <span>{res.status === 'ok' ? 'Sincronizado' : res.status === 'discrepancy' ? 'Discrepancia' : 'No en App'}</span>
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        {res.status === 'ok' ? (
                                                            <span className="text-[10px] font-bold text-emerald-600 flex items-center space-x-1"><CheckCircle size={12} /> <span>Sin observaciones</span></span>
                                                        ) : (
                                                            <div className="space-y-1">
                                                                {res.errors.slice(0, 1).map((err, i) => (
                                                                    <p key={i} className="text-[11px] font-bold text-slate-600 flex items-center space-x-2">
                                                                        <div className={`w-1.5 h-1.5 rounded-full ${res.status === 'discrepancy' ? 'bg-rose-400' : 'bg-slate-400'}`} />
                                                                        <span className="truncate max-w-[250px]">{err}</span>
                                                                    </p>
                                                                ))}
                                                                {res.errors.length > 1 && <p className="text-[9px] font-black text-indigo-600">+{res.errors.length - 1} más...</p>}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-8 py-5 text-right">
                                                        <button className="p-2 bg-slate-100 rounded-xl text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                                            <ChevronRight size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {totalPages > 1 && (
                                                <tr>
                                                    <td colSpan={4} className="px-8 py-4 bg-slate-50/50">
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase">
                                                                Página {currentPage} de {totalPages} ({filtered.length} registros)
                                                            </p>
                                                            <div className="flex space-x-2">
                                                                <button
                                                                    disabled={currentPage === 1}
                                                                    onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.max(1, p - 1)); }}
                                                                    className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-100 transition-colors"
                                                                >
                                                                    <ArrowLeft size={16} />
                                                                </button>
                                                                <button
                                                                    disabled={currentPage === totalPages}
                                                                    onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.min(totalPages, p + 1)); }}
                                                                    className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-100 transition-colors"
                                                                >
                                                                    <ArrowRight size={16} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })()}
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100 opacity-80">
                        <div className="px-8 py-6 bg-amber-50/50 border-b border-amber-100 flex items-center justify-between">
                            <h4 className="text-xs font-black text-amber-700 uppercase tracking-widest flex items-center space-x-2">
                                <AlertCircle size={16} />
                                <span>Sesiones Adicionales (Exclusivas de la App)</span>
                            </h4>
                            <span className="text-[10px] font-black text-amber-600 uppercase">No reportar al sistema institucional</span>
                        </div>
                        <table className="w-full text-left">
                            <tbody className="divide-y divide-slate-100">
                                {reconciliationResults.filter(r => r.status === 'extra').length === 0 ? (
                                    <tr><td className="px-8 py-10 text-center text-slate-400 text-xs font-bold">No hay sesiones adicionales registradas en la App.</td></tr>
                                ) : (
                                    reconciliationResults.filter(r => r.status === 'extra').map((res, idx) => {
                                        const sched = schedules.find(s => s.id === res.id);
                                        return (
                                            <tr key={idx} className="hover:bg-amber-50/30 transition-colors">
                                                <td className="px-8 py-4">
                                                    <div className="flex items-center space-x-4">
                                                        <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Info size={14} /></div>
                                                        <div>
                                                            <p className="text-sm font-black text-slate-900">{res.nrc} <span className="text-[10px] font-bold text-slate-400 ml-2">{sched?.courseName}</span></p>
                                                            <p className="text-[10px] font-bold text-amber-600 uppercase">
                                                                {sched?.days.join(', ')} | {sched?.startTime} - {sched?.endTime}
                                                                <span className="ml-2 text-slate-400">({formatDisplayDate(sched?.startDate)} - {formatDisplayDate(sched?.endDate)})</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-4 text-right">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Omitido en Auditoría Principal</span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReconciliationView;
