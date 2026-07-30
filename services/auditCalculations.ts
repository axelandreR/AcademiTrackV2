import { ProcessedSchedule, Instructor, HolidayData } from '../types';
import { isAcademicMetaLoad, isContractualLoad, isOtherFunctionsCourse } from './businessRules';
import { timeToMinutes } from '../utils/timeUtils';
import { SEMESTER_START_DATE, SEMESTER_END_DATE, LOAD_LIMITS, CONTRACT_HOURS_TC } from '../constants';

const DAY_NAMES = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

export interface WeeklyAuditBreakdown {
    syncHours: number;
    asyncHours: number;
    otherHours: number;
    prepHours: number;
    assignHours: number;
    academicReal: number;
    academicMeta: number;
    contractReal: number;
    isHolidayWeek: boolean;
    hasDailyBreach: boolean;
    hasAcademicDiscrepancy: boolean;
    hasContractDiscrepancy: boolean;
    isValid: boolean;
}

/**
 * Motor ÚNICO de auditoría semanal (TC/TP): calcula las horas reales por categoría
 * (síncrono/asíncrono/otras funciones/preparación/por asignar), la meta académica del
 * archivo, el exceso de jornada diaria y las discrepancias semanales para UN instructor
 * en UNA semana. Reemplaza 5 copias casi idénticas de esta misma lógica que existían en
 * ScheduleGrid.tsx (stats y auditObservations), useScheduleCalculations.ts,
 * auditCalculations.ts (este archivo, antes con su propia copia) y auditService.ts —
 * cada una con su propia tolerancia y con/sin chequeo de exceso diario, lo que hacía que
 * un mismo instructor pudiera aparecer "OK" en una pantalla y en alerta en otra para la
 * misma semana. Todas las pantallas de auditoría DEBEN pasar por esta función.
 *
 * `instructorSchedules` debe venir YA filtrado a los horarios de ese instructor
 * (ver belongsToInstructor/getInstructorSchedules) — esta función no filtra por dueño.
 */
export const calculateWeeklyAudit = (
    instructorType: 'TC' | 'TP',
    weekStart: Date,
    instructorSchedules: ProcessedSchedule[],
    holidays: HolidayData[],
    semesterEndDate: Date
): WeeklyAuditBreakdown => {
    const isTC = instructorType === 'TC';
    const dailyLimitMins = isTC ? LOAD_LIMITS.DAILY_TC * 60 + 0.01 : LOAD_LIMITS.DAILY_TP * 60 + 0.01;

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartAt = weekStart.getTime();
    const weekEndAt = weekEnd.getTime();

    const isHoliday = (d: Date) => holidays.some(h =>
        h.date.getDate() === d.getDate() && h.date.getMonth() === d.getMonth() && h.date.getFullYear() === d.getFullYear()
    );
    const isHolidayWeek = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d;
    }).some(isHoliday);

    // Meta académica del archivo: suma de weeklyHours de tareas académicas ORIGINALES del
    // Excel (no administrativas) cuyo rango [startDate, endDate] se solapa con esta semana.
    // Las tareas administrativas (ej. Asíncrona agregada a mano) NO deben inflar la meta —
    // solo cuentan del lado "real" (satisfacen la meta, no la aumentan).
    const activeTasksThisWeek = instructorSchedules.filter(s =>
        !s.isAdministrative && isAcademicMetaLoad(s) && s.startDate.getTime() <= weekEndAt && s.endDate.getTime() >= weekStartAt
    );
    const academicMeta = activeTasksThisWeek.reduce((sum, s) => sum + s.weeklyHours, 0);

    let syncMin = 0, asyncMin = 0, otherMin = 0, prepMin = 0, assignMin = 0;
    let hasDailyBreach = false;

    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        if (day > semesterEndDate) continue;

        const dayName = DAY_NAMES[day.getDay()];
        const dayTarget = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();

        const dayTasks = instructorSchedules.filter(s => {
            if (!s.days.includes(dayName)) return false;
            const start = new Date(s.startDate.getFullYear(), s.startDate.getMonth(), s.startDate.getDate()).getTime();
            const end = new Date(s.endDate.getFullYear(), s.endDate.getMonth(), s.endDate.getDate()).getTime();
            return dayTarget >= start && dayTarget <= end;
        });

        let dayTotalMin = 0;
        dayTasks.forEach(s => {
            const dur = timeToMinutes(s.endTime) - timeToMinutes(s.startTime);
            if (isContractualLoad(s)) dayTotalMin += dur;

            // Cursos de "otras funciones" (asesorías, revisión de cuadernos, etc.) van a
            // OTROS aunque no sean administrativos — se pregunta ANTES que isAcademicMetaLoad
            // porque esa función devuelve true para todo bloque no-administrativo, lo que
            // dejaba esta rama inalcanzable (bug confirmado: OTROS siempre mostraba 0.00h).
            if (!s.isAdministrative && isOtherFunctionsCourse(s)) {
                otherMin += dur;
            } else if (isAcademicMetaLoad(s)) {
                const isAutoestudio = s.meetingType === 'VAEE' || (s.activity && s.activity.toUpperCase().includes('AUTOESTUDIO')) || s.category === 'asincrona';
                if (isAutoestudio) asyncMin += dur; else syncMin += dur;
            } else if (s.isAdministrative) {
                if (s.category === 'preparacion') prepMin += dur;
                else if (s.category === 'coordinador') otherMin += dur;
                else if (s.category === 'por_asignar') assignMin += dur;
            }
        });

        if (dayTotalMin > dailyLimitMins && !isHoliday(day)) hasDailyBreach = true;
    }

    const syncHours = syncMin / 60;
    const asyncHours = asyncMin / 60;
    const otherHours = otherMin / 60;
    const academicReal = syncHours + asyncHours + otherHours;
    const contractReal = academicReal + (prepMin / 60) + (assignMin / 60);

    const hasAcademicDiscrepancy = !isHolidayWeek && Math.abs(academicReal - academicMeta) > 0.01;
    const hasContractDiscrepancy = !isHolidayWeek && isTC && Math.abs(contractReal - CONTRACT_HOURS_TC) > 0.01;

    const isValid = !hasDailyBreach && (isTC ? !hasContractDiscrepancy : !hasAcademicDiscrepancy);

    return {
        syncHours, asyncHours, otherHours, prepHours: prepMin / 60, assignHours: assignMin / 60,
        academicReal, academicMeta, contractReal,
        isHolidayWeek, hasDailyBreach, hasAcademicDiscrepancy, hasContractDiscrepancy, isValid
    };
};

