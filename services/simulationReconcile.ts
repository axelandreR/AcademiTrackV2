import { ProcessedSchedule } from '../types';
import { isFuzzyNameMatch } from './businessRules';

/**
 * Reconciliación "Aplicar cambios reales" ↔ horario real.
 *
 * Una fila de horario es solo un contenedor: lo que realmente existe son las SESIONES
 * (NRC + fecha + hora inicio/fin). En simulación un mismo bloque puede estar partido en
 * varias filas (cortes, divisiones, importaciones) mientras en la BD está en un solo
 * registro con las mismas fechas y horarios. Por eso aquí NUNCA se compara fila contra fila
 * ni por `id`: cada fila se expande a sus sesiones por fecha y se comparan esos conjuntos.
 */

const DAY_NAMES = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
// Tope de seguridad por fila (un periodo dura ~5 meses; esto evita bucles por fechas corruptas).
const MAX_SPAN_DAYS = 800;

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtShort = (key: string) => { const [, m, d] = key.split('-'); return `${d}/${m}`; };
const norm = (s?: string | null) => (s ?? '').toString().trim().toUpperCase();

export interface Occurrence { date: string; start: string; end: string; }

/** Sesiones reales (una por fecha en la que cae alguno de los días de la fila). */
export const expandOccurrences = (
    row: Pick<ProcessedSchedule, 'days' | 'startDate' | 'endDate' | 'startTime' | 'endTime'>
): Occurrence[] => {
    const s = new Date(row.startDate);
    const e = new Date(row.endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return [];
    const days = new Set(row.days || []);
    const out: Occurrence[] = [];
    const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const end = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    for (let i = 0; cur <= end && i < MAX_SPAN_DAYS; i++, cur.setDate(cur.getDate() + 1)) {
        if (days.has(DAY_NAMES[cur.getDay()])) out.push({ date: dateKey(cur), start: row.startTime, end: row.endTime });
    }
    return out;
};

const slotKey = (o: Occurrence) => `${o.date}|${o.start}|${o.end}`;

const isVacant = (r: ProcessedSchedule) =>
    !norm(r.instructorId) && (!norm(r.instructor) || norm(r.instructor) === 'SIN ASIGNAR');

const instKey = (r: ProcessedSchedule) => norm(r.instructorId) || norm(r.instructor);

/** Un NRC (clase) o una "tarea administrativa de un instructor" — lo que se compara entre sí. */
export const groupKey = (r: ProcessedSchedule): string => {
    if (r.isAdministrative) return `ADM|${instKey(r)}|${norm(r.category)}|${norm(r.activity || r.courseName)}`;
    if (norm(r.nrc)) return `NRC|${norm(r.nrc)}`;
    return `ROW|${r.id}`;
};

export const groupLabel = (r: ProcessedSchedule): string =>
    r.isAdministrative
        ? `${r.activity || r.courseName || 'Tarea'} (administrativa)`
        : `NRC ${r.nrc} · ${r.courseName || r.activity || ''}`.trim();

const sameInstructor = (a: ProcessedSchedule, b: ProcessedSchedule): boolean => {
    const ia = norm(a.instructorId), ib = norm(b.instructorId);
    if (ia && ib) return ia === ib;
    const na = norm(a.instructor), nb = norm(b.instructor);
    if (!na && !nb) return true;
    return !!na && !!nb && (na === nb || isFuzzyNameMatch(a.instructor, b.instructor));
};

const sameProgramming = (a: ProcessedSchedule, b: ProcessedSchedule): boolean =>
    sameInstructor(a, b)
    && norm(a.building) === norm(b.building)
    && norm(a.room) === norm(b.room)
    && norm(a.modality as string) === norm(b.modality as string);

/** Huella de una sesión SIN instructor (el instructor se valida aparte, con tolerancia a nombres truncados). */
const fingerprints = (rows: ProcessedSchedule[]): string[] => {
    const out: string[] = [];
    rows.forEach(r => expandOccurrences(r).forEach(o =>
        out.push(`${slotKey(o)}|${norm(r.building)}|${norm(r.room)}|${norm(r.modality as string)}|${r.tempHEActive ? 1 : 0}`)));
    return out.sort();
};

const sameMultiset = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

const countDiff = (from: string[], to: string[]) => {
    const m = new Map<string, number>();
    from.forEach(f => m.set(f, (m.get(f) || 0) + 1));
    let added = 0;
    to.forEach(t => { const c = m.get(t) || 0; if (c > 0) m.set(t, c - 1); else added++; });
    let removed = 0;
    m.forEach(c => { removed += c; });
    return { added, removed };
};

const summarize = (rows: ProcessedSchedule[]): string => {
    const dates = new Set<string>();
    rows.forEach(r => expandOccurrences(r).forEach(o => dates.add(o.date)));
    const sorted = [...dates].sort();
    const span = sorted.length ? ` (${fmtShort(sorted[0])}–${fmtShort(sorted[sorted.length - 1])})` : '';
    return `${rows.length} fila${rows.length === 1 ? '' : 's'} · ${sorted.length} fecha${sorted.length === 1 ? '' : 's'}${span}`;
};

export type ApplyGroupStatus = 'sin_cambios' | 'omitido' | 'nuevo' | 'reemplaza' | 'elimina' | 'conservado' | 'reasigna';

export interface ApplyGroupReport {
    key: string;
    label: string;
    admin: boolean;
    status: ApplyGroupStatus;
    detail: string;
}

export interface ApplyPlan {
    toDelete: string[];
    toUpsert: ProcessedSchedule[];
    groups: ApplyGroupReport[];
    /** Choques con OTRO instructor (rojo): requieren atención antes de confirmar. */
    conflicts: string[];
    /** Avisos que no bloquean (ámbar). */
    warnings: string[];
    /** Horario real del alcance, tal cual está en la BD ahora (para el respaldo automático). */
    scopeRealRows: ProcessedSchedule[];
    touchedKeys: string[];
    stats: { newRows: number; replacedGroups: number; deletedRows: number; skippedRows: number; unchangedGroups: number; protectedRows: number };
}

export interface PlanArgs {
    /** Horario real COMPLETO del periodo leído de la BD en este momento (clases + administrativas). */
    freshReal: ProcessedSchedule[];
    simRows: ProcessedSchedule[];
    /** ¿La fila real pertenece al alcance de la simulación (instructor filtrado)? */
    inScope: (r: ProcessedSchedule) => boolean;
    /** IDs reales que existían cuando se inició la simulación (si se conocen): lo agregado a la BD después se conserva. */
    baseRealIds?: Set<string> | null;
}

const groupBy = <T,>(rows: T[], keyOf: (r: T) => string) => {
    const m = new Map<string, T[]>();
    rows.forEach(r => { const k = keyOf(r); const l = m.get(k); if (l) l.push(r); else m.set(k, [r]); });
    return m;
};

export const planSimulationApply = ({ freshReal, simRows, inScope, baseRealIds }: PlanArgs): ApplyPlan => {
    const realById = new Map(freshReal.map(r => [r.id, r]));
    const simIds = new Set(simRows.map(r => r.id));
    const scopeReal = freshReal.filter(inScope);

    const deleteSet = new Set<string>();
    scopeReal.forEach(r => { if (!simIds.has(r.id)) deleteSet.add(r.id); });

    // Lo que se agregó a la BD después de iniciar la simulación y no tiene nada que ver con
    // ella (otro NRC) no se borra: la simulación no lo conoce, no lo "eliminó".
    const simKeys = new Set(simRows.map(groupKey));
    const protectedRows: ProcessedSchedule[] = [];
    if (baseRealIds) {
        [...deleteSet].forEach(id => {
            const r = realById.get(id)!;
            if (!baseRealIds.has(id) && !simKeys.has(groupKey(r))) { deleteSet.delete(id); protectedRows.push(r); }
        });
    }

    const dropIds = new Set<string>();
    const groups: ApplyGroupReport[] = [];
    const conflicts: string[] = [];
    const warnings: string[] = [];
    const touched = new Set<string>();
    const stats = { newRows: 0, replacedGroups: 0, deletedRows: 0, skippedRows: 0, unchangedGroups: 0, protectedRows: protectedRows.length };

    const simByKey = groupBy(simRows, groupKey);
    const realByKey = groupBy(freshReal, groupKey);
    const goneByKey = groupBy([...deleteSet].map(id => realById.get(id)!), groupKey);
    const allKeys = new Set<string>([...simByKey.keys(), ...goneByKey.keys()]);

    allKeys.forEach(key => {
        const simAll = simByKey.get(key) || [];
        const simNew = simAll.filter(r => !realById.has(r.id));
        const gone = goneByKey.get(key) || [];
        const sample = simAll[0] || gone[0];
        const label = groupLabel(sample);
        const admin = !!sample.isAdministrative;
        const report = (status: ApplyGroupStatus, detail: string) => groups.push({ key, label, admin, status, detail });

        // 1) Mismas sesiones por fecha (aunque estén partidas en otras filas) → no se toca el registro real.
        if (simNew.length > 0 && gone.length > 0) {
            const anchor = simNew[0];
            const sameWho = [...simNew, ...gone].every(r => sameInstructor(r, anchor));
            if (sameWho && sameMultiset(fingerprints(simNew), fingerprints(gone))) {
                simNew.forEach(r => dropIds.add(r.id));
                gone.forEach(r => deleteSet.delete(r.id));
                stats.unchangedGroups++; stats.skippedRows += simNew.length;
                report('sin_cambios', `La simulación (${summarize(simNew)}) equivale al registro real (${summarize(gone)}): mismas fechas, horarios y ambientes. Se conserva el real.`);
                return;
            }
        }

        // 2) Sesiones nuevas que ya existen en filas reales que sobreviven (por fecha, no por id).
        const survivors = (realByKey.get(key) || []).filter(r => !deleteSet.has(r.id));
        const slotIndex = new Map<string, ProcessedSchedule[]>();
        survivors.forEach(r => expandOccurrences(r).forEach(o => {
            const k = slotKey(o); const l = slotIndex.get(k);
            if (l) l.push(r); else slotIndex.set(k, [r]);
        }));

        const keptNew: ProcessedSchedule[] = [];
        const droppedNew: ProcessedSchedule[] = [];
        simNew.forEach(s => {
            if (s.tempHEActive) { keptNew.push(s); return; } // cobertura temporal: convive a propósito con la fila original
            const occ = expandOccurrences(s);
            const fullyCovered = occ.length > 0 && occ.every(o => slotIndex.has(slotKey(o)));
            const allEqual = fullyCovered && occ.every(o => (slotIndex.get(slotKey(o)) || []).some(c => sameProgramming(s, c)));
            if (allEqual) { dropIds.add(s.id); droppedNew.push(s); } else keptNew.push(s);
        });
        if (droppedNew.length) stats.skippedRows += droppedNew.length;

        // 3) Lo que se queda: choques con filas reales que sobreviven.
        const keptSimAll = simAll.filter(r => !dropIds.has(r.id));
        const keptSlots = new Set<string>();
        keptSimAll.forEach(r => expandOccurrences(r).forEach(o => keptSlots.add(slotKey(o))));
        const supersededVacant: ProcessedSchedule[] = [];

        keptNew.forEach(s => {
            if (s.tempHEActive) return;
            const overlapBy = new Map<string, { row: ProcessedSchedule; n: number }>();
            expandOccurrences(s).forEach(o => (slotIndex.get(slotKey(o)) || []).forEach(c => {
                if (c.id === s.id) return;
                const e = overlapBy.get(c.id); if (e) e.n++; else overlapBy.set(c.id, { row: c, n: 1 });
            }));
            overlapBy.forEach(({ row: c, n }) => {
                if (deleteSet.has(c.id) || dropIds.has(c.id)) return;
                if (!admin && isVacant(c) && !c.tempHEActive) {
                    const covered = expandOccurrences(c).every(o => keptSlots.has(slotKey(o)));
                    if (covered) { deleteSet.add(c.id); supersededVacant.push(c); return; }
                    warnings.push(`${label}: la fila "Sin asignar" (${c.id}) coincide en ${n} fecha${n === 1 ? '' : 's'} con lo que se migra y tiene fechas fuera de la simulación; no se tocó, revísala en Registro Base.`);
                    return;
                }
                if (!admin && !sameInstructor(s, c)) {
                    conflicts.push(`${label}: ${n} fecha${n === 1 ? '' : 's'} ya están asignadas a ${c.instructor || 'otro instructor'} (${c.startTime}–${c.endTime}, ${c.days.join('/')}). Se agregaría un segundo registro en el mismo horario.`);
                    return;
                }
                warnings.push(`${label}: ${n} fecha${n === 1 ? '' : 's'} se solapan con un registro que ya existe (${c.id}, ${c.startTime}–${c.endTime}); quedarían encimadas.`);
            });
        });

        // 4) Duplicados dentro de la propia simulación (misma sesión en dos filas).
        const seen = new Map<string, number>();
        keptSimAll.filter(r => !r.tempHEActive).forEach(r => expandOccurrences(r).forEach(o => seen.set(slotKey(o), (seen.get(slotKey(o)) || 0) + 1)));
        const dupInSim = [...seen.values()].filter(c => c > 1).length;
        if (dupInSim > 0) warnings.push(`${label}: ${dupInSim} fecha${dupInSim === 1 ? '' : 's'} aparecen repetidas dentro de la simulación (dos filas para la misma sesión).`);

        // Reporte del grupo
        const goneNow = [...gone.filter(r => deleteSet.has(r.id)), ...supersededVacant];
        const vacantNote = supersededVacant.length
            ? ` La fila "Sin asignar" del mismo NRC (${summarize(supersededVacant)}) queda reemplazada por la del instructor.`
            : '';
        const skippedNote = droppedNew.length ? ` (${droppedNew.length} fila(s) ya existían y se omiten.)` : '';
        if (keptNew.length === 0 && droppedNew.length > 0) {
            report('omitido', `Ya existe en el horario real (${summarize(survivors)}): ${droppedNew.length} fila${droppedNew.length === 1 ? '' : 's'} de la simulación no se migran para no duplicar.`);
        } else if (keptNew.length > 0 && goneNow.length > 0) {
            const d = countDiff(fingerprints(goneNow), fingerprints(keptNew));
            stats.replacedGroups++; stats.newRows += keptNew.length;
            touched.add(key);
            report(supersededVacant.length && gone.length === 0 ? 'reasigna' : 'reemplaza',
                `Real: ${summarize(goneNow)} → Simulación: ${summarize(keptNew)}. Fechas nuevas: ${d.added}, fechas que dejan de existir: ${d.removed}.${skippedNote}${vacantNote}`);
        } else if (keptNew.length > 0) {
            stats.newRows += keptNew.length;
            touched.add(key);
            report('nuevo', `Se agrega: ${summarize(keptNew)}.${skippedNote}`);
        } else if (goneNow.length > 0) {
            touched.add(key);
            report('elimina', simAll.length === 0
                ? `Se elimina del horario real: ${summarize(goneNow)}. No está en la simulación.`
                : `Se eliminan ${goneNow.length} fila(s) reales de este NRC que ya no están en la simulación (${summarize(goneNow)}).`);
        }
    });

    protectedRows.forEach(r => {
        groups.push({ key: groupKey(r), label: groupLabel(r), admin: !!r.isAdministrative, status: 'conservado',
            detail: `Se agregó a la BD después de iniciar la simulación (${summarize([r])}); no estaba en ella y se conserva.` });
    });

    stats.deletedRows = deleteSet.size;
    return {
        toDelete: [...deleteSet],
        toUpsert: simRows.filter(r => !dropIds.has(r.id)),
        groups, conflicts, warnings,
        scopeRealRows: scopeReal,
        touchedKeys: [...touched],
        stats,
    };
};

export interface DuplicateGroup {
    key: string;
    label: string;
    admin: boolean;
    nrc: string;
    duplicatedSessions: number;
    sampleDates: string[];
    rows: { id: string; instructor: string; days: string[]; startTime: string; endTime: string; startDate: Date; endDate: Date; building: string; room: string }[];
}

/**
 * Sesiones (NRC + fecha + horario) que aparecen en más de una fila: lo que en pantalla se ve
 * como cursos "uno encima de otro". Solo lectura; no decide cuál es la correcta.
 */
export const findDuplicateOccurrences = (rows: ProcessedSchedule[], onlyKeys?: Set<string>): DuplicateGroup[] => {
    const out: DuplicateGroup[] = [];
    groupBy(rows.filter(r => !r.tempHEActive), groupKey).forEach((list, key) => {
        if (list.length < 2 || key.startsWith('ROW|')) return;
        if (onlyKeys && !onlyKeys.has(key)) return;
        const bySlot = new Map<string, Set<string>>();
        list.forEach(r => expandOccurrences(r).forEach(o => {
            const k = slotKey(o); const s = bySlot.get(k);
            if (s) s.add(r.id); else bySlot.set(k, new Set([r.id]));
        }));
        const dupSlots = [...bySlot.entries()].filter(([, ids]) => ids.size > 1);
        if (dupSlots.length === 0) return;
        const involved = new Set<string>();
        dupSlots.forEach(([, ids]) => ids.forEach(id => involved.add(id)));
        const sample = list[0];
        out.push({
            key, label: groupLabel(sample), admin: !!sample.isAdministrative, nrc: sample.nrc || '',
            duplicatedSessions: dupSlots.length,
            sampleDates: dupSlots.map(([k]) => k.split('|')[0]).sort().slice(0, 4),
            rows: list.filter(r => involved.has(r.id)).map(r => ({
                id: r.id, instructor: r.instructor || '', days: r.days, startTime: r.startTime, endTime: r.endTime,
                startDate: r.startDate, endDate: r.endDate, building: r.building || '', room: r.room || '',
            })),
        });
    });
    return out.sort((a, b) => b.duplicatedSessions - a.duplicatedSessions);
};
