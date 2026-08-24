
import { useCallback, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { isAcademicMetaLoad, isContractualLoad, buildInstructorScheduleIndex, getInstructorSchedules, resolveInstructorByName } from '../services/businessRules';
import { calculateWeeklyAudit, isHolidayWeekLoadNormal } from '../services/auditCalculations';
import { ProcessedSchedule } from '../types';

export const useScheduleCalculations = (currentWeekStart: Date) => {
    const { allSchedules, globalSchedulesSummary, instructorsByNameMap, instructorsMap, instructors, holidays, settings, extraHoursConfigsByInstructor } = useData();
    // Memoizado: sin esto, era un objeto Date nuevo en CADA render, lo que le daba a
    // checkInstructorDiscrepancy (useCallback de abajo) una identidad nueva en cada render
    // — eso invalidaba el useMemo de la lista lateral de instructores en SchedulePage.tsx
    // en cada render (no solo cuando los datos realmente cambian), causando un bucle de
    // re-render que repetía indefinidamente el escaneo caro de coincidencia por nombre.
    const semesterEndDate = useMemo(() => new Date(settings['semester_end_date'] || '2027-01-17'), [settings]);

    // Índices O(n) instructorId -> horarios (ver businessRules.ts). checkInstructorDiscrepancy
    // se llama una vez POR INSTRUCTOR desde la sidebar; sin esto, cada llamada hacía un
    // allSchedules.filter(belongsToInstructor) completo -> O(instructores × horarios) en total.
    const allSchedulesIndex = useMemo(() => buildInstructorScheduleIndex<ProcessedSchedule>(allSchedules), [allSchedules]);
    const summaryIndex = useMemo(() => buildInstructorScheduleIndex<ProcessedSchedule>(globalSchedulesSummary), [globalSchedulesSummary]);

    // Use summary if available (for sidebar), otherwise fall back to allSchedules (which might be empty if lazy)
    // Actually, allSchedules is "current view", globalSchedulesSummary is "all data lite".
    // For discrepancy of ANY instructor (sidebar), we MUST use globalSchedulesSummary.
    const checkInstructorDiscrepancy = useCallback((instructorName: string, instructorId?: string): boolean => {
        const inst = instructorId ? instructorsMap[instructorId] : resolveInstructorByName(instructorName, instructorsByNameMap, instructors);
        if (!inst) return false;

        if (currentWeekStart.getTime() > semesterEndDate.getTime()) return false;

        // PRIORIDAD CRÍTICA: Buscar primero en allSchedules (estado actual en memoria/editado)
        // Solo si no hay datos ahí (ej. para la sidebar de otros instructores no cargados), usar el summary.
        let instSchedules = getInstructorSchedules<ProcessedSchedule>(inst, allSchedulesIndex);
        if (instSchedules.length === 0 && globalSchedulesSummary.length > 0) {
            instSchedules = getInstructorSchedules<ProcessedSchedule>(inst, summaryIndex);
        }

        const instExtraHoursConfig = extraHoursConfigsByInstructor[inst.id] || null;

        // Único motor de auditoría (ver services/auditCalculations.ts::calculateWeeklyAudit) —
        // misma regla que la grilla, el Reporte Global y Avance de Horarios.
        const instAuditExempt = inst.hasExtraHoursAssigned === true;
        const week = calculateWeeklyAudit(inst.type, currentWeekStart, instSchedules, holidays, semesterEndDate, false, instExtraHoursConfig, instAuditExempt);
        // Antes, cualquier feriado en la semana anulaba el punto rojo de discrepancia en la
        // lista lateral. Ahora solo se anula si las semanas vecinas (anterior/posterior)
        // también respetan el límite diario — mismo criterio que el motor de auditoría.
        if (week.isHolidayWeek && isHolidayWeekLoadNormal(inst.type, currentWeekStart, instSchedules, holidays, semesterEndDate, instExtraHoursConfig, instAuditExempt)) return false;

        const isTC = inst.type === 'TC';
        let real = isTC ? week.contractReal : week.academicReal;
        // TP compara contra Horas Académicas (ARCHIVO convertido), no el ARCHIVO crudo —
        // mismo criterio que el resto de las pantallas de auditoría.
        let meta = isTC ? 46 : week.academicHoursMeta;

        // Si estamos usando datos de resumen (globalSchedulesSummary) sin horas de
        // inicio/fin por bloque, el cálculo por horario da 0 aunque sí haya carga —
        // recurrimos a weeklyHours como aproximación en ese caso (igual que antes).
        if (real === 0 && instSchedules.length > 0) {
            real = isTC
                ? instSchedules.reduce((sum, s) => isContractualLoad(s) ? sum + (s.weeklyHours || 0) : sum, 0)
                : instSchedules.filter(s => !s.isAdministrative && isAcademicMetaLoad(s)).reduce((sum, s) => sum + (s.weeklyHours || 0), 0);
        }

        if (week.hasDailyBreach) return true;
        return Math.abs(real - meta) > 0.01;
    }, [instructorsMap, instructorsByNameMap, instructors, holidays, currentWeekStart, semesterEndDate, allSchedulesIndex, summaryIndex, globalSchedulesSummary, extraHoursConfigsByInstructor]);

    return { checkInstructorDiscrepancy };
};