export interface Discrepancy {
    weekStart: Date;
    weekEnd?: Date;
    meta: number;
    real: number;
    diff: number;
    type: 'deficit' | 'excess' | 'daily_excess';
}

export interface DeepAuditResult {
    instructorName: string;
    isPerfect: boolean;
    discrepancies: Discrepancy[];
}

export interface AuditRow extends Instructor {
    metaCarga: number;
    cargaReal: number;
    totalSync: number;
    totalAsync: number;
    status: 'DEFICIT' | 'EXCESO' | 'OK' | 'NO_LOAD';
    hasHolidayS1: boolean;
    hasDailyBreachS1: boolean;
    deepAudit: DeepAuditResult;
}

export const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return date;
};

export const calculateSemesterRange = (schedules: ProcessedSchedule[], semesterEndDate: Date = SEMESTER_END_DATE) => {
    if (schedules.length === 0) return { start: new Date(), end: new Date() };
    const starts = schedules.map(s => s.startDate.getTime());
    const ends = schedules.map(s => s.endDate.getTime());
    return {
        start: getStartOfWeek(new Date(Math.max(Math.min(...starts), SEMESTER_START_DATE.getTime()))),
        end: new Date(Math.min(Math.max(...ends), semesterEndDate.getTime()))
    };
};

