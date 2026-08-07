import { ProcessedSchedule } from '../types';
import { DAYS_OF_WEEK } from '../constants';

export interface ScheduleVariationSegment {
    startDate: Date;
    endDate: Date;
    days: string[]; // en el orden de DAYS_OF_WEEK
}

const DAY_ORDER = DAYS_OF_WEEK.map(d => d.key);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const sameDaySet = (a: Set<string>, b: Set<string>): boolean =>
    a.size === b.size && [...a].every(d => b.has(d));

/**
 * Detecta si el patrón semanal de días de clase de un instructor cambia en algún punto
 * del periodo (ej. las primeras semanas dicta Lunes/Miércoles/Jueves y luego pasa a
 * Martes/Jueves/Viernes) — NO es un historial de ediciones, se calcula a partir de los
 * rangos [startDate, endDate] que YA trae cada bloque del horario actual (algo común en
 * este sistema: un mismo NRC o bloque puede tener varios tramos con distintos días según
 * el sub-periodo). Solo considera cursos académicos (no tareas administrativas, que el
 * propio usuario agrega/mueve libremente y no representan "el horario oficial").
 *
 * Devuelve un segmento por cada tramo de fechas con un patrón de días distinto al
 * anterior; tramos consecutivos con el mismo patrón se fusionan en uno solo. Si todo el
 * periodo tiene un único patrón, devuelve un arreglo de 0 o 1 elemento (sin "variación").
 */
export const detectScheduleVariations = (
    instructorSchedules: ProcessedSchedule[],
    rangeStart: Date,
    rangeEnd: Date
): ScheduleVariationSegment[] => {
    const relevant = instructorSchedules.filter(s => !s.isAdministrative);
    if (relevant.length === 0) return [];

    const rangeStartAt = rangeStart.getTime();
    const rangeEndAt = rangeEnd.getTime();

    // Puntos de quiebre: el inicio y el (fin + 1 día) de cada bloque, recortados al rango.
    const boundarySet = new Set<number>([rangeStartAt]);
    relevant.forEach(s => {
        const start = Math.max(s.startDate.getTime(), rangeStartAt);
        const end = Math.min(s.endDate.getTime(), rangeEndAt);
        if (start > end) return;
        boundarySet.add(start);
        const afterEnd = end + ONE_DAY_MS;
        if (afterEnd <= rangeEndAt) boundarySet.add(afterEnd);
    });
    const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

    const rawSegments: { start: Date; end: Date; days: Set<string> }[] = [];
    for (let i = 0; i < boundaries.length; i++) {
        const segStartAt = boundaries[i];
        const segEndAt = i + 1 < boundaries.length ? boundaries[i + 1] - ONE_DAY_MS : rangeEndAt;
        if (segStartAt > segEndAt) continue;

        const daysSet = new Set<string>();
        relevant.forEach(s => {
            if (s.startDate.getTime() <= segEndAt && s.endDate.getTime() >= segStartAt) {
                s.days.forEach(d => daysSet.add(d));
            }
        });
        if (daysSet.size > 0) {
            rawSegments.push({ start: new Date(segStartAt), end: new Date(segEndAt), days: daysSet });
        }
    }

    // Fusiona tramos consecutivos (sin huecos) con exactamente el mismo set de días.
    const merged: ScheduleVariationSegment[] = [];
    for (const seg of rawSegments) {
        const last = merged[merged.length - 1];
        const lastDaySet = last ? new Set(last.days) : null;
        const isContiguous = last && (seg.start.getTime() - last.endDate.getTime()) <= ONE_DAY_MS;
        if (last && lastDaySet && isContiguous && sameDaySet(lastDaySet, seg.days)) {
            last.endDate = seg.end;
        } else {
            merged.push({
                startDate: seg.start,
                endDate: seg.end,
                days: DAY_ORDER.filter(d => seg.days.has(d)),
            });
        }
    }

    return merged;
};
