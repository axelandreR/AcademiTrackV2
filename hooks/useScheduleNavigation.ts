import { useState, useMemo, useEffect } from 'react';
import { ProcessedSchedule } from '../types';
import { getStartOfWeek } from '../utils/timeUtils';

const parseSettingsDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const parts = dateStr.includes('T') ? dateStr.split('T')[0].split('-') : dateStr.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
};

export const useScheduleNavigation = (allSchedules: ProcessedSchedule[], settings?: Record<string, string>) => {
    const semesterStart = settings ? parseSettingsDate(settings['semester_start_date'] || '2026-02-16') : new Date(2026, 1, 16);
    const semesterEnd = settings ? parseSettingsDate(settings['semester_end_date'] || '2026-07-26') : new Date(2026, 6, 26);
    const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
        const today = new Date();
        if (today < semesterStart) return getStartOfWeek(semesterStart);
        return getStartOfWeek(today);
    });

    const semesterWeeks = useMemo(() => {
        if (allSchedules.length === 0) return [];

        const starts = allSchedules.map(s => s.startDate.getTime());
        const ends = allSchedules.map(s => s.endDate.getTime());

        if (starts.length === 0) return [];

        const globalMin = new Date(Math.min(...starts));
        const globalMax = new Date(Math.max(...ends, semesterEnd.getTime()));

        let current = getStartOfWeek(globalMin);
        const weeks: { start: Date; label: string }[] = [];
        while (current <= globalMax) {
            const weekEnd = new Date(current);
            weekEnd.setDate(current.getDate() + 6);
            const label = `${current.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).toUpperCase()} - ${weekEnd.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}`;
            weeks.push({ start: new Date(current), label });
            current.setDate(current.getDate() + 7);
        }
        return weeks;
    }, [allSchedules, semesterEnd]);

    return {
        currentWeekStart,
        setCurrentWeekStart,
        semesterWeeks,
        navigateWeek: (weeks: number) => {
            setCurrentWeekStart(prev => {
                const next = new Date(prev);
                next.setDate(prev.getDate() + (weeks * 7));
                return next;
            });
        }
    };
};
