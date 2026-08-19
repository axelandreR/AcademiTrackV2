import { ProcessedSchedule, HolidayData, ExtraHoursConfig, ExtraHoursSegment, ExtraHoursShift } from '../types';
import { isContractualLoad } from './businessRules';
import { timeToMinutes, getStartOfWeek } from '../utils/timeUtils';
import { CONTRACT_HOURS_TC, SEMESTER_START_DATE, SEMESTER_END_DATE } from '../constants';

export const createEmptySegment = (): ExtraHoursSegment => ({
    id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startDate: '',
    endDate: '',
    repeatWeekly: true,
    shifts: {}
});

/**
 * Acepta tanto el formato nuevo ({ segments: [...] }) como el formato plano previo
 * (un solo rango de fechas + shifts, sin `segments`) para no romper escenarios y HE
 * guardadas antes de introducir los tramos — se envuelven en un único tramo "legacy".
 */
export const normalizeExtraHoursConfig = (raw: any): ExtraHoursConfig | null => {
    if (!raw) return null;
    if (Array.isArray(raw.segments)) {
        return { segments: raw.segments.map((s: any) => ({ ...createEmptySegment(), ...s })) };
    }
    if (raw.shifts || raw.startDate || raw.endDate) {
        return {
            segments: [{
                id: 'legacy',
                startDate: raw.startDate || '',
                endDate: raw.endDate || '',
                repeatWeekly: raw.repeatWeekly ?? true,
                shifts: raw.shifts || {}
            }]
        };
    }
    return { segments: [] };
};

const parseLocalDate = (dateString: string): Date | null => {
    if (!dateString) return null;
    const parts = dateString.split('-').map(Number);
    if (parts.length !== 3) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
};

/** Tramo cuyo rango [startDate, endDate] cubre la fecha dada. Fecha Inicio/Fin en blanco
 * significa "sin límite" de ese lado (patrón recurrente indefinido), igual que el
 * comportamiento previo de un solo tramo. Si varios tramos se solapan, gana el primero
 * (no debería ocurrir en uso normal). */
export const findSegmentForDate = (config: ExtraHoursConfig | null | undefined, date: Date): ExtraHoursSegment | undefined => {
    if (!config) return undefined;
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return config.segments.find(seg => {
        const start = parseLocalDate(seg.startDate);
        const end = parseLocalDate(seg.endDate);
        if (start && target < start.getTime()) return false;
        if (end && target > end.getTime()) return false;
        return true;
    });
};

export const getExtraWindowsForDate = (config: ExtraHoursConfig | null | undefined, date: Date, dayKey: string): { start: number; end: number }[] => {
    const segment = findSegmentForDate(config, date);
    const dayShifts = segment?.shifts[dayKey];
    if (!dayShifts) return [];
    const windows: { start: number; end: number }[] = [];
    if (dayShifts.morning?.start && dayShifts.morning?.end) {
        windows.push({ start: timeToMinutes(dayShifts.morning.start), end: timeToMinutes(dayShifts.morning.end) });
    }
    if (dayShifts.afternoon?.start && dayShifts.afternoon?.end) {
        windows.push({ start: timeToMinutes(dayShifts.afternoon.start), end: timeToMinutes(dayShifts.afternoon.end) });
    }
    return windows;
};

/** Parte [taskStart, taskEnd) en fragmentos, marcando cada uno como HE (isExtra) o no,
 * según si su punto medio cae dentro de alguna ventana de horas extra. */
export const splitTaskFragments = (
    taskStart: number,
    taskEnd: number,
    extraWindows: { start: number; end: number }[]
): { start: number; end: number; extra: boolean }[] => {
    const splitPoints = new Set<number>([taskStart, taskEnd]);
    extraWindows.forEach(win => {
        if (win.start > taskStart && win.start < taskEnd) splitPoints.add(win.start);
        if (win.end > taskStart && win.end < taskEnd) splitPoints.add(win.end);
    });

    const sortedPoints = Array.from(splitPoints).sort((a, b) => a - b);
    const fragments: { start: number; end: number; extra: boolean }[] = [];
    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const s = sortedPoints[i];
        const e = sortedPoints[i + 1];
        const mid = (s + e) / 2;
        const isExtra = extraWindows.some(win => mid >= win.start && mid <= win.end);
        fragments.push({ start: s, end: e, extra: isExtra });
    }
    return fragments;
};

