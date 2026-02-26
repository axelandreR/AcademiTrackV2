
import { useMemo } from 'react';
import { ProcessedSchedule, HolidayData } from '../types';
import { detectConflicts, Conflict } from '../services/conflictDetection';

export const useConflictReport = (
    schedules: ProcessedSchedule[],
    semesterRange: { start: Date; end: Date },
    holidaysMap: Record<string, HolidayData>
) => {
    const conflictData: Conflict[] = useMemo(() => {
        return detectConflicts(schedules, semesterRange, holidaysMap);
    }, [schedules, semesterRange.start, semesterRange.end, holidaysMap]);

    return { conflictData };
};
