import { ProcessedSchedule, Instructor } from '../types';
import { isPresencialOrComputableAsinc, belongsToInstructor } from './businessRules';
import { computeDailyJourney } from './dailyJourney';

export interface DailyJourney {
    date: Date;
    dateStr: string;
    dayName: string;
    startTime: string;
    endTime: string;
    totalHours: number;
    courseName: string;
    campus: string;
    observations: string;
}

export interface AttendanceSheetData {
    instructor: Instructor;
    periodStart: Date;
    periodEnd: Date;
    journeys: DailyJourney[];
    weeklyScheduleSummary: {
        course: string;
        day: string;
        start: string;
        end: string;
    }[];
}

/**
 * Calcula el rango de fechas para el periodo de asistencia
 * El periodo va del 20 del mes anterior al 19 del mes actual.
 * @param month 1-12
 * @param year e.g. 2026
 */
export const getAttendancePeriodRange = (month: number, year: number) => {
    // Fecha fin: 19 del mes seleccionado
    const endDate = new Date(year, month - 1, 19, 23, 59, 59);

    // Fecha inicio: 20 del mes anterior
    let startMonth = month - 2; // -1 es el mes anterior, -2 para Date constructor
    let startYear = year;
    if (month === 1) {
        startMonth = 11; // Diciembre
        startYear = year - 1;
    }

    const startDate = new Date(startYear, startMonth, 20, 0, 0, 0);

    return { startDate, endDate };
};

const timeToMinutes = (time: string): number => {
    const [hh, mm] = time.split(':').map(Number);
    return hh * 60 + mm;
};

const getDayName = (date: Date): string => {
    const days = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    return days[date.getDay()];
};

/**
 * Procesa los horarios de un instructor para generar las jornadas diarias presenciales
 */
