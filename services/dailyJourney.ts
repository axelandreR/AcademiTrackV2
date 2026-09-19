import { ProcessedSchedule } from '../types';
import { LOAD_LIMITS } from '../constants';

export interface ShiftSummary {
    start: string | null;
    end: string | null;
    hours: number;
}

export interface DailyJourneySummary {
    hasTasks: boolean;
    hasRefrigerio: boolean;
    morning: ShiftSummary;
    afternoon: ShiftSummary;
    // Todos los turnos del día, en orden. Con Refrigerio son [mañana, tarde]; sin Refrigerio
    // se parte por huecos largos (ver SPLIT_SHIFT_MIN_GAP_MINUTES). morning/afternoon son
    // solo los dos primeros, para las pantallas que solo muestran dos columnas.
    shifts: ShiftSummary[];
    // Turno partido sin Refrigerio: hay 2+ turnos separados por un hueco largo.
    hasSplitShift: boolean;
    totalHours: number;
    dailyLimit: number;
    // Solo TC: para TP el Refrigerio no es obligatorio, nunca se marca como faltante.
    missingRefrigerio: boolean;
    // TC: el día tiene tareas pero no llega a la meta diaria (9.2h).
    belowTarget: boolean;
    // TC y TP: el día supera el límite diario (9.2h / 7.0h).
    overTarget: boolean;
}

// Hueco mínimo entre dos bloques para considerarlos turnos distintos (entrada/salida
// propias) en vez de un solo turno con un hueco dentro. Huecos menores (1 minuto de
// desfase, un descanso corto) NO parten el turno: siguen sumando a la jornada y se
// reportan como incongruencia (ver getDayIncongruence) para que se corrijan en el horario.
export const SPLIT_SHIFT_MIN_GAP_MINUTES = 60;

const timeToMinutes = (t: string): number => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};

