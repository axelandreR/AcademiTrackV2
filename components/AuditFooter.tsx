
import React from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, ShieldCheck, AlertCircle } from 'lucide-react';

interface AuditFooterProps {
    isInstructorView: boolean;
    instructorType: 'TC' | 'TP';
    stats: {
        hasAuditWarning: boolean;
        academicLoad: number;
        targetLoadForWeek: number;
        isWeekOutOfSemester: boolean;
        isHolidayInWeek: boolean;
        syncHours: number;
        asyncHours: number;
        prepHours: number;
        otherHours: number;
        assignHours: number;
        fileLoadHours: number;
        // Meta real para TP: ARCHIVO convertido a horas académicas (45min=1h, con
        // excepción de CNIU-108/CNIU-126/otras asignaciones en cronológico). No aplica a TC.
        academicHoursMeta: number;
        hasAcademicDiscrepancy: boolean;
        hasContractDiscrepancy: boolean;
        totalContractHours: number;
    };
    isFooterExpanded: boolean;
    setIsFooterExpanded: (expanded: boolean) => void;
    setShowAuditModal: (show: boolean) => void;
}

const AuditFooter: React.FC<AuditFooterProps> = ({
    isInstructorView,
    instructorType,
    stats,
    isFooterExpanded,
    setIsFooterExpanded,
    setShowAuditModal,
}) => {
    if (!isInstructorView) return null;

    return (
        <div className="border-t-4 border-slate-900 bg-white shrink-0 shadow-[0_-15px_40px_rgba(0,0,0,0.15)] z-[100] relative">
            <div
                className="xl:hidden bg-slate-900 border-b border-white/10 px-8 py-4 flex items-center justify-between text-white cursor-pointer"
                onClick={() => setIsFooterExpanded(!isFooterExpanded)}
            >
                <div className="flex items-center space-x-4">
                    <div className={`p-2 rounded-lg ${stats.hasAuditWarning ? 'bg-rose-600 animate-pulse' : 'bg-blue-600'}`}>
                        {stats.hasAuditWarning ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                    </div>
                    <div>
                        <h3 className="text-[10px] font-black uppercase tracking-widest leading-none">Resumen de Carga</h3>
                        <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Real: {stats.academicLoad.toFixed(2)}h / {stats.targetLoadForWeek.toFixed(2)}h</p>
                    </div>
                </div>
                {isFooterExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            </div>

            <div className={`
        flex flex-col xl:flex-row items-stretch xl:items-center justify-between px-8 bg-slate-900 text-white transition-all duration-300 overflow-hidden
        ${isFooterExpanded ? 'max-h-[500px] py-6' : 'max-h-0 xl:max-h-none py-0 xl:py-5'}
      `}>
                <div className="flex items-center space-x-5">
                    <div className={`hidden xl:block p-2.5 rounded-xl shadow-lg ${stats.hasAuditWarning ? 'bg-rose-600 animate-pulse' : 'bg-blue-600'}`}>
                        {stats.hasAuditWarning ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden xl:block">
                            <h3 className="text-sm font-black uppercase tracking-widest leading-none">Carga {instructorType}</h3>
                            <p className={`text-[10px] font-bold uppercase mt-1 ${stats.hasAuditWarning ? 'text-rose-300' : 'text-slate-400'}`}>
                                {stats.isWeekOutOfSemester
                                    ? 'Vigencia de Ciclo Finalizada'
                                    : stats.hasAuditWarning
                                        ? 'Alerta Detectada'
                                        : stats.isHolidayInWeek
                                            ? 'Semana con Feriado (Validada con Semanas Vecinas)'
                                            : 'Estado Óptimo'}
                            </p>
                        </div>
                        {/* La Auditoría Detallada ya no se oculta por tener feriado en la semana:
                            week.hasDailyBreach/hasAcademicDiscrepancy/hasContractDiscrepancy ya vienen
                            validados contra semanas vecinas (ver isHolidayWeekLoadNormal), así que si
                            hay algo real que revisar, el botón debe seguir disponible para verlo. */}
                        {!stats.isWeekOutOfSemester && (
                            <button
                                onClick={() => setShowAuditModal(true)}
                                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 px-4 py-2 text-[10px] w-full xl:w-auto justify-center"
                            >
                                <ShieldCheck size={14} />
                                <span className="whitespace-nowrap">Auditoría Detallada</span>
                            </button>
                        )}
                        {stats.isWeekOutOfSemester && (
                            <div className="flex items-center space-x-2 bg-slate-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">
                                <AlertCircle size={14} />
                                <span>Fuera de Ciclo Lectivo</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-3 md:grid-cols-4 xl:flex xl:items-center flex-wrap gap-x-6 gap-y-4 justify-center md:justify-end mt-6 xl:mt-0 pt-6 xl:pt-0 border-t border-white/10 xl:border-none">
                    <div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-500 uppercase mb-1">Archivo</span><span className="text-base font-black text-blue-400">{stats.fileLoadHours.toFixed(2)}h</span></div>
                    {instructorType === 'TP' && (
                        <div className="flex flex-col items-center" title="Meta a cumplir: ARCHIVO convertido a horas académicas (45min=1h; CNIU-108/CNIU-126/otras asignaciones en cronológico)">
                            <span className="text-[8px] font-black text-amber-400 uppercase mb-1">Horas Académicas</span>
                            <span className="text-base font-black text-amber-300">{stats.academicHoursMeta.toFixed(2)}h</span>
                        </div>
                    )}
                    <div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-500 uppercase mb-1">Real</span><span className={`text-base font-black ${stats.hasAcademicDiscrepancy ? 'text-rose-400' : 'text-emerald-400'}`}>{stats.academicLoad.toFixed(2)}h</span></div>
                    <div className="h-8 w-px bg-white/10 hidden xl:block" />
                    <div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-500 uppercase mb-1">Sinc</span><span className="text-base font-black text-slate-200">{stats.syncHours.toFixed(2)}h</span></div>
                    <div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-500 uppercase mb-1">Asinc</span><span className="text-base font-black text-slate-200">{stats.asyncHours.toFixed(2)}h</span></div>
                    <div className="flex flex-col items-center"><span className="text-[8px] font-black text-blue-400 uppercase mb-1">Otros</span><span className="text-base font-black text-blue-300">{stats.otherHours.toFixed(2)}h</span></div>
                    {instructorType === 'TC' && (
                        <>
                            <div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-500 uppercase mb-1">PC</span><span className="text-base font-black text-slate-200">{stats.prepHours.toFixed(2)}h</span></div>
                            <div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-500 uppercase mb-1">Asignar</span><span className="text-base font-black text-slate-200">{stats.assignHours.toFixed(2)}h</span></div>
                            <div className="h-8 w-px bg-white/10 hidden xl:block" />
                            <div className="flex flex-col items-center"><span className="text-[8px] font-black text-rose-400 uppercase mb-1">Meta 46h</span><span className={`text-lg font-black ${stats.hasContractDiscrepancy ? 'text-rose-500 animate-pulse' : 'text-emerald-400'}`}>{stats.totalContractHours.toFixed(2)}h</span></div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuditFooter;
