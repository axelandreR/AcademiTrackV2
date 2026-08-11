import { ProcessedSchedule, RoomData, HolidayData } from '../types';
import { TIME_START, TIME_END, OCCUPANCY_TURNOS, DAYS_OF_WEEK } from '../constants';

export type FrequencyKey = 'weekday' | 'weekend' | 'general';
export type TurnoBucketKey = 'manana' | 'tarde' | 'noche' | 'allday';

export interface OccupancyCell {
    usedHours: number;
    availableHours: number;
    occupancyPct: number; // 0-100 normalmente; puede superar 100 si hay doble reserva.
}

export interface DayTypeWindow {
    start: string; // "HH:MM"
    end: string;   // "HH:MM"
}

export interface OccupancyAvailability {
    weekday: DayTypeWindow;
    saturday: DayTypeWindow;
    sunday: DayTypeWindow;
}

// Antes la disponibilidad era fija 07:00-22:00 igual todos los días (incluyendo sábado y
// domingo juntos). Este es el default mientras el usuario no configure nada distinto en
// app_settings — domingo por defecto corta a la 1pm, que es lo habitual.
export const DEFAULT_OCCUPANCY_AVAILABILITY: OccupancyAvailability = {
    weekday: { start: '07:00', end: '22:00' },
    saturday: { start: '07:00', end: '22:00' },
    sunday: { start: '07:00', end: '13:00' },
};

export interface RoomOccupancySummary {
    roomKey: string;
    room: string;
    building: string;
    type: string;
    career: string;
    capacity: number;
    matrix: Record<FrequencyKey, Record<TurnoBucketKey, OccupancyCell>>;
    byWeekday: Record<string, OccupancyCell>; // LUNES..DOMINGO
    overallPct: number; // matrix.general.allday.occupancyPct, para ordenar/rankear
    hasOverbooking: boolean; // alguna celda > 100% -> probable doble reserva, no "mucho uso"
}

const WEEKDAY_KEYS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
const WEEKEND_KEYS = ['SABADO', 'DOMINGO'];

const DAY_TO_JS_DOW: Record<string, number> = {
    DOMINGO: 0, LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6,
};

const toMinutes = (t: string): number => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};

const overlapMinutes = (aStart: number, aEnd: number, bStart: number, bEnd: number): number =>
    Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

/**
 * Horas disponibles en UN día del tipo dado (ventana de disponibilidad configurada),
 * dentro de un turno específico o del día completo (turno = undefined).
 */
const perDayAvailableHours = (window: DayTypeWindow, turno?: { startHour: number; endHour: number }): number => {
    const winStart = toMinutes(window.start);
    const winEnd = toMinutes(window.end);
    if (winEnd <= winStart) return 0; // aula no disponible ese tipo de día
    if (!turno) return (winEnd - winStart) / 60;
    return overlapMinutes(winStart, winEnd, turno.startHour * 60, turno.endHour * 60) / 60;
};

/**
 * Cuántas veces cae exactamente ese día de la semana dentro de [rangeStart, rangeEnd],
 * restando feriados que caigan justo en ese día — sin iterar día por día (aritmética
 * directa), para que sea barato repetirlo por cada bloque de cada aula.
 */
export const countWeekdayOccurrences = (
    dayKey: string,
    rangeStart: Date,
    rangeEnd: Date,
    holidays: HolidayData[]
): number => {
    const targetDow = DAY_TO_JS_DOW[dayKey];
    if (targetDow === undefined) return 0;

    const start = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    const end = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
    if (start > end) return 0;

    const offset = (targetDow - start.getDay() + 7) % 7;
    const firstOccurrence = new Date(start);
    firstOccurrence.setDate(start.getDate() + offset);
    if (firstOccurrence > end) return 0;

    const diffDays = Math.floor((end.getTime() - firstOccurrence.getTime()) / 86400000);
    const totalOccurrences = Math.floor(diffDays / 7) + 1;

    let holidayHits = 0;
    for (const h of holidays) {
        const hd = new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate());
        if (hd.getTime() >= firstOccurrence.getTime() && hd.getTime() <= end.getTime() && hd.getDay() === targetDow) {
            holidayHits++;
        }
    }
    return Math.max(0, totalOccurrences - holidayHits);
};

/**
 * Reparte la duración de un bloque [startTime, endTime) entre los turnos de
 * OCCUPANCY_TURNOS que toca (ej. 12:30-14:00 cae parte en Mañana y parte en Tarde).
 * Recorta a la ventana operativa [TIME_START, TIME_END] por si algún dato viene fuera.
 */
