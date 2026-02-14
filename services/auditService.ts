
import { ProcessedSchedule, Instructor, HolidayData } from '../types';
import { isAcademicMetaLoad, isContractualLoad } from './businessRules';
import { timeToMinutes } from '../utils/timeUtils';

interface AuditResult {
    isValid: boolean;
    reasons: string[];
}

/**
 * Validates a single week for a specific instructor based on their schedule.
 * Contains the core business logic for "Audit OK".
 */
// Helper to get duration in hours from a schedule
const getDurationHours = (s: ProcessedSchedule): number => {
    if (!s.startTime || !s.endTime) return 0;
    const minutes = timeToMinutes(s.endTime) - timeToMinutes(s.startTime);
    return minutes / 60;
};

export const validateInstructorWeek = (
    instructor: Instructor,
    weekStart: Date,
    schedules: ProcessedSchedule[], // Schedules for this instructor
    holidays: HolidayData[]
): AuditResult => {
    // 1. Holiday Check
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    let hasHolidayInWeek = false;
    if (holidays && holidays.length > 0) {
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            if (holidays.some(h => h.date.toDateString() === d.toDateString())) {
                hasHolidayInWeek = true;
                break;
            }
        }
    }

    if (hasHolidayInWeek) {
        return { isValid: true, reasons: [] };
    }

    // 2. Identify Active Schedules for this Week
    // using strict date overlap
    const activeSchedules = schedules.filter(s =>
        s.startDate instanceof Date && !isNaN(s.startDate.getTime()) &&
        s.endDate instanceof Date && !isNaN(s.endDate.getTime()) &&
        s.startDate.getTime() <= weekEnd.getTime() &&
        s.endDate.getTime() >= weekStart.getTime()
    );

    // 3. Validation Logic
    const reasons: string[] = [];

    if (instructor.type === 'TC') {
        // --- TC Validation ---
        // Rule: Total Contractual Load must be ~46 hours
        // We sum the ACTUAL SCHEDULED DURATION of all contractual tasks

        const contractualSchedules = activeSchedules.filter(s => isContractualLoad(s));

        // Calculate Real Load (based on Time)
        const totalRealHours = contractualSchedules.reduce((sum, s) => {
            // Check if schedule runs on specific days? 
            // For weekly summary, we assume the block runs once per week if it's in the list 
            // AND 'days' array is not empty.
            // However, the `schedules` list usually contains one entry per block pattern.
            // If a block repeats Mon/Wed, does it appear once or twice? 
            // Standard App Logic: One entry with days=['LUN','MIE']. 
            // So we must multiply duration by number of days!

            const duration = getDurationHours(s);
            const daysCount = Array.isArray(s.days) ? s.days.length : 0;
            return sum + (duration * daysCount);
        }, 0);

        // Target: 46 hours
        // We allow small float tolerance
        const diff = Math.abs(totalRealHours - 46);
        if (diff > 0.5) { // 30 min tolerance for floating point or minor adjustments
            reasons.push(`Carga Actual: ${totalRealHours.toFixed(2)}h / Meta: 46h`);
        }

    } else {
        // --- TP Validation ---
        // Rule: Academic Load (Real) must match Academic Meta (Target)

        // 1. Meta (Target): Only considers original COURSES (Non-Administrative)
        // Admin tasks (like manually added 'Asincrona') do NOT increase the target, they satisfy it.
        const metaSchedules = activeSchedules.filter(s => !s.isAdministrative && isAcademicMetaLoad(s));
        const metaHours = metaSchedules.reduce((sum, s) => sum + (s.weeklyHours || 0), 0);

        // 2. Real (Scheduled): Considers ALL Academic Load (Courses + Valid Admin Tasks)
        // This includes 'Asincrona', 'VAEE', etc.
        const realSchedules = activeSchedules.filter(s => isAcademicMetaLoad(s));
        const realHours = realSchedules.reduce((sum, s) => {
            const duration = getDurationHours(s);
            const daysCount = Array.isArray(s.days) ? s.days.length : 0;
            return sum + (duration * daysCount);
        }, 0);

        const diff = Math.abs(realHours - metaHours);
        if (diff > 0.1) {
            reasons.push(`Programado: ${realHours.toFixed(2)}h vs Requerido: ${metaHours.toFixed(2)}h`);
        }
    }

    return {
        isValid: reasons.length === 0,
        reasons
    };
};
