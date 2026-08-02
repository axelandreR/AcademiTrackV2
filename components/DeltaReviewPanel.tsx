import React from 'react';
import { GitCompareArrows, CheckCircle2, Sparkles, PenSquare } from 'lucide-react';
import { DeltaDiffResult, formatRowSummary } from '../services/deltaDiff';

interface DeltaReviewPanelProps {
    diff: DeltaDiffResult;
    selectedNrcs: Set<string>;
    onToggleNrc: (nrc: string) => void;
    onSelectAll: () => void;
    onSelectNone: () => void;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading: boolean;
}

const DeltaReviewPanel: React.FC<DeltaReviewPanelProps> = ({
    diff, selectedNrcs, onToggleNrc, onSelectAll, onSelectNone, onConfirm, onCancel, isLoading
}) => {
    const selectedCount = diff.entries.filter(e => selectedNrcs.has(e.nrc)).length;

    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
            <div className="bg-white rounded-[40px] shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in duration-300">
                <div className="p-8 lg:p-10 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center space-x-4 mb-2">
                        <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><GitCompareArrows size={24} /></div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900">Cambios Detectados (Delta)</h3>
                            <p className="text-slate-500 text-sm font-medium">Elige qué NRC aplicar. Lo que no marques se queda tal como está en el sistema.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-5">
                        <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-[10px] font-black uppercase tracking-widest">
                            <Sparkles size={12} /><span>{diff.newCount} nuevo(s)</span>
                        </div>
                        <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg text-[10px] font-black uppercase tracking-widest">
                            <PenSquare size={12} /><span>{diff.changedCount} con cambios</span>
                        </div>
                        <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 text-slate-500 border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest">
                            <CheckCircle2 size={12} /><span>{diff.unchangedCount} sin cambios (se omiten)</span>
                        </div>
                    </div>
                </div>

                <div className="px-8 lg:px-10 py-4 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{selectedCount} de {diff.entries.length} seleccionados</span>
                    <div className="flex items-center space-x-4">
                        <button onClick={onSelectAll} className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800">Seleccionar todos</button>
                        <button onClick={onSelectNone} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600">Ninguno</button>
                    </div>
                </div>

                <div className="p-8 lg:p-10 overflow-y-auto space-y-3">
                    {diff.entries.length === 0 && (
                        <p className="text-center text-slate-400 text-sm font-bold py-10">No se detectaron cambios que aplicar. Todos los NRC del archivo coinciden con lo que ya está en el sistema.</p>
                    )}
                    {diff.entries.map(entry => {
                        const checked = selectedNrcs.has(entry.nrc);
                        return (
                            <label
                                key={entry.nrc}
                                className={`flex items-start gap-4 p-5 rounded-3xl border-2 cursor-pointer transition-all ${checked
                                    ? entry.status === 'new' ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'
                                    : 'border-slate-100 bg-slate-50/50 opacity-60'
                                    }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggleNrc(entry.nrc)}
                                    className="w-4 h-4 mt-1 accent-blue-600 flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-black text-slate-900 text-sm">NRC {entry.nrc}</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-white text-slate-500 border-slate-200">{entry.courseCode}</span>
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${entry.status === 'new' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {entry.status === 'new' ? 'Nuevo' : 'Cambió'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-600 font-bold mt-1 truncate">{entry.courseName} · {entry.instructor}</p>

                                    {entry.status === 'changed' ? (
                                        <div className="mt-2 space-y-1 font-mono text-[11px]">
                                            {entry.current.map((r, i) => (
                                                <p key={`c-${i}`} className="text-rose-500"><span className="font-black">Actual:</span> {formatRowSummary(r)}</p>
                                            ))}
                                            {entry.incoming.map((r, i) => (
                                                <p key={`n-${i}`} className="text-emerald-600"><span className="font-black">Nuevo:</span> {formatRowSummary(r)}</p>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mt-2 space-y-1 font-mono text-[11px]">
                                            {entry.incoming.map((r, i) => (
                                                <p key={`n-${i}`} className="text-emerald-600">{formatRowSummary(r)}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </label>
                        );
                    })}
                </div>

                <div className="p-8 lg:p-10 border-t border-slate-100 flex items-center space-x-4">
                    <button
                        onClick={onCancel}
                        className="px-8 py-4 text-slate-400 font-bold hover:text-slate-600 uppercase text-xs tracking-widest"
                    >Cancelar</button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading || selectedCount === 0}
                        className="flex-1 py-4 bg-slate-900 text-white rounded-3xl font-black hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 uppercase tracking-widest text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isLoading && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                        {isLoading ? 'Sincronizando...' : `Aplicar ${selectedCount} NRC seleccionado(s)`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeltaReviewPanel;
