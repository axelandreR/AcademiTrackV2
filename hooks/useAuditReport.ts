
import { useMemo } from 'react';
import { ProcessedSchedule, Instructor, HolidayData } from '../types';
import { calculateSemesterRange, calculateInstructorAudit, AuditRow } from '../services/auditCalculations';
import { buildInstructorScheduleIndex, getInstructorSchedules } from '../services/businessRules';
import { useData } from '../context/DataContext';
import { SEMESTER_END_DATE } from '../constants';

export const useAuditReport = (
    schedules: ProcessedSchedule[],
    instructors: Instructor[],
    holidays: HolidayData[]
) => {
    const { settings } = useData();
    // Misma fecha de fin de semestre que usa la grilla/Editor (settings.semester_end_date),
    // para que el Reporte Global no discrepe con lo que el usuario ve al editar un horario.
    // NO es la fecha límite de auditoría configurable de Avance de Horarios — esa es a
    // propósito una vista distinta (ver comentario en DataContext.getAuditCutoffDate).
    const semesterEndDate = useMemo(() => {
        const raw = settings['semester_end_date'];
        return raw ? new Date(raw) : new Date(SEMESTER_END_DATE);
    }, [settings]);

    const semesterRange = useMemo(() => calculateSemesterRange(schedules, semesterEndDate), [schedules, semesterEndDate]);

    // Índice O(n) instructorId -> horarios en vez de repetir schedules.filter(belongsToInstructor)
    // por cada uno de los ~261 instructores (~887k comparaciones confirmadas por auditoría
    // de rendimiento sobre esta misma pantalla — Reporte Global).
    const scheduleIndex = useMemo(() => buildInstructorScheduleIndex<ProcessedSchedule>(schedules), [schedules]);

    const auditData: AuditRow[] = useMemo(() => {
        return instructors.map(inst =>
            calculateInstructorAudit(inst, getInstructorSchedules<ProcessedSchedule>(inst, scheduleIndex), holidays, semesterRange, semesterEndDate)
        );
    }, [scheduleIndex, instructors, holidays, semesterRange, semesterEndDate]);

    const stats = useMemo(() => ({
        total: auditData.length,
        withDeficit: auditData.filter(i => i.status === 'DEFICIT').length,
        balanced: auditData.filter(i => i.status === 'OK').length,
        perfectCycle: auditData.filter(i => i.deepAudit.isPerfect).length,
    }), [auditData]);

    return { auditData, stats, semesterRange };
};
