import React, { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { SEMESTER_START_DATE, SEMESTER_END_DATE, CONTRACT_HOURS_TC } from '../constants';
import { CheckCircle2, Circle, FileCheck, ArrowRight, TrendingUp, Users, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ProgressPanel: React.FC = () => {
    const { allSchedules, instructors, exportedInstructors, toggleInstructorExported, holidays } = useData();
    const navigate = useNavigate();

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
        // Filtrar instructores con carga académica en el sistema
        const activeInstructors = instructors.filter(inst =>
            allSchedules.some(s => s.instructor === inst.name && !s.isAdministrative)
        );

        const processed = activeInstructors.map(inst => {
            const instSchedules = allSchedules.filter(s => s.instructor === inst.name);

            let isAuditOk = false;
            let foundValidWeek = false;

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
                    .filter(s => !s.isAdministrative && s.startDate <= weekEnd && s.endDate >= weekStart)
                    .reduce((sum, s) => sum + s.weeklyHours, 0);

                if (metaCarga === 0 && inst.type !== 'TC') continue;

                foundValidWeek = true;
                let cargaAcademicaReal = 0;
                let cargaTotalSemana = 0;
                let hasDailyBreach = false;

                for (let i = 0; i < 7; i++) {
                    const currentDate = new Date(weekStart);
                    currentDate.setDate(weekStart.getDate() + i);
                    if (currentDate > SEMESTER_END_DATE) continue;

                    const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][currentDate.getDay()];
                    let dayTotalMin = 0;

                    instSchedules.filter(s => s.days.includes(dayName) && currentDate >= s.startDate && currentDate <= s.endDate).forEach(s => {
                        const durMin = timeToMinutes(s.endTime) - timeToMinutes(s.startTime);
                        const durHours = durMin / 60;

                        if (s.category !== 'refrigerio') {
                            cargaTotalSemana += durHours;
                            dayTotalMin += durMin;
                        }

                        const cName = (s.courseName || '').toUpperCase();
                        const cCode = (s.courseCode || '').toUpperCase();
                        const isOtherFuncCourse =
                            cCode.includes('CNI-108') || cCode.includes('CNIU-108') ||
                            cCode.includes('CNI-126') || cCode.includes('CNIU-126') ||
                            cName.includes('REV Y CALIF CUADERNOS INFORME') ||
                            cName.includes('ASESORIA EN ELABORACION DE PROYECTOS') ||
                            cName.includes('MEJORA / CREATIVIDAD');

                        if (!s.isAdministrative) {
                            if (!isOtherFuncCourse) cargaAcademicaReal += durHours;
                        } else {
                            const isAccemicAdmin = s.meetingType === 'VAEE' || (s.activity && s.activity.toUpperCase().includes('AUTOESTUDIO')) || s.category === 'asincrona';
                            if (isAccemicAdmin || isOtherFuncCourse) cargaAcademicaReal += durHours;
                        }
                    });

                    if (inst.type === 'TC' && dayTotalMin > 600) hasDailyBreach = true;
                    if (inst.type === 'TP' && dayTotalMin > 480) hasDailyBreach = true;
                }

                const academicMatch = Math.abs(cargaAcademicaReal - metaCarga) < 0.1;
                const totalMatch = inst.type === 'TC' ? Math.abs(cargaTotalSemana - 46) < 0.1 : true;

                if (academicMatch && totalMatch && !hasDailyBreach) {
                    isAuditOk = true;
                    break;
                }
            }

            return {
                ...inst,
                isAuditOk: foundValidWeek ? isAuditOk : false,
                isExported: exportedInstructors.has(inst.id),
                isFictitious: inst.name.toUpperCase().startsWith('INST.')
            };
        });

        return processed;
    }, [instructors, allSchedules, semesterWeeks, holidays, exportedInstructors]);

    const tcStats = useMemo(() => {
        const tcs = progressData.filter(i => i.type === 'TC' && !i.isFictitious);
        return { total: tcs.length, auditOk: tcs.filter(i => i.isAuditOk).length, exported: tcs.filter(i => i.isExported).length };
    }, [progressData]);

    const tpStats = useMemo(() => {
        const tps = progressData.filter(i => i.type === 'TP' && !i.isFictitious);
        return { total: tps.length, auditOk: tps.filter(i => i.isAuditOk).length, exported: tps.filter(i => i.isExported).length };
    }, [progressData]);

    const fictitiousCount = useMemo(() => {
        return progressData.filter(i => i.isFictitious).length;
    }, [progressData]);

    const globalProgress = progressData.length > 0
        ? Math.round(((tcStats.auditOk + tpStats.auditOk) / (tcStats.total + tpStats.total)) * 100)
        : 0;

    const renderInstructorRow = (inst: any) => (
        <div key={inst.id} className="group flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:shadow-md transition-all">
            <div className="flex items-center space-x-4">
                <div onClick={() => navigate(`/schedule?view=Instructor&filter=${encodeURIComponent(inst.name)}`)} className="cursor-pointer">
                    <div className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase">{inst.name}</div>
                    <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">{inst.specialty}</div>
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

                {fictitiousCount > 0 && (
                    <div className="pt-10 border-t border-slate-200">
                        <div className="flex items-center space-x-3 mb-6 pl-2">
                            <div className="p-2 bg-slate-100 text-slate-400 rounded-xl"><Users size={20} /></div>
                            <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Instructores de Horario Reservado (Ficticios)</h4>
                            <span className="text-[10px] font-black bg-slate-100 text-slate-400 px-2 py-1 rounded-md">{fictitiousCount}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {progressData.filter(i => i.isFictitious).map(inst => (
                                <div key={inst.id} className="flex items-center justify-between p-4 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl opacity-60 hover:opacity-100 transition-all">
                                    <div className="flex items-center space-x-3">
                                        <div className="text-xs font-bold text-slate-500 uppercase">{inst.name}</div>
                                    </div>
                                    <button onClick={() => navigate(`/schedule?view=Instructor&filter=${encodeURIComponent(inst.name)}`)} className="p-2 text-slate-300 hover:text-slate-600"><ArrowRight size={14} /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProgressPanel;
