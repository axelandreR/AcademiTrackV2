import React, { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { SEMESTER_START_DATE, SEMESTER_END_DATE } from '../constants';
import { CheckCircle2, Circle, FileCheck, ArrowRight, TrendingUp, Users, Clock, AlertTriangle, X, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isAcademicMetaLoad, isExcludedFromTotalLoad, isContractualLoad } from '../services/businessRules';

const ProgressPanel: React.FC = () => {
    const { allSchedules, instructors, exportedInstructors, toggleInstructorExported, holidays } = useData();
    const navigate = useNavigate();
    const [selectedAuditIssuer, setSelectedAuditIssuer] = useState<{ name: string, issues: { week: string, reasons: string[] }[] } | null>(null);

    const timeToMinutes = (t: string) => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };

    // Generar semanas del semestre
    const semesterWeeks = useMemo(() => {
        const weeks: Date[] = [];
        let current = new Date(SEMESTER_START_DATE);
        const day = current.getDay();
        const diff = current.getDate() - day + (day === 0 ? -6 : 1);
        current.setDate(diff);
        current.setHours(0, 0, 0, 0);

        while (current <= SEMESTER_END_DATE) {
            weeks.push(new Date(current));
            current.setDate(current.getDate() + 7);
        }
        return weeks;
    }, []);

    const progressData = useMemo(() => {
        const activeInstructors = instructors.filter(inst =>
            allSchedules.some(s => s.instructor === inst.name && !s.isAdministrative)
        );

        return activeInstructors.map(inst => {
            const instSchedules = allSchedules.filter(s => s.instructor === inst.name);
            let totalWeeksChecked = 0;
            let weeksOk = 0;
            let auditIssues: { week: string, reasons: string[] }[] = [];

            for (const weekStart of semesterWeeks) {
                let hasHoliday = false;
                for (let i = 0; i < 7; i++) {
                    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
                    if (holidays.some(h => h.date.toDateString() === d.toDateString())) { hasHoliday = true; break; }
                }
                if (hasHoliday) continue;

                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6);
                weekEnd.setHours(23, 59, 59, 999);

                const metaCarga = instSchedules
                    .filter(s => !s.isAdministrative && isAcademicMetaLoad(s) && s.startDate <= weekEnd && s.endDate >= weekStart)
                    .reduce((sum, s) => sum + s.weeklyHours, 0);

                if (metaCarga === 0 && inst.type !== 'TC') continue;

                totalWeeksChecked++;
                let cargaAcademicaReal = 0;
                let cargaTotalSemana = 0;
                let hasDailyBreach = false;
                let dailyBreachDay = "";

                for (let i = 0; i < 7; i++) {
                    const currentDate = new Date(weekStart);
                    currentDate.setDate(weekStart.getDate() + i);
                    if (currentDate > SEMESTER_END_DATE) continue;

                    const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][currentDate.getDay()];
                    let dayTotalMin = 0;

                    instSchedules.filter(s => s.days.includes(dayName) && currentDate >= s.startDate && currentDate <= s.endDate).forEach(s => {
                        const durMin = timeToMinutes(s.endTime) - timeToMinutes(s.startTime);
                        const durHours = durMin / 60;

                        if (isContractualLoad(s)) {
                            cargaTotalSemana += durHours;
                            dayTotalMin += durMin;
                        }

                        if (isAcademicMetaLoad(s)) {
                            cargaAcademicaReal += durHours;
                        }
                    });

                    const limit = inst.type === 'TC' ? 552.01 : 420.01;
                    if (dayTotalMin > limit) {
                        hasDailyBreach = true;
                        dailyBreachDay = dayName;
                    }
                }

                const isTC = inst.type === 'TC';
                const academicMatch = Math.abs(cargaAcademicaReal - metaCarga) < 0.01;
                const totalMatch = isTC ? Math.abs(cargaTotalSemana - 46) < 0.01 : true;

                // REGLA: Para TC solo falla si no cumple las 46h o hay exceso diario.
                // Para TP falla si no cumple el match académico o hay exceso diario.
                const isWeekValid = isTC ? (totalMatch && !hasDailyBreach) : (academicMatch && !hasDailyBreach);

                if (isWeekValid) {
                    weeksOk++;
                } else {
                    const weekLabel = `${weekStart.getDate().toString().padStart(2, '0')}/${(weekStart.getMonth() + 1).toString().padStart(2, '0')}`;
                    const reasons: string[] = [];

                    if (isTC) {
                        if (!totalMatch) {
                            reasons.push(`Programado: ${cargaTotalSemana.toFixed(2)}h vs Meta: 46.00h`);
                        }
                    } else {
                        if (!academicMatch) {
                            reasons.push(`Programado: ${cargaAcademicaReal.toFixed(2)}h vs Meta: ${metaCarga.toFixed(2)}h`);
                        }
                    }

                    if (hasDailyBreach) reasons.push(`Exceso diario: ${dailyBreachDay}`);

                    auditIssues.push({ week: weekLabel, reasons });
                }
            }

            const isAuditOk = totalWeeksChecked > 0 && weeksOk === totalWeeksChecked;

            return {
                ...inst,
                isAuditOk,
                auditIssues,
                isExported: exportedInstructors.has(inst.id),
                isFictitious: inst.name.toUpperCase().startsWith('INST.')
            };
        });
    }, [instructors, allSchedules, semesterWeeks, holidays, exportedInstructors]);

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
                        </div>
                        <p className="text-slate-500 font-medium">Estado de cumplimiento basado en auditoría de carga.</p>
                    </div>
                    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-xl flex items-center justify-center space-x-6">
                        <div className="relative w-16 h-16">
                            <svg className="w-16 h-16 transform -rotate-90">
                                <circle className="text-slate-100" strokeWidth="6" stroke="currentColor" fill="transparent" r="28" cx="32" cy="32" />
                                <circle className="text-blue-600" strokeWidth="6" strokeDasharray={2 * Math.PI * 28} strokeDashoffset={2 * Math.PI * 28 * (1 - globalProgress / 100)} strokeLinecap="round" stroke="currentColor" fill="transparent" r="28" cx="32" cy="32" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-slate-900">{globalProgress}%</div>
                        </div>
                        <div className="text-left">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Docentes Terminados</div>
                            <div className="text-xl font-black text-slate-900">{tcStats.auditOk + tpStats.auditOk} / {tcStats.total + tpStats.total}</div>
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
        </div>
    );
};

export default ProgressPanel;
