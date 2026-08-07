import { ProcessedSchedule, Instructor } from '../types';
import { detectScheduleVariations, ScheduleVariationSegment } from './scheduleVariations';

export interface CourseRow {
    nrc: string;
    courseCode: string;
    courseName: string;
    room: string;
    building: string;
    days: string[];
    startTime: string;
    endTime: string;
    startDate: Date;
    endDate: Date;
}

export interface InstructorEmailSummary {
    instructorName: string;
    periodo: string;
    courseRows: CourseRow[];
    variations: ScheduleVariationSegment[];
    subject: string;
    bodyText: string;
    bodyHtml: string;
}

const formatDate = (d: Date) => d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDay = (d: string) => d.slice(0, 3);
const formatDays = (days: string[]) => days.map(shortDay).join(', ');

/**
 * Agrupa los horarios académicos (no administrativos) de un instructor en filas únicas
 * por NRC+aula+edificio+días+horario, fusionando fragmentos de fecha idénticos (ej. los
 * que deja "Individualizar") en un solo rango [primer inicio, último fin].
 */
const buildCourseRows = (schedules: ProcessedSchedule[]): CourseRow[] => {
    const groups = new Map<string, CourseRow>();
    schedules
        .filter(s => !s.isAdministrative)
        .forEach(s => {
            const key = [s.nrc, s.room, s.building, [...s.days].sort().join('-'), s.startTime, s.endTime].join('|');
            const existing = groups.get(key);
            if (existing) {
                if (s.startDate < existing.startDate) existing.startDate = s.startDate;
                if (s.endDate > existing.endDate) existing.endDate = s.endDate;
            } else {
                groups.set(key, {
                    nrc: s.nrc, courseCode: s.courseCode, courseName: s.courseName,
                    room: s.room, building: s.building, days: s.days,
                    startTime: s.startTime, endTime: s.endTime,
                    startDate: s.startDate, endDate: s.endDate,
                });
            }
        });
    return Array.from(groups.values()).sort((a, b) =>
        a.nrc === b.nrc ? a.startDate.getTime() - b.startDate.getTime() : a.nrc.localeCompare(b.nrc)
    );
};

export const buildInstructorEmailSummary = (
    instructor: Pick<Instructor, 'name'>,
    instructorSchedules: ProcessedSchedule[],
    periodo: string,
    semesterStart: Date,
    semesterEnd: Date
): InstructorEmailSummary => {
    const courseRows = buildCourseRows(instructorSchedules);
    const variations = detectScheduleVariations(instructorSchedules, semesterStart, semesterEnd);
    const hasVariation = variations.length > 1;

    const subject = `Programación de Horario — ${instructor.name} — Periodo ${periodo}`;

    const variationLines = hasVariation
        ? variations.map(v => `  • Del ${formatDate(v.startDate)} al ${formatDate(v.endDate)}: clases los días ${formatDays(v.days)}.`)
        : [];

    const tableTextRows = courseRows.map(r =>
        `${r.nrc}\t${r.courseName}\t${r.building} - ${r.room}\t${formatDays(r.days)}\t${r.startTime}-${r.endTime}\t${formatDate(r.startDate)}\t${formatDate(r.endDate)}`
    );

    const bodyText = [
        `Estimado/a ${instructor.name},`,
        '',
        `Te compartimos el resumen de tu programación para el periodo ${periodo}.`,
        '',
        ...(hasVariation ? [
            'IMPORTANTE: tu horario no es el mismo durante todo el periodo — varía según el tramo de fechas. No asumas que se mantiene igual toda la duración del ciclo:',
            ...variationLines,
            '',
        ] : []),
        'Resumen de asignaciones (NRC | Curso | Ambiente | Días | Horario | Inicio | Fin):',
        'NRC\tCurso\tAmbiente\tDías\tHorario\tInicio\tFin',
        ...tableTextRows,
        '',
        'Cualquier apreciación adicional sobre tu carga, coordinar con el área correspondiente.',
        '',
        'Saludos cordiales.',
    ].join('\n');

    const variationHtml = hasVariation
        ? `<p style="color:#b91c1c;font-weight:bold;margin:12px 0 4px;">IMPORTANTE: tu horario varía durante el periodo, no es el mismo todas las semanas:</p>
<ul style="margin:0 0 12px 20px;padding:0;">
${variations.map(v => `<li>Del <strong>${formatDate(v.startDate)}</strong> al <strong>${formatDate(v.endDate)}</strong>: clases los días <strong>${formatDays(v.days)}</strong>.</li>`).join('\n')}
</ul>`
        : '';

    const tableHtmlRows = courseRows.map(r => `<tr>
<td style="padding:6px 10px;border:1px solid #e2e8f0;">${r.nrc}</td>
<td style="padding:6px 10px;border:1px solid #e2e8f0;">${r.courseName}</td>
<td style="padding:6px 10px;border:1px solid #e2e8f0;">${r.building} - ${r.room}</td>
<td style="padding:6px 10px;border:1px solid #e2e8f0;">${formatDays(r.days)}</td>
<td style="padding:6px 10px;border:1px solid #e2e8f0;">${r.startTime}-${r.endTime}</td>
<td style="padding:6px 10px;border:1px solid #e2e8f0;">${formatDate(r.startDate)}</td>
<td style="padding:6px 10px;border:1px solid #e2e8f0;">${formatDate(r.endDate)}</td>
</tr>`).join('\n');

    const bodyHtml = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;">
<p>Estimado/a <strong>${instructor.name}</strong>,</p>
<p>Te compartimos el resumen de tu programación para el periodo <strong>${periodo}</strong>.</p>
${variationHtml}
<table style="border-collapse:collapse;width:100%;font-size:12px;">
<thead><tr style="background:#f1f5f9;">
<th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">NRC</th>
<th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Curso</th>
<th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Ambiente</th>
<th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Días</th>
<th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Horario</th>
<th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Inicio</th>
<th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">Fin</th>
</tr></thead>
<tbody>
${tableHtmlRows}
</tbody>
</table>
<p style="margin-top:16px;">Saludos cordiales.</p>
</div>`;

    return { instructorName: instructor.name, periodo, courseRows, variations, subject, bodyText, bodyHtml };
};