export const splitBlockByTurno = (startTime: string, endTime: string): Record<'manana' | 'tarde' | 'noche', number> => {
    const result = { manana: 0, tarde: 0, noche: 0 };
    const startMin = Math.max(toMinutes(startTime), TIME_START * 60);
    const endMin = Math.min(toMinutes(endTime), TIME_END * 60);
    if (startMin >= endMin) return result;

    OCCUPANCY_TURNOS.forEach(turno => {
        const tStart = turno.startHour * 60;
        const tEnd = turno.endHour * 60;
        const overlapStart = Math.max(startMin, tStart);
        const overlapEnd = Math.min(endMin, tEnd);
        if (overlapEnd > overlapStart) {
            result[turno.key] += (overlapEnd - overlapStart) / 60;
        }
    });
    return result;
};

const emptyCell = (): OccupancyCell => ({ usedHours: 0, availableHours: 0, occupancyPct: 0 });

const emptyMatrix = (): Record<FrequencyKey, Record<TurnoBucketKey, OccupancyCell>> => ({
    weekday: { manana: emptyCell(), tarde: emptyCell(), noche: emptyCell(), allday: emptyCell() },
    weekend: { manana: emptyCell(), tarde: emptyCell(), noche: emptyCell(), allday: emptyCell() },
    general: { manana: emptyCell(), tarde: emptyCell(), noche: emptyCell(), allday: emptyCell() },
});

/** Agrupa horarios presenciales (no administrativos) por aula, una sola pasada. */
const buildRoomScheduleIndex = (schedules: ProcessedSchedule[]): Map<string, ProcessedSchedule[]> => {
    const idx = new Map<string, ProcessedSchedule[]>();
    schedules.forEach(s => {
        if (s.isAdministrative || s.modality !== 'presencial') return;
        const key = `${s.building} - ${s.room}`;
        if (!idx.has(key)) idx.set(key, []);
        idx.get(key)!.push(s);
    });
    return idx;
};

const finalizeCell = (cell: OccupancyCell) => {
    if (cell.availableHours > 0) {
        cell.occupancyPct = (cell.usedHours / cell.availableHours) * 100;
    } else {
        // Sin disponibilidad configurada ese tramo (ej. aula marcada como no disponible
        // los fines de semana) pero con uso real registrado -> señal clara de conflicto,
        // no un simple "0%".
        cell.occupancyPct = cell.usedHours > 0 ? 999 : 0;
    }
};

/**
 * Ocupabilidad de una sola aula sobre [semesterStart, semesterEnd], considerando solo
 * sesiones presenciales reales (excluye asíncronas/virtuales y tareas administrativas,
 * que muchas veces ni siquiera tienen un aula real asignada) y descontando feriados de
 * las horas disponibles. dayOccurrences/availableByFreqTurno se calculan UNA vez para
 * todo el semestre (son iguales para todas las aulas) y se reciben ya listos.
 */
const calculateSingleRoomOccupancy = (
    room: RoomData,
    roomSchedules: ProcessedSchedule[],
    semesterStart: Date,
    semesterEnd: Date,
    holidays: HolidayData[],
    dayOccurrences: Record<string, number>,
    availableTemplate: Record<FrequencyKey, Record<TurnoBucketKey, OccupancyCell>>,
    availability: OccupancyAvailability
): RoomOccupancySummary => {
    const matrix = emptyMatrix();
    (Object.keys(matrix) as FrequencyKey[]).forEach(freq => {
        (Object.keys(matrix[freq]) as TurnoBucketKey[]).forEach(turno => {
            matrix[freq][turno].availableHours = availableTemplate[freq][turno].availableHours;
        });
    });

    const byWeekday: Record<string, OccupancyCell> = {};
    DAYS_OF_WEEK.forEach(d => {
        const window = WEEKDAY_KEYS.includes(d.key) ? availability.weekday : d.key === 'SABADO' ? availability.saturday : availability.sunday;
        byWeekday[d.key] = { usedHours: 0, availableHours: dayOccurrences[d.key] * perDayAvailableHours(window), occupancyPct: 0 };
    });

    roomSchedules.forEach(block => {
        const effectiveStart = block.startDate > semesterStart ? block.startDate : semesterStart;
        const effectiveEnd = block.endDate < semesterEnd ? block.endDate : semesterEnd;
        if (effectiveStart > effectiveEnd) return;

        const turnoHoursOnce = splitBlockByTurno(block.startTime, block.endTime);
        const totalHoursOnce = turnoHoursOnce.manana + turnoHoursOnce.tarde + turnoHoursOnce.noche;
        if (totalHoursOnce <= 0) return;

        block.days.forEach(dayKey => {
            const occurrences = countWeekdayOccurrences(dayKey, effectiveStart, effectiveEnd, holidays);
            if (occurrences <= 0) return;

            const freqBucket: FrequencyKey = WEEKDAY_KEYS.includes(dayKey) ? 'weekday' : WEEKEND_KEYS.includes(dayKey) ? 'weekend' : null as any;
            if (!freqBucket) return;

            (['manana', 'tarde', 'noche'] as const).forEach(turno => {
                const hrs = turnoHoursOnce[turno] * occurrences;
                if (hrs <= 0) return;
                matrix[freqBucket][turno].usedHours += hrs;
                matrix.general[turno].usedHours += hrs;
            });
            const alldayHrs = totalHoursOnce * occurrences;
            matrix[freqBucket].allday.usedHours += alldayHrs;
            matrix.general.allday.usedHours += alldayHrs;

            if (byWeekday[dayKey]) byWeekday[dayKey].usedHours += alldayHrs;
        });
    });

    (Object.keys(matrix) as FrequencyKey[]).forEach(freq => {
        (Object.keys(matrix[freq]) as TurnoBucketKey[]).forEach(turno => finalizeCell(matrix[freq][turno]));
    });
    DAYS_OF_WEEK.forEach(d => finalizeCell(byWeekday[d.key]));

    const overallPct = matrix.general.allday.occupancyPct;
    const hasOverbooking = [
        ...Object.values(matrix.weekday), ...Object.values(matrix.weekend), ...Object.values(matrix.general),
    ].some(c => c.occupancyPct > 100.01);

    return {
        roomKey: `${room.building} - ${room.room}`,
        room: room.room,
        building: room.building,
        type: room.type,
        career: room.career,
        capacity: room.capacity,
        matrix,
        byWeekday,
        overallPct,
        hasOverbooking,
    };
};