export const processAttendanceJourneys = (
    instructor: Instructor,
    allSchedules: ProcessedSchedule[],
    startDate: Date,
    endDate: Date
): AttendanceSheetData => {
    // Helper para normalizar textos (quitar acentos, espacios y pasar a mayúsculas)
    const normalize = (str: string) => (str || '').toString().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

    const instructorScheds = allSchedules.filter(s => {
        // El ID es la única fuente de verdad cuando el bloque lo trae; fuzzy match
        // por nombre solo aplica a bloques legados sin ID (ver belongsToInstructor).
        if (!belongsToInstructor(instructor, s)) return false;

        // Rango de fechas (solapamiento)
        // Usamos timestamps para evitar problemas de horas
        const sStart = new Date(s.startDate).getTime();
        const sEnd = new Date(s.endDate).getTime();
        const pStart = startDate.getTime();
        const pEnd = endDate.getTime();
        if (sEnd < pStart || sStart > pEnd) return false;

        // USA REGLA CENTRALIZADA
        return isPresencialOrComputableAsinc(s);
    });

    // 2. Generar las jornadas diarias (puede haber 2 por día si hay Refrigerio: una
    // antes y otra después — nunca un registro para el Refrigerio en sí).
    const journeys: DailyJourney[] = [];
    const dayNamesMap = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

    // Formateador para comparar fechas por día (YYYY-MM-DD)
    const toDateKey = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Iterar por cada día del periodo
    const current = new Date(startDate);
    // Aseguramos que current esté a las 00:00 para la comparación de rango
    current.setHours(0, 0, 0, 0);
    const limit = new Date(endDate);

    while (current <= limit) {
        const dateKey = toDateKey(current);
        const dayOfWeek = current.getDay();
        const currentDayName = dayNamesMap[dayOfWeek];

        // Buscar actividades que ocurran este día de la semana y que cubran esta fecha
        const dayScheds = instructorScheds.filter(s => {
            // El día debe estar incluido en s.days
            const sDaysClean = (s.days || []).map(normalize);
            const occursOnDay = sDaysClean.includes(normalize(currentDayName));

            // La fecha 'current' debe estar dentro de [s.startDate, s.endDate]
            // Comparamos solo las fechas (YYYY-MM-DD) para evitar desfases de horas
            const sStartDateStr = toDateKey(s.startDate);
            const sEndDateStr = toDateKey(s.endDate);
            const withinDateRange = dateKey >= sStartDateStr && dateKey <= sEndDateStr;

            return occursOnDay && withinDateRange;
        });

        if (dayScheds.length > 0) {
            // Mismo motor de "Jornada Diaria" (ScheduleGrid, ExportarSemana HE): parte el
            // día en Mañana/Tarde por el bloque de Refrigerio si existe. Antes esta función
            // tenía su propia lógica de min/max que ignoraba el Refrigerio y generaba UN
            // solo registro cubriendo todo el día (incluyendo la hora de refrigerio como si
            // fuera tiempo de trabajo continuo).
            const journey = computeDailyJourney(dayScheds, instructor.type);
            const nonBreakBlocks = dayScheds.filter(s => s.category !== 'refrigerio');

            // Determina el nombre de curso a mostrar para un tramo (mañana o tarde),
            // considerando solo los bloques que caen dentro de ese tramo — nunca el
            // Refrigerio, que ya se excluyó de nonBreakBlocks.
            const pickCourseName = (blocks: ProcessedSchedule[]): string => {
                let classCourseFound = '';
                let anyCourseFound = '';
                blocks.forEach(s => {
                    const name = (s.courseName || '').trim();
                    const isAsincrona = normalize(name).includes('ASINCRONA');
                    if (!s.isAdministrative && !isAsincrona) {
                        classCourseFound = name;
                    }
                    if (!anyCourseFound || (!isAsincrona && anyCourseFound.toUpperCase().includes('ASINCRONA'))) {
                        anyCourseFound = name;
                    }
                });
                return (classCourseFound || anyCourseFound || 'ASÍNCRONA PRESENCIAL').toUpperCase();
            };

            const pushEntry = (shift: { start: string | null; end: string | null; hours: number }, blocks: ProcessedSchedule[]) => {
                if (!shift.start || !shift.end || shift.hours <= 0) return;
                journeys.push({
                    date: new Date(current),
                    dateStr: current.toLocaleDateString('es-PE'),
                    dayName: getDayName(current),
                    startTime: shift.start,
                    endTime: shift.end,
                    totalHours: Number(shift.hours.toFixed(2)),
                    courseName: pickCourseName(blocks),
                    campus: '06',
                    observations: ''
                });
            };

            if (journey.hasRefrigerio) {
                const refrigerio = dayScheds.find(s => s.category === 'refrigerio')!;
                const breakStart = timeToMinutes(refrigerio.startTime);
                const breakEnd = timeToMinutes(refrigerio.endTime);
                const beforeBlocks = nonBreakBlocks.filter(s => timeToMinutes(s.endTime) <= breakStart);
                const afterBlocks = nonBreakBlocks.filter(s => timeToMinutes(s.startTime) >= breakEnd);
                // Registro antes del Refrigerio y registro después — nunca uno para el
                // Refrigerio en sí (no se le crea ninguna fila propia).
                pushEntry(journey.morning, beforeBlocks);
                pushEntry(journey.afternoon, afterBlocks);
            } else {
                pushEntry(journey.morning, nonBreakBlocks);
            }
        }

        current.setDate(current.getDate() + 1);
    }

    // 3. Resumen de horario semanal para la cabecera
    const weeklySummary: { course: string; day: string; start: string; end: string; }[] = [];
    const handled = new Set<string>();

    instructorScheds.filter(s => s.category !== 'refrigerio').forEach(s => {
        s.days.forEach(d => {
            const key = `${normalize(s.courseName)}-${normalize(d)}-${s.startTime}-${s.endTime}`;
            if (!handled.has(key)) {
                weeklySummary.push({
                    course: s.courseName || (s.isAdministrative ? 'ASINCRONA' : 'CURSO'),
                    day: d.substring(0, 3).toUpperCase(),
                    start: s.startTime,
                    end: s.endTime
                });
                handled.add(key);
            }
        });
    });

    return {
        instructor,
        periodStart: startDate,
        periodEnd: endDate,
        journeys: journeys.sort((a, b) => a.date.getTime() - b.date.getTime() || a.startTime.localeCompare(b.startTime)),
        weeklyScheduleSummary: weeklySummary
    };
};
