import { ProcessedSchedule, ExtraHoursConfig } from '../types';
import { isAcademicMetaLoad, isOtherFunctionsCourse, isTempHECoverage } from './businessRules';
import { getExtraWindowsForDate, splitTaskFragments } from './extraHoursCalculations';
import { timeToMinutes } from '../utils/timeUtils';

const DAY_NAMES = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

export interface DayPedagogicalHours {
    date: Date;
    /** Horas pedagógicas del día: cursos del archivo ÷45min (CNIU-108/126 y otras funciones ÷60). */
    classHP: number;
    /** Tareas administrativas asíncronas del día, en horas cronológicas (no entran en classHP). */
    asyncAdminHours: number;
    /** HP de clases que caen en una ventana de "Configurar HE" o son cobertura temporal de HE: se muestran aparte y NO entran en classHP. */
    extraHP: number;
}

export interface WeekPedagogicalHours {
    days: DayPedagogicalHours[];
    totalHP: number;
    totalAsyncAdminHours: number;
    totalExtraHP: number;
}

/**
 * Horas pedagógicas asignadas por día y total de la semana para UN instructor. Usa
 * exactamente el mismo criterio que calculateWeeklyAudit (services/auditCalculations.ts)
 * para `academicHoursMeta`: cursos del archivo (no administrativos) en horas académicas
 * (45min = 1h), con CNIU-108/CNIU-126/"otras funciones" en cronológico (60min = 1h),
 * excluyendo cobertura temporal de HE y los fragmentos dentro de una ventana de
 * "Configurar HE". Por eso el total semanal coincide con la Meta de TP del pie.
 *
 * `instructorSchedules` debe venir ya filtrado a los horarios de ese instructor.
 */
export const calculateWeekPedagogicalHours = (
    weekStart: Date,
    instructorSchedules: ProcessedSchedule[],
    semesterEndDate: Date,
    extraHoursConfig: ExtraHoursConfig | null = null
): WeekPedagogicalHours => {
    const days: DayPedagogicalHours[] = [];
    let totalRegularMin = 0, totalExceptionMin = 0, totalAsyncAdminMin = 0, totalExtraHP = 0;

    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);

        if (day > semesterEndDate) {
            days.push({ date: day, classHP: 0, asyncAdminHours: 0, extraHP: 0 });
            continue;
        }

        const dayName = DAY_NAMES[day.getDay()];
        const dayTarget = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
        const dayTasks = instructorSchedules.filter(s => {
            if (!s.days.includes(dayName)) return false;
            const start = new Date(s.startDate.getFullYear(), s.startDate.getMonth(), s.startDate.getDate()).getTime();
            const end = new Date(s.endDate.getFullYear(), s.endDate.getMonth(), s.endDate.getDate()).getTime();
            return dayTarget >= start && dayTarget <= end;
        });
        const extraWindows = extraHoursConfig ? getExtraWindowsForDate(extraHoursConfig, day, dayName) : [];

        let regularMin = 0, exceptionMin = 0, asyncAdminMin = 0, extraHP = 0;
        const toHP = (s: ProcessedSchedule, min: number) => (isOtherFunctionsCourse(s) ? min / 60 : min / 45);
        dayTasks.forEach(s => {
            if (isTempHECoverage(s)) {
                if (!s.isAdministrative) extraHP += toHP(s, timeToMinutes(s.endTime) - timeToMinutes(s.startTime));
                return;
            }
            const taskStart = timeToMinutes(s.startTime);
            const taskEnd = timeToMinutes(s.endTime);
            const fragments = extraWindows.length > 0
                ? splitTaskFragments(taskStart, taskEnd, extraWindows)
                : [{ start: taskStart, end: taskEnd, extra: false }];
            fragments.forEach(frag => {
                const dur = frag.end - frag.start;
                if (dur <= 0) return;
                if (frag.extra) {
                    if (!s.isAdministrative) extraHP += toHP(s, dur);
                    return;
                }
                if (!s.isAdministrative && isOtherFunctionsCourse(s)) {
                    exceptionMin += dur;
                } else if (isAcademicMetaLoad(s)) {
                    if (!s.isAdministrative) regularMin += dur;
                    else asyncAdminMin += dur;
                }
            });
        });

        days.push({ date: day, classHP: regularMin / 45 + exceptionMin / 60, asyncAdminHours: asyncAdminMin / 60, extraHP });
        totalRegularMin += regularMin; totalExceptionMin += exceptionMin; totalAsyncAdminMin += asyncAdminMin; totalExtraHP += extraHP;
    }

    return {
        days,
        totalHP: totalRegularMin / 45 + totalExceptionMin / 60,
        totalAsyncAdminHours: totalAsyncAdminMin / 60,
        totalExtraHP,
    };
};

/**
 * Hasta 2 decimales, sin ceros sobrantes: 5 -> "5", 3.75 -> "3.75", 5.0222 -> "5.02".
 * Dos decimales (y no uno) para que un desfase de 1 minuto en un bloque (226 min en vez de
 * 225 -> 5.02 HP) no quede escondido por el redondeo.
 */
export const formatHP = (hp: number): string => String(parseFloat(hp.toFixed(2)));
