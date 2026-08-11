import React, { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { SEMESTER_END_DATE } from '../constants';
import { CheckCircle2, Circle, FileCheck, ArrowRight, TrendingUp, Users, Clock, AlertTriangle, X, Info, RefreshCw, Settings, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { mapSchedFromDB, parseLocalDBDate } from '../context/DataContext';
import { Instructor } from '../types';
import InstructorEditModal from './InstructorEditModal';

const ProgressPanel: React.FC = () => {
    const {
        instructors, exportedInstructors, toggleInstructorExported, settings, updateAppSetting, recalculateAllInstructorsAudit,
        // Auditoría en vivo compartida (calculada una sola vez en DataProvider — ver
        // context/DataContext.tsx::liveAuditByInstructor — y reutilizada en AttendancePage.tsx
        // sin recalcularse al navegar entre esas dos pantallas).
        liveAuditByInstructor
    } = useData();
    const navigate = useNavigate();
    const [selectedAuditIssuer, setSelectedAuditIssuer] = useState<{ name: string, issues: { week: string, reasons: string[] }[] } | null>(null);
    const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null);
    const [showCutoffModal, setShowCutoffModal] = useState(false);
    const [cutoffDraft, setCutoffDraft] = useState('');
    const [isSavingCutoff, setIsSavingCutoff] = useState(false);

    // Fecha límite de auditoría: hasta dónde se exige que el horario esté completo para
    // contar como "OK". Configurable con el ícono de ajustes de este panel; si no está
    // configurada, cae al fin de semestre real (comportamiento de siempre).
    const auditCutoffDate = useMemo(() => {
        const raw = settings['audit_validation_cutoff_date'];
        return raw ? parseLocalDBDate(raw) : new Date(SEMESTER_END_DATE);
    }, [settings]);

    const toInputDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const openCutoffModal = () => {
        setCutoffDraft(toInputDate(auditCutoffDate));
        setShowCutoffModal(true);
    };

    const handleSaveCutoff = async () => {
        if (!cutoffDraft) return;
        setIsSavingCutoff(true);
        try {
            await updateAppSetting('audit_validation_cutoff_date', cutoffDraft);
            await recalculateAllInstructorsAudit(parseLocalDBDate(cutoffDraft));
            setShowCutoffModal(false);
        } catch (e: any) {
            alert('Error al guardar la fecha límite de auditoría: ' + e.message);
        } finally {
            setIsSavingCutoff(false);
        }
    };


    // Fusión barata sobre el mapa de auditoría compartido (ver arriba): O(instructores),
    // sin repetir el escaneo semana-a-semana que ya se calculó una vez en DataProvider.
    const auditResults = useMemo(() => {
        return instructors
            .filter(inst => inst.status === 'Activo' && !inst.name.startsWith('INST.'))
            .map(inst => {
                const live = liveAuditByInstructor.get(inst.id);
                if (!live || !live.hasData) return null;
                return { ...inst, isAuditOk: live.isAuditOk, auditIssues: live.issues, isFictitious: false };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [instructors, liveAuditByInstructor]);

    // Fusión barata: solo agrega isExported, O(instructores).
    const progressData = useMemo(() =>
        auditResults.map(r => ({ ...r, isExported: exportedInstructors.has(r.id) })),
        [auditResults, exportedInstructors]
    );

    const tcStats = useMemo(() => {
        const tcs = progressData.filter(i => i.type === 'TC' && !i.isFictitious);
        return { total: tcs.length, auditOk: tcs.filter(i => i.isAuditOk).length, exported: tcs.filter(i => i.isExported).length };
    }, [progressData]);

    const tpStats = useMemo(() => {
        const tps = progressData.filter(i => i.type === 'TP' && !i.isFictitious);
        return { total: tps.length, auditOk: tps.filter(i => i.isAuditOk).length, exported: tps.filter(i => i.isExported).length };
    }, [progressData]);

    const globalProgress = progressData.length > 0
        ? Math.round(((tcStats.auditOk + tpStats.auditOk) / (tcStats.total + tpStats.total)) * 100)
        : 0;

    const renderInstructorRow = (inst: any) => (
        <div key={inst.id} className="group flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:shadow-md transition-all">
            <div className="flex items-center space-x-4">
                <div onClick={() => navigate(`/schedule?view=Instructor&filter=${encodeURIComponent(inst.name)}`)} className="cursor-pointer flex items-center space-x-3">
                    <div>
                        <div className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase">{inst.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">{inst.specialty}</div>
                    </div>
                    {!inst.isAuditOk && inst.auditIssues?.length > 0 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setSelectedAuditIssuer({ name: inst.name, issues: inst.auditIssues }); }}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg animate-pulse"
                            title="Ver problemas detectados"
                        >
                            <AlertTriangle size={18} />
                        </button>
                    )}
                </div>
            </div>
            <div className="flex items-center space-x-8">
                <div className="flex flex-col items-center">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-1">Audit OK</span>
                    {inst.isAuditOk ? <div className="text-emerald-500 bg-emerald-50 p-1.5 rounded-lg border border-emerald-100 shadow-sm shadow-emerald-100"><CheckCircle2 size={18} /></div>
                        : <div className="text-rose-400 bg-rose-50 p-1.5 rounded-lg border border-rose-100"><Circle size={18} /></div>}
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-1">Exportado</span>
                    <button onClick={() => toggleInstructorExported(inst.id)} className={`p-1.5 rounded-lg border transition-all ${inst.isExported ? 'text-blue-600 bg-blue-50 border-blue-200 shadow-sm shadow-blue-100' : 'text-slate-200 border-slate-100 hover:border-slate-300'}`}>
                        {inst.isExported ? <FileCheck size={18} /> : <Circle size={18} />}
                    </button>
                </div>
                <button onClick={() => setEditingInstructor(inst)} title="Editar ficha del instructor" className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"><Pencil size={18} /></button>
                <button onClick={() => navigate(`/schedule?view=Instructor&filter=${encodeURIComponent(inst.name)}`)} className="p-2 text-slate-300 hover:text-blue-600 transition-colors"><ArrowRight size={18} /></button>
            </div>
        </div>
    );

    return (
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-10 animate-in fade-in duration-500 bg-slate-50/50 relative">
            <button onClick={() => navigate('/')} className="absolute top-8 left-8 text-slate-400 hover:text-slate-900 font-bold flex items-center space-x-2 transition-colors z-20">
                <ArrowRight size={18} className="rotate-180" />
                <span>Volver al Menú</span>
            </button>
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between space-y-4 md:space-y-0 text-center md:text-left">
                    <div className="pt-10 md:pt-0">
                        <div className="flex items-center justify-center md:justify-start space-x-3 mb-2">
                            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200"><TrendingUp size={24} /></div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Avance de Horarios</h2>
                            <button
                                onClick={openCutoffModal}
                                title="Configurar fecha límite de auditoría"
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                            >
                                <Settings size={20} />
                            </button>
                        </div>
                        <p className="text-slate-500 font-medium">Estado de cumplimiento basado en auditoría de carga.</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                            Se exige completo hasta: {auditCutoffDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </p>
                    </div>
                    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-xl flex items-center justify-center space-x-6">
                        <div className="relative w-16 h-16">
                            <svg className="w-16 h-16 transform -rotate-90">
                                <circle className="text-slate-100" strokeWidth="6" stroke="currentColor" fill="transparent" r="28" cx="32" cy="32" />
                                <circle className="text-blue-600" strokeWidth="6" strokeDasharray={2 * Math.PI * 28} strokeDashoffset={2 * Math.PI * 28 * (1 - globalProgress / 100)} strokeLinecap="round" stroke="currentColor" fill="transparent" r="28" cx="32" cy="32" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-slate-900">{globalProgress}%</div>
                        </div>
                        <div className="text-left space-y-2">
                            <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Docentes Terminados</div>
                                <div className="text-xl font-black text-slate-900">{tcStats.auditOk + tpStats.auditOk} / {tcStats.total + tpStats.total}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-8 rounded-[40px] shadow-2xl border border-slate-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 text-indigo-50 group-hover:text-indigo-100 transition-colors pointer-events-none"><Users size={80} strokeWidth={4} /></div>
                        <div className="relative z-10">
                            <div className="flex items-center space-x-3 mb-4"><div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs">TC</div><h3 className="text-lg font-black text-slate-900">Tiempo Completo</h3></div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="space-y-1">
                                    <div className="text-[10px] uppercase font-black text-indigo-400 tracking-wider">Audit OK</div>
                                    <div className="flex items-end space-x-2"><span className="text-4xl font-black text-slate-900">{tcStats.auditOk}</span><span className="text-lg text-slate-400 font-bold mb-1">/ {tcStats.total}</span></div>
                                </div>
                                <div className="text-right space-y-1">
                                    <div className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Exportados</div>
                                    <div className="text-xl font-black text-slate-600">{tcStats.exported}</div>
                                </div>
                            </div>
                            <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${(tcStats.auditOk / tcStats.total) * 100 || 0}%` }} /></div>
                        </div>
                    </div>
                    <div className="bg-white p-8 rounded-[40px] shadow-2xl border border-slate-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 text-emerald-50 group-hover:text-emerald-100 transition-colors pointer-events-none"><Clock size={80} strokeWidth={4} /></div>
                        <div className="relative z-10">
                            <div className="flex items-center space-x-3 mb-4"><div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl font-black text-xs">TP</div><h3 className="text-lg font-black text-slate-900">Tiempo Parcial</h3></div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="space-y-1">
                                    <div className="text-[10px] uppercase font-black text-emerald-500 tracking-wider">Audit OK</div>
                                    <div className="flex items-end space-x-2"><span className="text-4xl font-black text-slate-900">{tpStats.auditOk}</span><span className="text-lg text-slate-400 font-bold mb-1">/ {tpStats.total}</span></div>
                                </div>
                                <div className="text-right space-y-1">
                                    <div className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Exportados</div>
                                    <div className="text-xl font-black text-slate-600">{tpStats.exported}</div>
                                </div>
                            </div>
                            <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${(tpStats.auditOk / tpStats.total) * 100 || 0}%` }} /></div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between pl-2">
                            <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest text-indigo-600">Docentes TC Reales</h4>
                            <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md">{tcStats.total}</span>
                        </div>
                        <div className="space-y-3">{progressData.filter(i => i.type === 'TC' && !i.isFictitious).map(renderInstructorRow)}</div>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between pl-2">
                            <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest text-emerald-600">Docentes TP Reales</h4>
                            <span className="text-[10px] font-black bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md">{tpStats.total}</span>
                        </div>
                        <div className="space-y-3">{progressData.filter(i => i.type === 'TP' && !i.isFictitious).map(renderInstructorRow)}</div>
                    </div>
                </div>
            </div>

            {showCutoffModal && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-300 border border-slate-100">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><Settings size={20} /></div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Fecha Límite de Auditoría</h3>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hasta dónde exigir horario completo</p>
                                </div>
                            </div>
                            <button onClick={() => setShowCutoffModal(false)} className="p-2 hover:bg-white rounded-xl transition-all"><X size={20} className="text-slate-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                Un instructor se marca "Audit OK" solo si su horario está completo en todas las semanas desde el inicio del semestre hasta esta fecha. Bájala si aún no gestionas las últimas semanas del ciclo (cierre/exámenes) y no quieres que eso bloquee marcar a los docentes como completos por ahora.
                            </p>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha límite</label>
                                <input
                                    type="date"
                                    value={cutoffDraft}
                                    onChange={e => setCutoffDraft(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            {isSavingCutoff && (
                                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                                    <RefreshCw size={12} className="animate-spin" /> Recalculando auditoría de {instructors.length} instructores...
                                </p>
                            )}
                        </div>
                        <div className="p-6 bg-slate-50 flex justify-end gap-3">
                            <button onClick={() => setShowCutoffModal(false)} disabled={isSavingCutoff} className="px-6 py-2.5 text-slate-500 font-black text-[10px] uppercase tracking-widest disabled:opacity-50">Cancelar</button>
                            <button
                                onClick={handleSaveCutoff}
                                disabled={isSavingCutoff || !cutoffDraft}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
                            >
                                {isSavingCutoff ? 'Guardando...' : 'Guardar y Recalcular'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedAuditIssuer && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-300 border border-slate-100">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-rose-100 text-rose-600 rounded-xl"><AlertTriangle size={20} /></div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Observaciones de Auditoría</h3>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedAuditIssuer.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedAuditIssuer(null)} className="p-2 hover:bg-white rounded-xl transition-all"><X size={20} className="text-slate-400" /></button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4 custom-scrollbar">
                            {selectedAuditIssuer.issues.map((issue, idx) => (
                                <div key={idx} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                    <div className="flex items-center space-x-2 mb-2">
                                        <Info size={14} className="text-blue-500" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Semana: {issue.week}</span>
                                    </div>
                                    <ul className="space-y-1.5">
                                        {issue.reasons.map((reason, ridx) => (
                                            <li key={ridx} className="flex items-start space-x-2 text-[11px] font-bold text-slate-700">
                                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                                                <span>{reason}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                        <div className="p-6 bg-slate-50 flex justify-end gap-3">
                            <button onClick={() => {
                                const instructor = selectedAuditIssuer.name;
                                setSelectedAuditIssuer(null);
                                navigate(`/schedule?view=Instructor&filter=${encodeURIComponent(instructor)}`);
                            }} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">
                                Ver Horario
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <InstructorEditModal
                isOpen={editingInstructor !== null}
                onClose={() => setEditingInstructor(null)}
                instructor={editingInstructor}
            />
        </div>
    );
};

export default ProgressPanel;
