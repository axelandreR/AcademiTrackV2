import { ProcessedSchedule } from '../types';

export type DeltaNrcStatus = 'new' | 'changed';

export interface DeltaNrcDiff {
    nrc: string;
    status: DeltaNrcStatus;
    courseCode: string;
    courseName: string;
    instructor: string;
    current: ProcessedSchedule[];
    incoming: ProcessedSchedule[];
}

export interface DeltaDiffResult {
    entries: DeltaNrcDiff[];
    unchangedCount: number;
    newCount: number;
    changedCount: number;
}

const normalize = (v?: string | null): string => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

// Firma de una sesión (bloque de días+hora+lugar+docente+curso) usada para comparar
// el contenido real de un NRC, no solo su presencia. Dos NRC son "iguales" si el
// conjunto de firmas de sus sesiones coincide, sin importar el orden de las filas.
const rowSignature = (s: ProcessedSchedule): string => {
    const days = [...(s.days || [])].map(normalize).sort().join(',');
    return [
        days,
        normalize(s.startTime),
        normalize(s.endTime),
        normalize(s.room),
        normalize(s.building),
        normalize(s.instructorId || s.instructor),
        normalize(s.courseCode),
        normalize(s.activity),
        normalize(s.meetingType),
        normalize(s.modality),
    ].join('|');
};

const groupByNrc = (rows: ProcessedSchedule[]): Map<string, ProcessedSchedule[]> => {
    const map = new Map<string, ProcessedSchedule[]>();
    rows.forEach(s => {
        if (!s.nrc || s.nrc === '-') return;
        const arr = map.get(s.nrc);
        if (arr) arr.push(s); else map.set(s.nrc, [s]);
    });
    return map;
};

/**
 * Compara los NRC vigentes en BD (para el/los periodo(s) del archivo) contra los que
 * trae el archivo entrante, y clasifica cada NRC del archivo como nuevo, cambiado o
 * sin cambios reales (mismas sesiones, solo reordenadas). Los NRC sin cambios no se
 * incluyen en `entries` para que el flujo de Delta pueda omitirlos por completo.
 */
export const computeDeltaDiff = (
    currentSchedules: ProcessedSchedule[],
    incomingSchedules: ProcessedSchedule[],
    periodosDelArchivo: string[]
): DeltaDiffResult => {
    const periodoSet = new Set(periodosDelArchivo.filter(Boolean));
    const relevantCurrent = periodoSet.size > 0
        ? currentSchedules.filter(s => periodoSet.has(s.periodo))
        : currentSchedules;

    const currentByNrc = groupByNrc(relevantCurrent);
    const incomingByNrc = groupByNrc(incomingSchedules);

    const entries: DeltaNrcDiff[] = [];
    let unchangedCount = 0;

    incomingByNrc.forEach((incomingRows, nrc) => {
        const currentRows = currentByNrc.get(nrc) || [];
        const first = incomingRows[0];
        const base = {
            nrc,
            courseCode: first.courseCode,
            courseName: first.courseName,
            instructor: first.instructor,
            current: currentRows,
            incoming: incomingRows,
        };

        if (currentRows.length === 0) {
            entries.push({ ...base, status: 'new' });
            return;
        }

        const currentSig = currentRows.map(rowSignature).sort().join('\n');
        const incomingSig = incomingRows.map(rowSignature).sort().join('\n');

        if (currentSig === incomingSig) {
            unchangedCount++;
        } else {
            entries.push({ ...base, status: 'changed' });
        }
    });

    entries.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'new' ? -1 : 1;
        return a.nrc.localeCompare(b.nrc);
    });

    return {
        entries,
        unchangedCount,
        newCount: entries.filter(e => e.status === 'new').length,
        changedCount: entries.filter(e => e.status === 'changed').length,
    };
};

export const formatRowSummary = (s: ProcessedSchedule): string => {
    const days = s.days && s.days.length > 0 ? s.days.map(d => d.slice(0, 2)).join('-') : 'S/D';
    const time = s.startTime && s.endTime ? `${s.startTime}-${s.endTime}` : '';
    const place = s.room ? (s.building ? `${s.room} (${s.building})` : s.room) : '';
    return [days, time, place, s.instructor].filter(Boolean).join(' · ');
};