export const calculateInstructorAudit = (
    instructor: Instructor,
    // Ya resuelto por el caller vía buildInstructorScheduleIndex/getInstructorSchedules
    // (ver services/businessRules.ts) — evita repetir un .filter(belongsToInstructor)
    // sobre TODOS los horarios por cada uno de los ~261 instructores (~887k comparaciones
    // en Reporte Global, confirmado por auditoría de rendimiento).
    instSchedules: ProcessedSchedule[],
    holidays: HolidayData[],
    semesterRange: { start: Date; end: Date },
    semesterEndDate: Date = SEMESTER_END_DATE
): AuditRow => {
    const { start: globalStart, end: globalEnd } = semesterRange;
    const firstWeekStart = new Date(globalStart);
    const isTC = instructor.type === 'TC';

    const weekStartAt = firstWeekStart.getTime();
    const weekEndAtTime = weekStartAt + 6 * 24 * 60 * 60 * 1000;

    // S1: semana de referencia para el estado resumen (DEFICIT/EXCESO/OK) que se muestra
    // en la tabla del Reporte Global — usa el motor único (ver calculateWeeklyAudit).
    const s1 = calculateWeeklyAudit(instructor.type, firstWeekStart, instSchedules, holidays, semesterEndDate);
    const metaCargaS1 = isTC ? LOAD_LIMITS.WEEKLY_TC : s1.academicMeta;
    const cargaRealS1 = isTC ? s1.contractReal : s1.academicReal;
    const hasHolidayS1 = s1.isHolidayWeek;
    const hasDailyBreachS1 = s1.hasDailyBreach;

    // Deep Audit (recorre todo el semestre semana a semana con el mismo motor)
    const discrepancies: Discrepancy[] = [];
    let scannerDate = new Date(globalStart);
    const dailyLimit = isTC ? LOAD_LIMITS.DAILY_TC : LOAD_LIMITS.DAILY_TP;

    while (scannerDate <= globalEnd && scannerDate <= semesterEndDate) {
        const week = calculateWeeklyAudit(instructor.type, scannerDate, instSchedules, holidays, semesterEndDate);

        if (week.hasDailyBreach) {
            // El motor único no distingue el día exacto del exceso; lo re-derivamos aquí
            // solo para el detalle del reporte (mismo criterio que antes: por día).
            for (let i = 0; i < 7; i++) {
                const d = new Date(scannerDate);
                d.setDate(scannerDate.getDate() + i);
                if (d > semesterEndDate) continue;
                const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][d.getDay()];
                const dTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                const dayTasks = instSchedules.filter(s => {
                    if (!s.days.includes(dayName)) return false;
                    const start = new Date(s.startDate.getFullYear(), s.startDate.getMonth(), s.startDate.getDate()).getTime();
                    const end = new Date(s.endDate.getFullYear(), s.endDate.getMonth(), s.endDate.getDate()).getTime();
                    return dTarget >= start && dTarget <= end;
                });
                const dayMin = dayTasks.reduce((sum, s) => isContractualLoad(s) ? sum + (timeToMinutes(s.endTime) - timeToMinutes(s.startTime)) : sum, 0);
                const isHol = holidays.some(h => h.date.toDateString() === d.toDateString());
                if (dayMin / 60 > dailyLimit + 0.01 && !isHol) {
                    discrepancies.push({ weekStart: new Date(d), meta: dailyLimit, real: dayMin / 60, diff: (dayMin / 60) - dailyLimit, type: 'daily_excess' });
                }
            }
        }

        if (!week.isHolidayWeek) {
            const wMeta = isTC ? LOAD_LIMITS.WEEKLY_TC : week.academicMeta;
            const wReal = isTC ? week.contractReal : week.academicReal;
            if (Math.abs(wReal - wMeta) > 0.01) {
                const scanEnd = new Date(scannerDate);
                scanEnd.setDate(scannerDate.getDate() + 6);
                discrepancies.push({
                    weekStart: new Date(scannerDate), weekEnd: scanEnd,
                    meta: wMeta, real: wReal, diff: Math.abs(wReal - wMeta),
                    type: wReal < wMeta ? 'deficit' : 'excess'
                });
            }
        }
        scannerDate.setDate(scannerDate.getDate() + 7);
    }

    const isWeekBeforeSemester = weekEndAtTime < SEMESTER_START_DATE.getTime();
    const isWeekAfterSemester = weekStartAt > semesterEndDate.getTime();

    const deficitS1 = !hasHolidayS1 && !isWeekBeforeSemester && !isWeekAfterSemester && (cargaRealS1 < metaCargaS1 - 0.01);

    let finalStatus: 'DEFICIT' | 'EXCESO' | 'OK' | 'NO_LOAD' = deficitS1 ? 'DEFICIT' : (cargaRealS1 > metaCargaS1 + 0.01 && !hasHolidayS1 && !isWeekBeforeSemester && !isWeekAfterSemester ? 'EXCESO' : 'OK');
    if (finalStatus === 'OK' && hasDailyBreachS1 && !isWeekBeforeSemester && !isWeekAfterSemester) finalStatus = 'EXCESO';
    if ((metaCargaS1 === 0 && cargaRealS1 === 0) || isWeekBeforeSemester || isWeekAfterSemester) finalStatus = 'NO_LOAD';

    return {
        ...instructor,
        metaCarga: metaCargaS1,
        cargaReal: cargaRealS1,
        totalSync: s1.syncHours,
        totalAsync: s1.asyncHours,
        status: finalStatus,
        hasHolidayS1,
        hasDailyBreachS1,
        deepAudit: { instructorName: instructor.name, isPerfect: discrepancies.length === 0, discrepancies }
    };
};
