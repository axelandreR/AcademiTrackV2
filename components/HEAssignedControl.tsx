import React, { useMemo, useState } from 'react';
import { Clock, FileDown, FileSpreadsheet } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Instructor } from '../types';
import { belongsToInstructor } from '../services/businessRules';
import { isInstructorAuditExemptForWeek } from '../services/auditCalculations';
import { calculateWeeklyExtraBreakdown } from '../services/extraHoursCalculations';
import { generateWeeklyHEExcel, generateFullPeriodHEExcel } from '../services/excelExporter';
import ExtraHoursModal, { HEExemptionRange } from './ExtraHoursModal';

interface HEAssignedControlProps {
    instructor: Instructor;
    currentWeekStart: Date;
}

const fmtShort = (d?: string | null) => {
    if (!d) return null;
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
};

/**
 * Control único de Horas Extra en la Toolbar de Visualización/Edición — combina en un
 * solo botón + un solo modal (ver ExtraHoursModal.tsx, sección de exención) lo que antes
 * eran dos cosas separadas:
 * - Exención de auditoría por rango de fechas (Instructor.hasExtraHoursAssigned/Start/End).
 * - Tramos detallados día/turno ("Configurar HE", extraHoursConfigsByInstructor), antes
 *   solo alcanzables desde Simulación (ver SimulationBar.tsx) — ahora también editables
 *   aquí sin necesidad de crear una simulación.
 * Además: indicador de si la semana vista cae en el rango, desglose Regular vs HE de la
 * semana actual, y accesos directos a los reportes Excel de HE.
 */
