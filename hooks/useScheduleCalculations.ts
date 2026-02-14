
import { useCallback } from 'react';
import { useData } from '../context/DataContext';
import { getStartOfWeek } from '../utils/timeUtils';
import { isAcademicMetaLoad, isContractualLoad } from '../services/businessRules';
import { timeToMinutes } from '../utils/timeUtils';

export const useScheduleCalculations = (currentWeekStart: Date) => {
    const { allSchedules, globalSchedulesSummary, instructorsByNameMap, holidays, settings } = useData();
    const semesterEndDate = new Date(settings['semester_end_date'] || '2026-07-26');
    // Use summary if available (for sidebar), otherwise fall back to allSchedules (which might be empty if lazy)
    // Actually, allSchedules is "current view", globalSchedulesSummary is "all data lite". 
    // For discrepancy of ANY instructor (sidebar), we MUST use globalSchedulesSummary.
    const checkInstructorDiscrepancy = useCallback((instructorName: string): boolean => {
        const inst = instructorsByNameMap[instructorName.toLowerCase()];
        if (!inst) return false;

        const weekStartId = currentWeekStart.getTime();
        if (weekStartId > semesterEndDate.getTime()) return false;

        let hasHolidayInWeek = false;
        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(currentWeekStart);
            currentDate.setDate(currentWeekStart.getDate() + i);
            if (holidays.some(h =>
                h.date.getDate() === currentDate.getDate() &&
                h.date.getMonth() === currentDate.getMonth() &&
                h.date.getFullYear() === currentDate.getFullYear()
            )) {
                hasHolidayInWeek = true;
                break;
            }
        }
        if (hasHolidayInWeek) return false;

        const isTC = inst.type === 'TC';

        // PRIORIDAD CRÍTICA: Buscar primero en allSchedules (estado actual en memoria/editado)
        // Solo si no hay datos ahí (ej. para la sidebar de otros instructores no cargados), usar el summary.
        let instSchedules = allSchedules.filter(s => s.instructor === instructorName);

        if (instSchedules.length === 0 && globalSchedulesSummary.length > 0) {
            instSchedules = globalSchedulesSummary.filter(s => s.instructor === instructorName);
        }

        let metaCarga = 0;
        let cargaAcademicaReal = 0;
        let totalSemana = 0;
        let hasDailyBreach = false;

        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(currentWeekStart.getDate() + 6);
        const weekEndAtTime = weekEnd.getTime();
        const weekStartAtTime = currentWeekStart.getTime();

        const activeAcademicTasks = instSchedules.filter(s =>
            !s.isAdministrative &&
            isAcademicMetaLoad(s) &&
            s.startDate.getTime() <= weekEndAtTime &&
            s.endDate.getTime() >= weekStartAtTime
        );
        metaCarga = activeAcademicTasks.reduce((sum, s) => sum + s.weeklyHours, 0);

        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(currentWeekStart);
            currentDate.setDate(currentWeekStart.getDate() + i);
            if (currentDate > semesterEndDate) continue;

            const dayNameIndex = currentDate.getDay(); // 0 = Sunday
            // Original code used: ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][currentDate.getDay()]
            const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][dayNameIndex];

            let dayTotalMin = 0;

            instSchedules.filter(s =>
                s.days.includes(dayName) &&
                currentDate >= s.startDate &&
                currentDate <= s.endDate
            ).forEach(s => {
                // If summary data lacks time, we can't calculate daily load accurately.
                // Assuming summary has 00:00 times or similar if not fetched.
                // If s.startTime is empty, skip daily calc?
                if (!s.startTime || !s.endTime) return;

                const durMin = timeToMinutes(s.endTime) - timeToMinutes(s.startTime);
                const durH = durMin / 60;

                // For Summary Data, daily distribution is unknown, so dayTotalMin will be 0.
                // This means Sidebar won't show Red dot for daily breaches, only for weekly total.
                // This is an acceptable trade-off for performance.

                if (isContractualLoad(s)) {
                    totalSemana += durH; // This might be wrong if we sum per-day.
                    // WAIT. Total Weekly Hours is usually pre-calculated in 'weeklyHours' field?
                    // Yes, s.weeklyHours exists.
                    // But 'totalSemana' here mimics summing actual blocks.
                    // If we use summary, we should maybe use s.weeklyHours directly?
                    dayTotalMin += durMin;
                }

                if (isAcademicMetaLoad(s)) {
                    cargaAcademicaReal += durH;
                }
            });

            if (isTC && dayTotalMin > 552.01) hasDailyBreach = true;
            if (!isTC && dayTotalMin > 420.01) hasDailyBreach = true;
        }

        // If we are using valid summary data without days, we might undercount 'totalSemana' if we rely on the loop above.
        // Let's perform a fallback calculation for totalSemana using weeklyHours field if the daily loop yielded 0 (likely due to missing days/times).
        if (totalSemana === 0 && instSchedules.length > 0) {
            // Sum weekly_hours from summary
            totalSemana = instSchedules.reduce((sum, s) => {
                // Only count if it's textual load? Reference logic needed.
                // isContractualLoad checks activity type.
                if (isContractualLoad(s)) return sum + (s.weeklyHours || 0);
                return sum;
            }, 0);

            // Also for Academic Load
            cargaAcademicaReal = instSchedules.filter(s =>
                !s.isAdministrative && isAcademicMetaLoad(s)
            ).reduce((sum, s) => sum + (s.weeklyHours || 0), 0);
        }

        if (hasDailyBreach) return true;

        if (isTC) {
            return Math.abs(totalSemana - 46) > 0.01;
        } else {
            return Math.abs(cargaAcademicaReal - metaCarga) > 0.01; // metaCarga logic might need review if derived from loop
        }
    }, [instructorsByNameMap, holidays, currentWeekStart, allSchedules, globalSchedulesSummary]);

    return { checkInstructorDiscrepancy };
};
