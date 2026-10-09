import React from 'react';
import { X, CheckCircle, PlusCircle, Trash2, AlertTriangle, ShieldCheck, Archive } from 'lucide-react';
import { ApplyPlan, ApplyGroupReport, ApplyGroupStatus } from '../services/simulationReconcile';

interface ApplySimulationDialogProps {
    isOpen: boolean;
    /** null mientras se compara con la BD. */
    plan: ApplyPlan | null;
    instructorName?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const SECTIONS: { title: string; hint: string; statuses: ApplyGroupStatus[]; tone: string; icon: React.ReactNode }[] = [
    { title: 'Ya existían: no se duplican', hint: 'Mismas fechas, horarios y ambientes que el horario real.', statuses: ['sin_cambios', 'omitido'], tone: 'emerald', icon: <CheckCircle size={14} /> },
    { title: 'Se agregan o se reemplazan', hint: 'Lo que cambia respecto al horario real.', statuses: ['nuevo', 'reemplaza', 'reasigna'], tone: 'blue', icon: <PlusCircle size={14} /> },
    { title: 'Se eliminan del horario real', hint: 'Están en la BD, pero ya no en la simulación.', statuses: ['elimina'], tone: 'rose', icon: <Trash2 size={14} /> },
    { title: 'Se conservan', hint: 'Se agregaron a la BD después de iniciar la simulación y no estaban en ella.', statuses: ['conservado'], tone: 'slate', icon: <ShieldCheck size={14} /> },
];

const TONES: Record<string, { box: string; chip: string; title: string }> = {
    emerald: { box: 'border-emerald-100 bg-emerald-50/50', chip: 'bg-emerald-100 text-emerald-700', title: 'text-emerald-700' },
    blue: { box: 'border-blue-100 bg-blue-50/50', chip: 'bg-blue-100 text-blue-700', title: 'text-blue-700' },
    rose: { box: 'border-rose-100 bg-rose-50/50', chip: 'bg-rose-100 text-rose-700', title: 'text-rose-700' },
    slate: { box: 'border-slate-200 bg-slate-50', chip: 'bg-slate-200 text-slate-700', title: 'text-slate-600' },
};

const STATUS_LABEL: Record<ApplyGroupStatus, string> = {
    sin_cambios: 'Sin cambios', omitido: 'Ya existe', nuevo: 'Nuevo', reemplaza: 'Reemplaza',
    reasigna: 'Reasigna', elimina: 'Elimina', conservado: 'Conserva',
};

const ApplySimulationDialog: React.FC<ApplySimulationDialogProps> = ({ isOpen, plan, instructorName, onConfirm, onCancel }) => {
    if (!isOpen) return null;

    const hasConflicts = !!plan && plan.conflicts.length > 0;
    const itemsOf = (statuses: ApplyGroupStatus[]): ApplyGroupReport[] => plan ? plan.groups.filter(g => statuses.includes(g.status)) : [];

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Aplicar simulación">
            <div className="bg-white w-full max-w-2xl max-h-[92vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col border border-slate-100">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-xl ${hasConflicts ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}><AlertTriangle size={20} /></div>
                        <div className="min-w-0">
                            <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Aplicar simulación</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5 truncate">
                                {instructorName ? instructorName : 'Simulación global'} · comparado por fecha de clase con el horario real
                            </p>
                        </div>
                    </div>
                    <button onClick={onCancel} aria-label="Cerrar" className="p-2 hover:bg-white rounded-xl transition-all shrink-0"><X size={20} className="text-slate-400" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {!plan ? (
                        <div className="flex items-center gap-3 py-10 justify-center text-slate-500">
                            <div className="animate-spin h-5 w-5 border-2 border-slate-400 rounded-full border-t-transparent" />
                            <span className="text-xs font-bold">Leyendo el horario real y comparando por fecha de clase…</span>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
                                <span className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700">{plan.stats.unchangedGroups + plan.groups.filter(g => g.status === 'omitido').length} ya existían</span>
                                <span className="px-3 py-1.5 rounded-full bg-blue-100 text-blue-700">{plan.stats.newRows} filas por escribir</span>
                                <span className="px-3 py-1.5 rounded-full bg-rose-100 text-rose-700">{plan.stats.deletedRows} filas por eliminar</span>
                                {plan.stats.protectedRows > 0 && <span className="px-3 py-1.5 rounded-full bg-slate-200 text-slate-700">{plan.stats.protectedRows} conservadas</span>}
                            </div>

                            {hasConflicts && (
                                <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 space-y-1.5">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-rose-700 flex items-center gap-2"><AlertTriangle size={14} />Choques con otro instructor ({plan.conflicts.length})</p>
                                    {plan.conflicts.slice(0, 10).map((c, i) => <p key={i} className="text-xs font-bold text-rose-700 leading-snug">• {c}</p>)}
                                    {plan.conflicts.length > 10 && <p className="text-xs font-bold text-rose-700">…y {plan.conflicts.length - 10} más.</p>}
                                </div>
                            )}

                            {plan.warnings.length > 0 && (
                                <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 space-y-1.5">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-amber-700 flex items-center gap-2"><AlertTriangle size={14} />Avisos ({plan.warnings.length})</p>
                                    {plan.warnings.slice(0, 10).map((w, i) => <p key={i} className="text-xs font-bold text-amber-700 leading-snug">• {w}</p>)}
                                    {plan.warnings.length > 10 && <p className="text-xs font-bold text-amber-700">…y {plan.warnings.length - 10} más.</p>}
                                </div>
                            )}

                            {SECTIONS.map(sec => {
                                const items = itemsOf(sec.statuses);
                                if (items.length === 0) return null;
                                const tone = TONES[sec.tone];
                                return (
                                    <div key={sec.title} className={`p-4 rounded-2xl border ${tone.box}`}>
                                        <p className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-2 ${tone.title}`}>{sec.icon}{sec.title} ({items.length})</p>
                                        <p className="text-[10px] font-bold text-slate-400 mt-0.5 mb-2">{sec.hint}</p>
                                        <div className="space-y-2">
                                            {items.map((g, i) => (
                                                <div key={`${g.key}-${i}`} className="text-xs leading-snug">
                                                    <span className={`inline-block mr-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide ${tone.chip}`}>{STATUS_LABEL[g.status]}</span>
                                                    <span className="font-black text-slate-800">{g.label}</span>
                                                    <p className="text-slate-500 font-medium mt-0.5">{g.detail}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}

                            {plan.groups.length === 0 && plan.conflicts.length === 0 && plan.warnings.length === 0 && (
                                <p className="text-xs font-bold text-slate-500 py-6 text-center">No hay diferencias respecto al horario real.</p>
                            )}

                            <div className="flex items-start gap-2 text-[11px] text-slate-500 font-medium leading-relaxed pt-1">
                                <Archive size={14} className="shrink-0 mt-0.5 text-slate-400" />
                                <span>
                                    {instructorName
                                        ? `Antes de escribir se guarda un respaldo del horario actual de ${instructorName} en "Simulaciones Guardadas"; puedes revertir cargándolo y aplicándolo de nuevo.`
                                        : 'Esta simulación no está acotada a un instructor: no se genera respaldo automático y la acción es irreversible.'}
                                </span>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-6 bg-slate-50 flex justify-end gap-3 shrink-0">
                    <button onClick={onCancel} className="px-6 py-2.5 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-slate-700 transition-colors">Cancelar</button>
                    <button
                        onClick={onConfirm}
                        disabled={!plan}
                        autoFocus
                        className={`px-6 py-2.5 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${hasConflicts || !instructorName ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800'}`}
                    >
                        {hasConflicts ? 'Aplicar de todos modos' : 'Aplicar cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ApplySimulationDialog;
