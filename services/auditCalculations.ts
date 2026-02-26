import { ProcessedSchedule, Instructor, HolidayData } from '../types';
import { isAcademicMetaLoad, isContractualLoad, isOtherFunctionsCourse } from './businessRules';
import { timeToMinutes } from '../utils/timeUtils';
import { SEMESTER_START_DATE, SEMESTER_END_DATE, LOAD_LIMITS } from '../constants';

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

export const calculateSemesterRange = (schedules: ProcessedSchedule[]) => {
    if (schedules.length === 0) return { start: new Date(), end: new Date() };
    const starts = schedules.map(s => s.startDate.getTime());
    const ends = schedules.map(s => s.endDate.getTime());
    return {
        start: getStartOfWeek(new Date(Math.max(Math.min(...starts), SEMESTER_START_DATE.getTime()))),
        end: new Date(Math.min(Math.max(...ends), SEMESTER_END_DATE.getTime()))
    };
};

export const calculateInstructorAudit = (
    instructor: Instructor,
    schedules: ProcessedSchedule[],
    holidaysMap: Record<string, HolidayData>,
    semesterRange: { start: Date; end: Date }
): AuditRow => {
    const { start: globalStart, end: globalEnd } = semesterRange;
    const firstWeekStart = new Date(globalStart);
    const isTC = instructor.type === 'TC';
    const instSchedules = schedules.filter(s => s.instructor === instructor.name);
    const instAcademic = instSchedules.filter(s => !s.isAdministrative);

    // Optimization: Build a Map for fast daily schedule lookup
    // Key: Midnight Timestamp, Value: Schedules active on that day
    const dayScheduleMap = new Map<number, ProcessedSchedule[]>();
    const dayNames = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

    instSchedules.forEach(s => {
        if (!s.days || !Array.isArray(s.days) || s.days.length === 0) return;

        // Limit to semester range or schedule range
        const startT = Math.max(s.startDate.getTime(), globalStart.getTime());
        const endT = Math.min(s.endDate.getTime(), globalEnd.getTime(), SEMESTER_END_DATE.getTime());

        if (startT > endT) return;

        for (let d = new Date(startT); d.getTime() <= endT; d.setDate(d.getDate() + 1)) {
            const currentDayName = dayNames[d.getDay()];
            if (s.days.includes(currentDayName)) {
                const midnight = new Date(d);
                midnight.setHours(0, 0, 0, 0);
                const key = midnight.getTime();

                if (!dayScheduleMap.has(key)) dayScheduleMap.set(key, []);
                dayScheduleMap.get(key)!.push(s);
            }
        }
    });

    let metaCargaS1 = 0;
    let totalSyncS1 = 0;
    let totalAsyncS1 = 0;
    let hasHolidayS1 = false;
    let hasDailyBreachS1 = false;

    const weekStartAt = firstWeekStart.getTime();
    const weekEndAt = new Date(firstWeekStart);
    weekEndAt.setDate(firstWeekStart.getDate() + 6);
    const weekEndAtTime = weekEndAt.getTime();

    // Logic for S1 Meta Load
    if (isTC) {
        metaCargaS1 = LOAD_LIMITS.WEEKLY_TC;
    } else {
        const activeAcademicWeek1 = instAcademic.filter(s => s.startDate.getTime() <= weekEndAtTime && s.endDate.getTime() >= weekStartAt);
        metaCargaS1 = activeAcademicWeek1.reduce((sum, s) => sum + s.weeklyHours, 0);
    }

    const dailyLimit = isTC ? LOAD_LIMITS.DAILY_TC : LOAD_LIMITS.DAILY_TP;

    // Calculate S1 Real Load and Daily Breach using Map
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(firstWeekStart);
        currentDate.setDate(firstWeekStart.getDate() + i);
        if (currentDate > SEMESTER_END_DATE) continue;

        // Normalize for lookup
        const lookupDate = new Date(currentDate);
        lookupDate.setHours(0, 0, 0, 0);
        const dateKey = lookupDate.getTime();

        const hol = holidaysMap[currentDate.toDateString()];
        if (hol) hasHolidayS1 = true;

        let dayMinS1 = 0;
        const dailyTasks = dayScheduleMap.get(dateKey) || [];

        dailyTasks.forEach(s => {
            const durTotal = (timeToMinutes(s.endTime) - timeToMinutes(s.startTime));
            if (isContractualLoad(s)) dayMinS1 += durTotal;

            const dur = durTotal / 60;
            if (isTC) {
                if (isContractualLoad(s)) totalSyncS1 += dur;
            } else {
                if (isAcademicMetaLoad(s)) totalSyncS1 += dur;
            }
        });

        if (dayMinS1 / 60 > dailyLimit + 0.01 && !hol) hasDailyBreachS1 = true;
    }

    // Deep Audit (Scan entire semester)
    const discrepancies: Discrepancy[] = [];
    let scannerDate = new Date(globalStart);

    while (scannerDate <= globalEnd && scannerDate <= SEMESTER_END_DATE) {
        let wMeta = 0;
        let wReal = 0;
        let hasHolidayInWeek = false;

        const scanStart = scannerDate.getTime();
        const scanEnd = new Date(scannerDate);
        scanEnd.setDate(scannerDate.getDate() + 6);
        const scanEndTime = scanEnd.getTime();

        if (isTC) {
            wMeta = LOAD_LIMITS.WEEKLY_TC;
        } else {
            // Weekly Meta Check still uses filter because it depends on Week Range overlap, not specific days
            const weeklyTasks = instSchedules.filter(s => isAcademicMetaLoad(s) && s.startDate.getTime() <= scanEndTime && s.endDate.getTime() >= scanStart);
            wMeta = weeklyTasks.reduce((sum, s) => sum + s.weeklyHours, 0);
        }

        for (let i = 0; i < 7; i++) {
            const d = new Date(scannerDate);
            d.setDate(scannerDate.getDate() + i);
            if (d > SEMESTER_END_DATE) continue;

            const hol = holidaysMap[d.toDateString()];
            if (hol) hasHolidayInWeek = true;

            // Map Lookup
            const lookupDate = new Date(d);
            lookupDate.setHours(0, 0, 0, 0);
            const dateKey = lookupDate.getTime();

            const dailyTasks = dayScheduleMap.get(dateKey) || [];
            let dayMinScanner = 0;

            dailyTasks.forEach(s => {
                const durTotal = (timeToMinutes(s.endTime) - timeToMinutes(s.startTime));
                if (isContractualLoad(s)) dayMinScanner += durTotal;

                const dur = durTotal / 60;
                if (isTC) {
                    if (isContractualLoad(s)) wReal += dur;
                } else {
                    if (isAcademicMetaLoad(s)) wReal += dur;
                }
            });

            if (dayMinScanner / 60 > dailyLimit + 0.01 && !hol) {
                discrepancies.push({
                    weekStart: new Date(d),
                    meta: dailyLimit,
                    real: dayMinScanner / 60,
                    diff: (dayMinScanner / 60) - dailyLimit,
                    type: 'daily_excess'
                });
            }
        }

        if (!hasHolidayInWeek && Math.abs(wReal - wMeta) > 0.01) {
            discrepancies.push({
                weekStart: new Date(scannerDate), weekEnd: new Date(scanEndTime),
                meta: wMeta, real: wReal, diff: Math.abs(wReal - wMeta),
                type: wReal < wMeta ? 'deficit' : 'excess'
            });
        }
        scannerDate.setDate(scannerDate.getDate() + 7);
    }

    const cargaRealS1 = totalSyncS1;
    const isWeekBeforeSemester = weekEndAtTime < SEMESTER_START_DATE.getTime();
    const isWeekAfterSemester = weekStartAt > SEMESTER_END_DATE.getTime();

    const deficitS1 = !hasHolidayS1 && !isWeekBeforeSemester && !isWeekAfterSemester && (cargaRealS1 < metaCargaS1 - 0.01);

    let finalStatus: 'DEFICIT' | 'EXCESO' | 'OK' | 'NO_LOAD' = deficitS1 ? 'DEFICIT' : (cargaRealS1 > metaCargaS1 + 0.01 && !hasHolidayS1 && !isWeekBeforeSemester && !isWeekAfterSemester ? 'EXCESO' : 'OK');
    if (finalStatus === 'OK' && hasDailyBreachS1 && !isWeekBeforeSemester && !isWeekAfterSemester) finalStatus = 'EXCESO';
    if ((metaCargaS1 === 0 && cargaRealS1 === 0) || isWeekBeforeSemester || isWeekAfterSemester) finalStatus = 'NO_LOAD';

    return {
        ...instructor,
        metaCarga: metaCargaS1,
        cargaReal: cargaRealS1,
        totalSync: totalSyncS1,
        totalAsync: totalAsyncS1,
        status: finalStatus,
        hasHolidayS1,
        hasDailyBreachS1,
        deepAudit: { instructorName: instructor.name, isPerfect: discrepancies.length === 0, discrepancies }
    };
};