const HEAssignedControl: React.FC<HEAssignedControlProps> = ({ instructor, currentWeekStart }) => {
    const { allSchedules, extraHoursConfigsByInstructor, holidays, notify, setInstructorHEAssignment, saveInstructorExtraHoursConfig } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExportingWeek, setIsExportingWeek] = useState(false);
    const [isExportingPeriod, setIsExportingPeriod] = useState(false);

    const hasExemption = instructor.hasExtraHoursAssigned === true;
    const instructorExtraHoursConfig = extraHoursConfigsByInstructor[instructor.id] || null;
    const hasSegments = !!instructorExtraHoursConfig;
    const isConfigured = hasExemption || hasSegments;

    const instructorSchedules = useMemo(
        () => allSchedules.filter(s => belongsToInstructor(instructor, s)),
        [allSchedules, instructor]
    );

    const isCurrentWeekExempt = useMemo(
        () => isInstructorAuditExemptForWeek(instructor, currentWeekStart),
        [instructor, currentWeekStart]
    );

    const currentWeekBreakdown = useMemo(() => {
        if (!hasSegments || instructorSchedules.length === 0) return null;
        const weeks = calculateWeeklyExtraBreakdown(instructorSchedules, instructorExtraHoursConfig, holidays);
        return weeks.find(w => w.weekStart.getTime() === currentWeekStart.getTime() && w.extraHours > 0.01) || null;
    }, [hasSegments, instructorExtraHoursConfig, instructorSchedules, holidays, currentWeekStart]);

    const rangeLabel = hasExemption
        ? `${fmtShort(instructor.hasExtraHoursAssignedStart) || '…'}–${fmtShort(instructor.hasExtraHoursAssignedEnd) || 'indef.'}`
        : null;

    const buttonLabel = hasExemption ? `HE Asignadas · ${rangeLabel}` : (hasSegments ? 'HE Configurada' : 'Configurar HE');

    const handleSaveSegments = async (config: Parameters<typeof saveInstructorExtraHoursConfig>[1]) => {
        await saveInstructorExtraHoursConfig(instructor.id, config);
    };

    const handleSaveExemption = async (range: HEExemptionRange | null) => {
        await setInstructorHEAssignment(instructor.id, range);
    };

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const handleWeeklyExport = async () => {
        if (isExportingWeek) return;
        setIsExportingWeek(true);
        try {
            const blob = await generateWeeklyHEExcel({
                instructorName: instructor.name, instructorType: instructor.type, weekStart: currentWeekStart,
                allSchedules: instructorSchedules, extraHoursConfig: instructorExtraHoursConfig, holidays
            });
            downloadBlob(blob, `Programacion_Semanal_HE_${instructor.name.replace(/\s+/g, '_')}_${currentWeekStart.toISOString().slice(0, 10)}.xlsx`);
            notify('Reporte semanal exportado correctamente.', 'success');
        } catch (e: any) {
            notify('Error al generar el reporte semanal: ' + e.message, 'error');
        } finally {
            setIsExportingWeek(false);
        }
    };

    const handleFullPeriodExport = async () => {
        if (isExportingPeriod) return;
        setIsExportingPeriod(true);
        try {
            const blob = await generateFullPeriodHEExcel({
                instructorName: instructor.name, instructorType: instructor.type,
                allSchedules: instructorSchedules, extraHoursConfig: instructorExtraHoursConfig, holidays
            });
            downloadBlob(blob, `Programacion_Completa_HE_${instructor.name.replace(/\s+/g, '_')}.xlsx`);
            notify('Reporte del periodo exportado correctamente.', 'success');
        } catch (e: any) {
            notify('Error al generar el reporte del periodo: ' + e.message, 'error');
        } finally {
            setIsExportingPeriod(false);
        }
    };

    return (
        <>
            <div className="flex items-center gap-1.5 flex-wrap">
                <button
                    onClick={() => setIsModalOpen(true)}
                    className={`shrink-0 px-2 sm:px-2.5 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-lg border transition-colors flex items-center gap-1 shadow-sm ${isConfigured ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'}`}
                    title={isConfigured ? 'Editar Horas Extra (exención de auditoría y/o tramos detallados) para este instructor.' : 'Configurar Horas Extra: exención de auditoría por rango de fechas y/o tramos detallados día/turno.'}
                >
                    <Clock size={11} />
                    <span>{buttonLabel}</span>
                </button>

                {hasExemption && (
                    <span
                        className={`hidden sm:inline-flex items-center px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${isCurrentWeekExempt ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                        title={isCurrentWeekExempt ? 'La semana que estás viendo cae dentro del rango de HE: auditoría normal desactivada.' : 'La semana que estás viendo cae fuera del rango de HE: auditoría normal activa.'}
                    >
                        {isCurrentWeekExempt ? 'Semana exenta' : 'Fuera de rango'}
                    </span>
                )}

                {currentWeekBreakdown && (
                    <span className="hidden md:inline-flex items-center px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-blue-50 text-blue-600 border-blue-100" title="Desglose de esta semana según los tramos detallados">
                        Regular {currentWeekBreakdown.regularHours.toFixed(1)}h · HE {currentWeekBreakdown.extraHours.toFixed(1)}h
                    </span>
                )}

                {isConfigured && (
                    <>
                        <button
                            onClick={handleWeeklyExport}
                            disabled={isExportingWeek}
                            title="Exportar reporte HE de esta semana"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-amber-700 hover:border-amber-200 transition-colors disabled:opacity-40"
                        >
                            {isExportingWeek ? <div className="animate-spin h-3 w-3 border-2 border-slate-400 border-t-transparent rounded-full" /> : <FileDown size={12} />}
                        </button>
                        <button
                            onClick={handleFullPeriodExport}
                            disabled={isExportingPeriod}
                            title="Exportar reporte HE del periodo completo"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-amber-700 hover:border-amber-200 transition-colors disabled:opacity-40"
                        >
                            {isExportingPeriod ? <div className="animate-spin h-3 w-3 border-2 border-slate-400 border-t-transparent rounded-full" /> : <FileSpreadsheet size={12} />}
                        </button>
                    </>
                )}
            </div>

            {isModalOpen && (
                <ExtraHoursModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    config={instructorExtraHoursConfig}
                    onSave={handleSaveSegments}
                    holidays={holidays}
                    instructorName={instructor.name}
                    instructorSchedules={instructorSchedules}
                    instructor={instructor}
                    onSaveExemption={handleSaveExemption}
                />
            )}
        </>
    );
};

export default HEAssignedControl;
