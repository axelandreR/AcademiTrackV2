
import { ProcessedSchedule, HolidayData, ReconciliationResult, InstitutionalReference } from '../types';
import { timeToMinutes } from '../utils/timeUtils';
import { SEMESTER_END_DATE } from '../constants';

export interface Conflict {
    type: 'instructor' | 'room';
    target: string;
    weekLabel: string;
    day: string;
    taskA: ProcessedSchedule;
    taskB: ProcessedSchedule;
    overlapTime: string;
    actualDate: string;
}

export const detectConflicts = (
    schedules: ProcessedSchedule[],
    semesterRange: { start: Date; end: Date },
    holidaysMap: Record<string, HolidayData>
): Conflict[] => {
    const conflicts: Conflict[] = [];
    const instGroups = new Map<string, ProcessedSchedule[]>();
    const roomGroups = new Map<string, ProcessedSchedule[]>();

    schedules.forEach(s => {
        if (s.instructor && s.instructor !== 'Sin asignar') {
            if (!instGroups.has(s.instructor)) instGroups.set(s.instructor, []);
            instGroups.get(s.instructor)!.push(s);
        }
        if (s.room && s.room !== 'POR ASIGNAR') {
            // Administrative tasks do NOT generate room conflicts (no physical room)
            if (s.isAdministrative) return;

            const roomKey = `${s.building} - ${s.room}`;
            const upperKey = roomKey.toUpperCase();

            // Skip virtual, remote, or undefined spaces
            if (
                upperKey.includes('POR DEFINIR') ||
                upperKey.includes('POR ASIGNAR') ||
                upperKey.includes('REMOTO') ||
                upperKey.includes('VIRTUAL')
            ) {
                return;
            }

            if (!roomGroups.has(roomKey)) roomGroups.set(roomKey, []);
            roomGroups.get(roomKey)!.push(s);
        }
    });

    const findOverlap = (list: ProcessedSchedule[], type: 'instructor' | 'room', target: string) => {
        // Optimization: Map schedules to specific dates first to avoid iterating empty days
        const dateMap = new Map<string, ProcessedSchedule[]>();
        const dayNames = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

        list.forEach(s => {
            if (!s.days || !Array.isArray(s.days) || s.days.length === 0) return;

            // Limit to semester range
            const sStart = Math.max(s.startDate.getTime(), semesterRange.start.getTime());
            const sEnd = Math.min(s.endDate.getTime(), SEMESTER_END_DATE.getTime(), semesterRange.end.getTime());

            if (sStart > sEnd) return;

            // Iterate weeks for this schedule
            const current = new Date(sStart);
            // Align to start of schedule (if schedule starting mid-week, ensures we check correct days)
            // Actually, simply iterate from start date day-by-day until end date is safer and not too expensive for single schedule
            // But doing jumping by 7 days is faster if we know the 'days' array.

            // Better approach: Iterate from start date to end date
            // This is O(Days in Schedule). Max ~140 days per schedule.
            // If we have 50 schedules, total 7000 iterations.
            // Original was: 140 days * 50 filters * checking.

            // Let's iterate day by day.
            for (let d = new Date(sStart); d.getTime() <= sEnd; d.setDate(d.getDate() + 1)) {
                if (d > SEMESTER_END_DATE) continue;

                const dayName = dayNames[d.getDay()];
                if (s.days.includes(dayName)) {
                    // Use simple local Midnight timestamp as key to avoid TZ string parsing issues
                    const midnight = new Date(d);
                    midnight.setHours(0, 0, 0, 0);
                    const dateKey = midnight.getTime().toString();

                    if (!dateMap.has(dateKey)) dateMap.set(dateKey, []);
                    dateMap.get(dateKey)!.push(s);
                }
            }
        });

        // Now iterate only dates with >1 schedule
        for (const [dateKey, activeToday] of dateMap.entries()) {
            if (activeToday.length < 2) continue;

            if (conflicts.length >= 1000) break; // Safety break

            for (let i = 0; i < activeToday.length; i++) {
                for (let j = i + 1; j < activeToday.length; j++) {
                    const a = activeToday[i];
                    const b = activeToday[j];

                    if (a.id === b.id) continue;
                    const isSameTask = a.courseCode === b.courseCode && a.startTime === b.startTime && a.endTime === b.endTime;
                    if (isSameTask) continue;

                    const startA = timeToMinutes(a.startTime);
                    const endA = timeToMinutes(a.endTime);
                    const startB = timeToMinutes(b.startTime);
                    const endB = timeToMinutes(b.endTime);

                    // Overlap > 2 minutes
                    if (startA < (endB - 2) && startB < (endA - 2)) {
                        const overlapStart = Math.max(startA, startB);
                        const overlapEnd = Math.min(endA, endB);
                        const startStr = `${Math.floor(overlapStart / 60).toString().padStart(2, '0')}:${(overlapStart % 60).toString().padStart(2, '0')}`;
                        const endStr = `${Math.floor(overlapEnd / 60).toString().padStart(2, '0')}:${(overlapEnd % 60).toString().padStart(2, '0')}`;

                        // Reconstruct date from timestamp key
                        const currentDate = new Date(parseInt(dateKey));
                        // Safe local YYYY-MM-DD generation
                        const year = currentDate.getFullYear();
                        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                        const day = String(currentDate.getDate()).padStart(2, '0');
                        const dateStr = `${year}-${month}-${day}`;

                        // Check if already reported for this target/pair/day
                        const alreadyReported = conflicts.some(c =>
                            c.target === target &&
                            ((c.taskA.id === a.id && c.taskB.id === b.id) || (c.taskA.id === b.id && c.taskB.id === a.id)) &&
                            c.actualDate === dateStr
                        );

                        if (!alreadyReported) {
                            conflicts.push({
                                type,
                                target,
                                weekLabel: `${day} ${currentDate.toLocaleString('es-ES', { month: 'short' })}`,
                                day: dayNames[currentDate.getDay()],
                                taskA: a,
                                taskB: b,
                                overlapTime: `${startStr} - ${endStr}`,
                                actualDate: dateStr
                            });
                        }
                    }
                }
            }
        }
    };

    instGroups.forEach((list, instructor) => findOverlap(list, 'instructor', instructor));
    roomGroups.forEach((list, room) => findOverlap(list, 'room', room));
    return conflicts;
};