const minutesToTime = (min: number): string => {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const EMPTY_SHIFT: ShiftSummary = { start: null, end: null, hours: 0 };

const shiftFromRange = (startMin: number, endMin: number): ShiftSummary => ({
    start: minutesToTime(startMin),
    end: minutesToTime(endMin),
    hours: Math.max(0, (endMin - startMin) / 60),
});

/**
 * Calcula la jornada de un día (hora más temprana -> hora más tardía de cada turno entre
 * todos los bloques, clases y tareas administrativas). Con Refrigerio, el bloque parte el
 * día en mañana/tarde. Sin Refrigerio, un hueco de SPLIT_SHIFT_MIN_GAP_MINUTES o más entre
 * bloques parte el día en turnos separados (turno partido: el docente sale y vuelve), y
 * cada turno cuenta por separado — no de punta a punta. Huecos menores siguen contando
 * dentro del turno y se reportan como incongruencia (ver getDayIncongruence).
 *
 * A diferencia del motor de auditoría (que suma la duración de cada bloque), esto refleja
 * el tiempo real de presencia del docente ese día, incluyendo huecos cortos entre bloques
 * dentro de un mismo turno.
 *
 * NOTA: se evaluó cambiar esto a "suma de duración por bloque" (igual criterio que
 * calculateWeeklyAudit) para que coincida siempre con "Real" del pie de auditoría, pero
 * se revirtió — eso oculta cualquier hueco real en vez de encontrar su causa. Si
 * "Jornada Diaria"/Fichas de Asistencia no coincide con "Real", el hueco debe
 * localizarse y corregirse en los datos del horario, no en esta fórmula.
 */
export const computeDailyJourney = (
    dayTasks: ProcessedSchedule[],
    instructorType: 'TC' | 'TP'
): DailyJourneySummary => {
    const dailyLimit = instructorType === 'TC' ? LOAD_LIMITS.DAILY_TC : LOAD_LIMITS.DAILY_TP;

    if (dayTasks.length === 0) {
        return {
            hasTasks: false, hasRefrigerio: false,
            morning: EMPTY_SHIFT, afternoon: EMPTY_SHIFT, shifts: [], hasSplitShift: false,
            totalHours: 0, dailyLimit, missingRefrigerio: false, belowTarget: false, overTarget: false,
        };
    }

    const sorted = [...dayTasks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    const refrigerio = sorted.find(s => s.category === 'refrigerio');

    const journeyStart = Math.min(...sorted.map(s => timeToMinutes(s.startTime)));
    const journeyEnd = Math.max(...sorted.map(s => timeToMinutes(s.endTime)));

    let morning: ShiftSummary;
    let afternoon: ShiftSummary;
    let shifts: ShiftSummary[];

    if (refrigerio) {
        const breakStart = timeToMinutes(refrigerio.startTime);
        const breakEnd = timeToMinutes(refrigerio.endTime);
        morning = { start: minutesToTime(journeyStart), end: minutesToTime(breakStart), hours: Math.max(0, (breakStart - journeyStart) / 60) };
        afternoon = { start: minutesToTime(breakEnd), end: minutesToTime(journeyEnd), hours: Math.max(0, (journeyEnd - breakEnd) / 60) };
        shifts = [morning, afternoon].filter(s => s.hours > 0);
    } else {
        // Turnos por huecos largos: se recorre en orden de inicio y se abre un turno nuevo
        // cuando el siguiente bloque empieza SPLIT_SHIFT_MIN_GAP_MINUTES o más después de
        // que terminó todo lo anterior (un bloque que se solapa o queda pegado sigue el turno).
        const ranges: { start: number; end: number }[] = [];
        sorted.forEach(s => {
            const start = timeToMinutes(s.startTime);
            const end = timeToMinutes(s.endTime);
            const last = ranges[ranges.length - 1];
            if (last && start - last.end < SPLIT_SHIFT_MIN_GAP_MINUTES) {
                last.end = Math.max(last.end, end);
            } else {
                ranges.push({ start, end });
            }
        });
        shifts = ranges.map(r => shiftFromRange(r.start, r.end));
        morning = shifts[0] ?? EMPTY_SHIFT;
        afternoon = shifts[1] ?? EMPTY_SHIFT;
    }

    const totalHours = shifts.reduce((sum, s) => sum + s.hours, 0);

    return {
        hasTasks: true,
        hasRefrigerio: !!refrigerio,
        morning,
        afternoon,
        shifts,
        hasSplitShift: !refrigerio && shifts.length > 1,
        totalHours,
        dailyLimit,
        // Solo aplica a TC: los TP suelen tener jornadas cortas y no están obligados a
        // registrar Refrigerio, así que no debe marcarse como pendiente para ellos.
        missingRefrigerio: instructorType === 'TC' && !refrigerio,
        belowTarget: instructorType === 'TC' && totalHours < dailyLimit - 0.01,
        overTarget: totalHours > dailyLimit + 0.01,
    };
};

export interface DayIncongruence {
    journeyMin: number;
    blocksMin: number;
    // Jornada menos suma de bloques: >0 hay hueco dentro de un turno (la jornada/ficha
    // cuenta minutos que ningún bloque respalda); <0 hay bloques solapados.
    diffMin: number;
}

/**
 * Compara la jornada de un día (presencia por turnos, ver computeDailyJourney) contra la
 * suma de la duración de sus bloques (lo que cuenta la auditoría). Devuelve null si
 * coinciden al minuto — cualquier diferencia, incluso de 1 minuto, es incongruencia: la
 * ficha de asistencia se arma con las horas de entrada/salida, así que un minuto de más
 * en la jornada ya excede lo que dice la auditoría.
 */
export const getDayIncongruence = (dayTasks: ProcessedSchedule[], instructorType: 'TC' | 'TP'): DayIncongruence | null => {
    if (dayTasks.length === 0) return null;
    const journey = computeDailyJourney(dayTasks, instructorType);
    const journeyMin = Math.round(journey.totalHours * 60);
    const blocksMin = dayTasks
        .filter(s => s.category !== 'refrigerio')
        .reduce((sum, s) => sum + (timeToMinutes(s.endTime) - timeToMinutes(s.startTime)), 0);
    const diffMin = journeyMin - blocksMin;
    return diffMin === 0 ? null : { journeyMin, blocksMin, diffMin };
};
