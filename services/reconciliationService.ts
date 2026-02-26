
import { ProcessedSchedule, InstitutionalReference, ReconciliationResult } from '../types';
import { timeToMinutes } from '../utils/timeUtils';

export const reconcileSchedules = (
    schedules: ProcessedSchedule[],
    institutionalReferences: InstitutionalReference[]
): ReconciliationResult[] => {
    if (institutionalReferences.length === 0) return [];

    const academicSchedules = schedules.filter(s => !s.isAdministrative);
    const results: ReconciliationResult[] = [];

    const isTimeMatch = (timeA: string, timeB: string) => {
        if (!timeA || !timeB) return false;
        return Math.abs(timeToMinutes(timeA) - timeToMinutes(timeB)) <= 2;
    };

    const dateToISO = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const cleanId = (id: string | number) => String(id || '').trim().toUpperCase().replace(/^A/i, '').replace(/^0+/, '');
    const normalizePlace = (txt: string) => String(txt || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    // 1. Main Audit: Based on SYSTEM REPORT (Master List)
    institutionalReferences.forEach(ref => {
        const refId = cleanId(ref.instructor_id);
        const refNrc = cleanId(ref.nrc);

        // Find matches in App
        const appMatches = academicSchedules.filter(sched =>
            cleanId(sched.nrc) === refNrc &&
            cleanId(sched.instructorId) === refId &&
            sched.days.includes(ref.dia) &&
            isTimeMatch(sched.startTime, ref.hora_inicio)
        );

        if (appMatches.length === 0) {
            // MISSING: System has it, App does NOT
            results.push({
                id: `missing-${ref.nrc}-${ref.dia}-${ref.hora_inicio}`,
                nrc: ref.nrc,
                status: 'missing',
                errors: [`La sesión institucional no ha sido programada en la aplicación.`],
                reference: ref
            });
        } else {
            // EXIST: Validate discrepancies
            const sched = appMatches[0];
            const errors: string[] = [];

            if (dateToISO(sched.startDate) !== ref.fecha_inicio) {
                errors.push(`Fecha Inicio: Sistema (${ref.fecha_inicio}) vs App (${dateToISO(sched.startDate)})`);
            }
            if (dateToISO(sched.endDate) !== ref.fecha_fin) {
                errors.push(`Fecha Fin: Sistema (${ref.fecha_fin}) vs App (${dateToISO(sched.endDate)})`);
            }

            const appPlace = normalizePlace(sched.building + sched.room);
            const refPlace = normalizePlace(ref.edificio + ref.salon);
            if (appPlace !== refPlace) {
                errors.push(`Ubicación: Sistema (${ref.edificio}-${ref.salon}) vs App (${sched.building}-${sched.room})`);
            }

            if (!isTimeMatch(sched.endTime, ref.hora_fin)) {
                errors.push(`Hora Fin: Sistema (${ref.hora_fin}) vs App (${sched.endTime})`);
            }

            results.push({
                id: sched.id,
                nrc: ref.nrc,
                status: errors.length > 0 ? 'discrepancy' : 'ok',
                errors,
                reference: ref
            });
        }
    });

    // 2. Extras Report: Based on APP that is NOT in System
    academicSchedules.forEach(sched => {
        if (!sched.nrc || sched.nrc === '-' || sched.nrc === '0') return;

        sched.days.forEach(day => {
            const schedNrc = cleanId(sched.nrc);
            const schedId = cleanId(sched.instructorId);

            const inSystem = institutionalReferences.some(ref =>
                cleanId(ref.nrc) === schedNrc &&
                cleanId(ref.instructor_id) === schedId &&
                ref.dia === day &&
                isTimeMatch(sched.startTime, ref.hora_inicio)
            );

            if (!inSystem) {
                results.push({
                    id: sched.id,
                    nrc: sched.nrc,
                    status: 'extra',
                    errors: [`Esta sesión de la App no existe en el reporte oficial del sistema.`],
                    reference: { nrc: sched.nrc, dia: day, hora_inicio: sched.startTime, instructor_id: sched.instructorId } as any
                });
            }
        });
    });

    return results;
};
