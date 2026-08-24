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
    totalHours: number;
    dailyLimit: number;
    // Solo TC: para TP el Refrigerio no es obligatorio, nunca se marca como faltante.
    missingRefrigerio: boolean;
    // TC: el día tiene tareas pero no llega a la meta diaria (9.2h).
    belowTarget: boolean;
    // TC y TP: el día supera el límite diario (9.2h / 7.0h).
    overTarget: boolean;
}

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

/**
 * Calcula el "span" de jornada de un día (hora más temprana -> hora más tardía entre
 * todos los bloques, clases y tareas administrativas), partido en mañana/tarde por el
 * bloque de Refrigerio si existe. A diferencia del motor de auditoría (que suma la
 * duración de cada bloque), esto refleja el tiempo real de presencia del docente ese
 * día, incluyendo huecos entre bloques dentro de un mismo turno.
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
            morning: EMPTY_SHIFT, afternoon: EMPTY_SHIFT,
            totalHours: 0, dailyLimit, missingRefrigerio: false, belowTarget: false, overTarget: false,
        };
    }

    const sorted = [...dayTasks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    const refrigerio = sorted.find(s => s.category === 'refrigerio');

    const journeyStart = Math.min(...sorted.map(s => timeToMinutes(s.startTime)));
    const journeyEnd = Math.max(...sorted.map(s => timeToMinutes(s.endTime)));

    let morning: ShiftSummary;
    let afternoon: ShiftSummary;

    if (refrigerio) {
        const breakStart = timeToMinutes(refrigerio.startTime);
        const breakEnd = timeToMinutes(refrigerio.endTime);
        morning = { start: minutesToTime(journeyStart), end: minutesToTime(breakStart), hours: Math.max(0, (breakStart - journeyStart) / 60) };
        afternoon = { start: minutesToTime(breakEnd), end: minutesToTime(journeyEnd), hours: Math.max(0, (journeyEnd - breakEnd) / 60) };
    } else {
        morning = { start: minutesToTime(journeyStart), end: minutesToTime(journeyEnd), hours: (journeyEnd - journeyStart) / 60 };
        afternoon = EMPTY_SHIFT;
    }

    const totalHours = morning.hours + afternoon.hours;

    return {
        hasTasks: true,
        hasRefrigerio: !!refrigerio,
        morning,
        afternoon,
        totalHours,
        dailyLimit,
        // Solo aplica a TC: los TP suelen tener jornadas cortas y no están obligados a
        // registrar Refrigerio, así que no debe marcarse como pendiente para ellos.
        missingRefrigerio: instructorType === 'TC' && !refrigerio,
        belowTarget: instructorType === 'TC' && totalHours < dailyLimit - 0.01,
        overTarget: totalHours > dailyLimit + 0.01,
    };
};