const DAY_NAMES = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

const isScheduleActiveOnDate = (sched: ProcessedSchedule, date: Date, dayKey: string): boolean => {
    if (!sched.days.includes(dayKey)) return false;
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const start = new Date(sched.startDate.getFullYear(), sched.startDate.getMonth(), sched.startDate.getDate()).getTime();
    const end = new Date(sched.endDate.getFullYear(), sched.endDate.getMonth(), sched.endDate.getDate()).getTime();
    return target >= start && target <= end;
};

const isHolidayDate = (date: Date, holidays: HolidayData[]): boolean =>
    holidays.some(h => h.date.getDate() === date.getDate() && h.date.getMonth() === date.getMonth() && h.date.getFullYear() === date.getFullYear());

export interface WeeklyExtraBreakdown {
    weekStart: Date;
    totalHours: number;
    extraHours: number;
    regularHours: number;
    metaHours: number;
    isBalanced: boolean;
}

/**
 * Recorre el horario completo del instructor (ya filtrado a él) semana a semana y, para
 * cada bloque contractual (excluye Refrigerio, igual que el resto de la app — ver
 * isContractualLoad), separa cuántos minutos caen dentro de alguna ventana de HE marcada
 * en `config` vs cuántos quedan como carga regular. Sirve para validar que lo que NO es
 * HE siga sumando las 46h del contrato (CONTRACT_HOURS_TC) — la HE es adicional, no un
 * reemplazo de esas horas.
 */
export const calculateWeeklyExtraBreakdown = (
    schedules: ProcessedSchedule[],
    config: ExtraHoursConfig | null,
    holidays: HolidayData[]
): WeeklyExtraBreakdown[] => {
    if (schedules.length === 0) return [];

    const starts = schedules.map(s => s.startDate.getTime());
    const ends = schedules.map(s => s.endDate.getTime());
    const rangeStart = getStartOfWeek(new Date(Math.max(Math.min(...starts), SEMESTER_START_DATE.getTime())));
    const rangeEnd = new Date(Math.min(Math.max(...ends), SEMESTER_END_DATE.getTime()));

    const weeks: WeeklyExtraBreakdown[] = [];
    let weekStart = new Date(rangeStart);

    while (weekStart.getTime() <= rangeEnd.getTime()) {
        let totalMin = 0;
        let extraMin = 0;

        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + i);
            if (day.getTime() > SEMESTER_END_DATE.getTime()) continue;
            if (isHolidayDate(day, holidays)) continue;

            const dayKey = DAY_NAMES[day.getDay()];
            const dayTasks = schedules.filter(s => isContractualLoad(s) && isScheduleActiveOnDate(s, day, dayKey));
            const extraWindows = getExtraWindowsForDate(config, day, dayKey);

            dayTasks.forEach(s => {
                const taskStart = timeToMinutes(s.startTime);
                const taskEnd = timeToMinutes(s.endTime);
                totalMin += Math.max(0, taskEnd - taskStart);
                if (extraWindows.length === 0) return;
                splitTaskFragments(taskStart, taskEnd, extraWindows).forEach(frag => {
                    if (frag.extra) extraMin += frag.end - frag.start;
                });
            });
        }

        const totalHours = totalMin / 60;
        const extraHours = extraMin / 60;
        const regularHours = totalHours - extraHours;
        weeks.push({
            weekStart: new Date(weekStart),
            totalHours,
            extraHours,
            regularHours,
            metaHours: CONTRACT_HOURS_TC,
            isBalanced: Math.abs(regularHours - CONTRACT_HOURS_TC) < 0.01
        });

        weekStart.setDate(weekStart.getDate() + 7);
    }

    return weeks;
};
