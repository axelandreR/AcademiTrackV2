
import { useMemo } from 'react';
import { ProcessedSchedule, Instructor, HolidayData } from '../types';
import { calculateSemesterRange, calculateInstructorAudit, AuditRow } from '../services/auditCalculations';

export const useAuditReport = (
    schedules: ProcessedSchedule[],
    instructors: Instructor[],
    holidays: HolidayData[],
    holidaysMap: Record<string, HolidayData>
) => {

    const semesterRange = useMemo(() => calculateSemesterRange(schedules), [schedules]);

    const auditData: AuditRow[] = useMemo(() => {
        return instructors.map(inst =>
            calculateInstructorAudit(inst, schedules, holidaysMap, semesterRange)
        );
    }, [schedules, instructors, holidaysMap, semesterRange]);

    const stats = useMemo(() => ({
        total: auditData.length,
        withDeficit: auditData.filter(i => i.status === 'DEFICIT').length,
        balanced: auditData.filter(i => i.status === 'OK').length,
        perfectCycle: auditData.filter(i => i.deepAudit.isPerfect).length,
    }), [auditData]);

    return { auditData, stats, semesterRange };
};