/** Calcula la ocupabilidad de todas las aulas del catálogo sobre el rango dado. */
export const calculateAllRoomsOccupancy = (
    rooms: RoomData[],
    schedules: ProcessedSchedule[],
    holidays: HolidayData[],
    semesterStart: Date,
    semesterEnd: Date,
    availability: OccupancyAvailability = DEFAULT_OCCUPANCY_AVAILABILITY
): RoomOccupancySummary[] => {
    const dayOccurrences: Record<string, number> = {};
    DAYS_OF_WEEK.forEach(d => {
        dayOccurrences[d.key] = countWeekdayOccurrences(d.key, semesterStart, semesterEnd, holidays);
    });

    const weekdayDays = WEEKDAY_KEYS.reduce((sum, k) => sum + dayOccurrences[k], 0);
    const saturdayDays = dayOccurrences['SABADO'] || 0;
    const sundayDays = dayOccurrences['DOMINGO'] || 0;

    // "weekend" (para la matriz de reporte) sigue combinando Sábado+Domingo, pero ahora
    // cada uno puede tener su propia ventana de disponibilidad (domingo suele cortar antes
    // que sábado) — se suman por separado, no se puede usar un solo "horas por día".
    const availableTemplate = emptyMatrix();
    OCCUPANCY_TURNOS.forEach(turno => {
        const wdHoursPerDay = perDayAvailableHours(availability.weekday, turno);
        const saHoursPerDay = perDayAvailableHours(availability.saturday, turno);
        const suHoursPerDay = perDayAvailableHours(availability.sunday, turno);
        availableTemplate.weekday[turno.key].availableHours = weekdayDays * wdHoursPerDay;
        availableTemplate.weekend[turno.key].availableHours = saturdayDays * saHoursPerDay + sundayDays * suHoursPerDay;
        availableTemplate.general[turno.key].availableHours = weekdayDays * wdHoursPerDay + saturdayDays * saHoursPerDay + sundayDays * suHoursPerDay;
    });
    const wdAllday = perDayAvailableHours(availability.weekday);
    const saAllday = perDayAvailableHours(availability.saturday);
    const suAllday = perDayAvailableHours(availability.sunday);
    availableTemplate.weekday.allday.availableHours = weekdayDays * wdAllday;
    availableTemplate.weekend.allday.availableHours = saturdayDays * saAllday + sundayDays * suAllday;
    availableTemplate.general.allday.availableHours = weekdayDays * wdAllday + saturdayDays * saAllday + sundayDays * suAllday;

    const index = buildRoomScheduleIndex(schedules);

    return rooms.map(room => {
        const roomKey = `${room.building} - ${room.room}`;
        const roomSchedules = index.get(roomKey) || [];
        return calculateSingleRoomOccupancy(room, roomSchedules, semesterStart, semesterEnd, holidays, dayOccurrences, availableTemplate, availability);
    });
};
