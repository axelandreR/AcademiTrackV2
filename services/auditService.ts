
import { ProcessedSchedule, Instructor, HolidayData, ExtraHoursConfig } from '../types';
import { calculateWeeklyAudit } from './auditCalculations';
import { LOAD_LIMITS } from '../constants';

interface AuditResult {
    isValid: boolean;
    reasons: string[];
}

/**
 * Valida una semana de un instructor usando el motor único de auditoría (ver
 * services/auditCalculations.ts::calculateWeeklyAudit) — misma regla, misma tolerancia
 * (0.01h) y mismo chequeo de exceso diario que usan la grilla del Editor/Visualizador y
 * el Reporte Global. Antes esta función tenía su propia lógica con tolerancia mucho más
 * laxa (0.5h TC / 0.1h TP) y sin chequeo de exceso diario, lo que hacía que un instructor
 * pudiera aparecer "Audit OK" aquí (Avance de Horarios / Fichas de Asistencia) y en
 * alerta en la grilla para la misma semana.
 */
export const validateInstructorWeek = (
    instructor: Instructor,
    weekStart: Date,
    schedules: ProcessedSchedule[], // Schedules for this instructor
    holidays: HolidayData[],
    semesterEndDate: Date,
    extraHoursConfig: ExtraHoursConfig | null = null
): AuditResult => {
    // week.hasContractDiscrepancy/hasAcademicDiscrepancy/hasDailyBreach ya vienen
    // validados contra semanas vecinas cuando hay feriado (ver isHolidayWeekLoadNormal en
    // auditCalculations.ts) — ya no hace falta anular esta función entera por feriado.
    const week = calculateWeeklyAudit(instructor.type, weekStart, schedules, holidays, semesterEndDate, false, extraHoursConfig, instructor.hasExtraHoursAssigned === true);

    const reasons: string[] = [];

    if (instructor.type === 'TC') {
        if (week.hasContractDiscrepancy) {
            reasons.push(`Carga Actual: ${week.contractReal.toFixed(2)}h / Meta: ${LOAD_LIMITS.WEEKLY_TC}h`);
        }
    } else {
        if (week.hasAcademicDiscrepancy) {
            reasons.push(`Programado: ${week.academicReal.toFixed(2)}h vs Requerido: ${week.academicHoursMeta.toFixed(2)}h (Horas Académicas)`);
        }
    }

    if (week.hasDailyBreach) {
        const dailyLimit = instructor.type === 'TC' ? LOAD_LIMITS.DAILY_TC : LOAD_LIMITS.DAILY_TP;
        reasons.push(`Exceso de jornada diaria (límite ${dailyLimit}h/día)`);
    }

    return {
        isValid: reasons.length === 0,
        reasons
    };
};
