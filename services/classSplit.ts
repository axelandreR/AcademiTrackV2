import { ProcessedSchedule } from '../types';
import { timeToMinutes } from '../utils/timeUtils';
import { SCHEDULE_GRID_TIME_END } from '../constants';
import { isNonPhysicalRoom } from './businessRules';

const DAY_NAMES = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const MAX_END_MIN = SCHEDULE_GRID_TIME_END * 60;

export const minutesToTime = (min: number): string =>
    `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const atMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => { const r = atMidnight(d); r.setDate(r.getDate() + n); return r; };
const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

export interface BlockWeek {
    index: number;
    /** Primer y último día de la semana (lun-dom) recortados al rango del bloque. */
    start: Date;
    end: Date;
    label: string;
}

/** Semanas (lun-dom) del bloque en las que realmente ocurre alguna de sus sesiones. */
export const getBlockWeeks = (startDate: Date, endDate: Date, days: string[]): BlockWeek[] => {
    const start = atMidnight(startDate), end = atMidnight(endDate);
    const weeks: BlockWeek[] = [];
    const monday = new Date(start);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    for (let cursor = monday; cursor <= end; cursor = addDays(cursor, 7)) {
        const wStart = cursor < start ? start : cursor;
        const sunday = addDays(cursor, 6);
        const wEnd = sunday > end ? end : sunday;
        let hasSession = false;
        for (let d = new Date(wStart); d <= wEnd; d = addDays(d, 1)) {
            if (days.includes(DAY_NAMES[d.getDay()])) { hasSession = true; break; }
        }
        if (!hasSession) continue;
        weeks.push({ index: weeks.length, start: wStart, end: wEnd, label: `Semana ${weeks.length + 1} · ${fmt(wStart)} – ${fmt(wEnd)}` });
    }
    return weeks;
};

export interface SplitOptions {
    fromWeekIdx: number;
    toWeekIdx: number;
    part1End: string;
    part1Building?: string;
    part1Room?: string;
    part2Start: string;
    part2Building?: string;
    part2Room?: string;
    createRefrigerio: boolean;
}

export interface SplitPlan {
    errors: string[];
    warnings: string[];
    totalMin: number;
    part1Min: number;
    part2Min: number;
    part2End: string;
    gapMin: number;
    /** Filas que reemplazan a la original (tramo previo, partes 1 y 2, tramo posterior). */
    rows: ProcessedSchedule[];
    refrigerioRows: ProcessedSchedule[];
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Divide UN bloque de clase en dos partes (mismo NRC, mismos días e instructor) con horarios
 * y ambientes propios, conservando SIEMPRE los minutos totales y las horas semanales del
 * original: la parte 1 empieza donde empezaba el bloque y termina donde indiques; la parte 2
 * empieza donde indiques y su fin se calcula (inicio + minutos restantes). La división vale
 * entre las semanas elegidas; antes/después de ese rango el bloque queda como estaba.
 */
export const planClassSplit = (
    original: ProcessedSchedule,
    opts: SplitOptions,
    otherSchedules: ProcessedSchedule[] = [],
    ts: number = Date.now()
): SplitPlan => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const origStart = timeToMinutes(original.startTime);
    const origEnd = timeToMinutes(original.endTime);
    const totalMin = origEnd - origStart;
    const p1End = timeToMinutes(opts.part1End);
    const p2Start = timeToMinutes(opts.part2Start);
    const part1Min = p1End - origStart;
    const part2Min = totalMin - part1Min;
    const p2EndMin = p2Start + part2Min;
    const gapMin = p2Start - p1End;
    const weeks = getBlockWeeks(original.startDate, original.endDate, original.days);

    const empty: SplitPlan = { errors, warnings, totalMin, part1Min, part2Min, part2End: minutesToTime(Math.max(0, p2EndMin)), gapMin, rows: [], refrigerioRows: [] };

    if (totalMin <= 0) errors.push('El bloque original no tiene una duración válida.');
    if (!opts.part1End || !opts.part2Start) errors.push('Indica la hora de fin de la parte 1 y la hora de inicio de la parte 2.');
    if (errors.length) return empty;
    if (part1Min <= 0) errors.push('La parte 1 debe terminar después de la hora de inicio del bloque.');
    if (part1Min >= totalMin) errors.push('La parte 1 no puede ocupar todo el bloque: deja tiempo para la parte 2.');
    if (gapMin < 0) errors.push('La parte 2 no puede empezar antes de que termine la parte 1.');
    if (p2EndMin > MAX_END_MIN) errors.push(`La parte 2 terminaría a las ${minutesToTime(p2EndMin)}, después del límite de la grilla (${minutesToTime(MAX_END_MIN)}).`);
    const from = weeks[opts.fromWeekIdx], to = weeks[opts.toWeekIdx];
    if (!from || !to) errors.push('Elige las semanas a las que aplica la división.');
    else if (opts.fromWeekIdx > opts.toWeekIdx) errors.push('La semana de inicio no puede ser posterior a la de fin.');
    if (errors.length) return empty;

    const dateFrom = from.start, dateTo = to.end;
    const w1 = round4(original.weeklyHours * part1Min / totalMin);
    const w2 = round4(original.weeklyHours - w1);
    const rows: ProcessedSchedule[] = [];

    if (dateFrom > atMidnight(original.startDate)) {
        rows.push({ ...original, id: `split-pre-${ts}`, endDate: addDays(dateFrom, -1) });
    }
    rows.push({
        ...original, id: `split-a-${ts}`, startTime: original.startTime, endTime: opts.part1End,
        startDate: dateFrom, endDate: dateTo, weeklyHours: w1,
        building: opts.part1Building ?? original.building, room: opts.part1Room ?? original.room,
    });
    rows.push({
        ...original, id: `split-b-${ts}`, startTime: opts.part2Start, endTime: minutesToTime(p2EndMin),
        startDate: dateFrom, endDate: dateTo, weeklyHours: w2,
        building: opts.part2Building ?? original.building, room: opts.part2Room ?? original.room,
    });
    if (dateTo < atMidnight(original.endDate)) {
        rows.push({ ...original, id: `split-post-${ts}`, startDate: addDays(dateTo, 1) });
    }

    const refrigerioRows: ProcessedSchedule[] = [];
    if (opts.createRefrigerio && gapMin > 0) {
        original.days.forEach((day, i) => {
            refrigerioRows.push({
                id: `admin-split-${ts}-${i}`, courseCode: 'ADMIN', courseName: 'REFRIGERIO', activity: 'REFRIGERIO', meetingType: 'ADMIN', block: 'ADMIN',
                instructor: original.instructor, instructorId: original.instructorId || '', room: 'POR DEFINIR', building: 'CAMPUS',
                days: [day], startTime: opts.part1End, endTime: opts.part2Start, startDate: dateFrom, endDate: dateTo,
                career: original.career || 'GENERAL', nrc: '0000', color: 'bg-slate-100', weeklyHours: gapMin / 60, aforo: 0,
                periodo: original.periodo, semestre: 'N/A', category: 'refrigerio', isAdministrative: true, modality: '' as any,
            } as ProcessedSchedule);
        });
    }

    // Avisos (no bloquean: en simulación se pueden probar): cruces con otras tareas del instructor o del ambiente.
    const sameInstructor = (s: ProcessedSchedule) =>
        original.instructorId ? s.instructorId === original.instructorId : (!!original.instructor && s.instructor === original.instructor);
    const overlapDates = (s: ProcessedSchedule) => atMidnight(s.startDate) <= dateTo && atMidnight(s.endDate) >= dateFrom;
    const checks: { label: string; start: number; end: number; room?: { building: string; room: string }; isRef?: boolean }[] = [
        { label: `Parte 1 (${minutesToTime(origStart)}–${opts.part1End})`, start: origStart, end: p1End, room: { building: opts.part1Building ?? original.building, room: opts.part1Room ?? original.room } },
        { label: `Parte 2 (${opts.part2Start}–${minutesToTime(p2EndMin)})`, start: p2Start, end: p2EndMin, room: { building: opts.part2Building ?? original.building, room: opts.part2Room ?? original.room } },
    ];
    if (refrigerioRows.length) checks.push({ label: `Refrigerio (${opts.part1End}–${opts.part2Start})`, start: p1End, end: p2Start, isRef: true });

    const seen = new Set<string>();
    otherSchedules.forEach(s => {
        if (s.id === original.id || !overlapDates(s)) return;
        const sStart = timeToMinutes(s.startTime), sEnd = timeToMinutes(s.endTime);
        const sharedDays = s.days.filter(d => original.days.includes(d));
        if (sharedDays.length === 0) return;
        checks.forEach(c => {
            if (!(c.start < sEnd && c.end > sStart)) return;
            const key = (kind: string) => `${c.label}|${kind}|${s.id}`;
            if (sameInstructor(s) && !seen.has(key('i'))) {
                seen.add(key('i'));
                warnings.push(`${c.label} se cruza con ${s.courseName || s.activity || 'otra tarea'} del instructor (${s.startTime}–${s.endTime}, ${sharedDays.join('/')}).`);
            }
            if (c.room && !c.isRef && c.room.building && c.room.room && !isNonPhysicalRoom(c.room.building)
                && s.building === c.room.building && s.room === c.room.room && !sameInstructor(s) && !seen.has(key('r'))) {
                seen.add(key('r'));
                warnings.push(`${c.label} se cruza en ${c.room.building}-${c.room.room} con ${s.courseName || 'otra clase'} (NRC ${s.nrc}, ${s.startTime}–${s.endTime}).`);
            }
        });
    });

    return { errors, warnings: warnings.slice(0, 8), totalMin, part1Min, part2Min, part2End: minutesToTime(p2EndMin), gapMin, rows, refrigerioRows };
};
