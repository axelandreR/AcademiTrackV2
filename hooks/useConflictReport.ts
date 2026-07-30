
import { useMemo } from 'react';
import { ProcessedSchedule, HolidayData, Instructor } from '../types';
import { detectConflicts, Conflict } from '../services/conflictDetection';

export const useConflictReport = (
    schedules: ProcessedSchedule[],
    semesterRange: { start: Date; end: Date },
    holidaysMap: Record<string, HolidayData>,
    instructors: Instructor[] = []
) => {
    const conflictData: Conflict[] = useMemo(() => {
        return detectConflicts(schedules, semesterRange, holidaysMap, instructors);
    }, [schedules, semesterRange.start, semesterRange.end, holidaysMap, instructors]);

    return { conflictData };
};
