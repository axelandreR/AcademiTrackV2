import React, { useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Instructor } from '../types';
import { belongsToInstructor } from '../services/businessRules';
import { isInstructorAuditExemptForWeek } from '../services/auditCalculations';
import { calculateWeeklyExtraBreakdown } from '../services/extraHoursCalculations';
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
 * Solo el botón + los badges de estado (rango vigente, semana exenta, desglose Regular vs
 * HE) — los accesos a reportes y a "Migrar Tareas Administrativas" viven aparte en
 * HEQuickActions.tsx, dentro del desplegable de la Toolbar, para no saturar este
 * encabezado siempre visible (ver ScheduleToolbar.tsx).
 */
const HEAssignedControl: React.FC<HEAssignedControlProps> = ({ instructor, currentWeekStart }) => {
    const { allSchedules, extraHoursConfigsByInstructor, holidays, setInstructorHEAssignment, saveInstructorExtraHoursConfig } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);

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
