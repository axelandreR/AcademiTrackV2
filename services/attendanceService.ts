import { ProcessedSchedule, Instructor } from '../types';
import { isPresencialOrComputableAsinc, belongsToInstructor } from './businessRules';
import { computeDailyJourney, getDayIncongruence } from './dailyJourney';

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
 * Un día cuya jornada de la ficha (entrada/salida por turno) no coincide con la suma de sus
 * bloques presenciales — lo que la auditoría cuenta. Ver getDayIncongruence.
 */
export interface AttendanceIncongruence {
    date: Date;
    dateStr: string;
    dayName: string;
    journeyMin: number;
    blocksMin: number;
    diffMin: number;
    blocks: string[];
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

// Helper para normalizar textos (quitar acentos, espacios y pasar a mayúsculas)
const normalize = (str: string) => (str || '').toString().trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

// Formateador para comparar fechas por día (YYYY-MM-DD)
const toDateKey = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const dayNamesMap = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

/**
 * Bloques presenciales de cada día del rango que entran a la ficha de asistencia. Única
 * fuente para processAttendanceJourneys (la ficha) y findAttendanceIncongruences (el
 * aviso), así lo que se avisa es exactamente lo que se exporta.
 */
const getAttendanceInstructorScheds = (
    instructor: Instructor,
    allSchedules: ProcessedSchedule[],
    startDate: Date,
    endDate: Date
): ProcessedSchedule[] => allSchedules.filter(s => {
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

const collectAttendanceDays = (
    instructor: Instructor,
    allSchedules: ProcessedSchedule[],
    startDate: Date,
    endDate: Date
): { date: Date; dayScheds: ProcessedSchedule[] }[] => {
    const instructorScheds = getAttendanceInstructorScheds(instructor, allSchedules, startDate, endDate);

    const days: { date: Date; dayScheds: ProcessedSchedule[] }[] = [];

    // Iterar por cada día del periodo
    const current = new Date(startDate);
    // Aseguramos que current esté a las 00:00 para la comparación de rango
    current.setHours(0, 0, 0, 0);
    const limit = new Date(endDate);

    while (current <= limit) {
        const dateKey = toDateKey(current);
        const currentDayName = dayNamesMap[current.getDay()];

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

        if (dayScheds.length > 0) days.push({ date: new Date(current), dayScheds });

        current.setDate(current.getDate() + 1);
    }

    return days;
};

/**
 * Días del periodo en que la jornada de la ficha no coincide con la suma de los bloques
 * presenciales (auditoría) — hueco entre bloques que debería ser consecutivo, o bloques
 * solapados. La ficha se arma con hora de entrada/salida, así que cualquier diferencia
 * (incluso 1 minuto) hace que la ficha exceda o no llegue a lo que dice la auditoría.
 * Los turnos partidos con hueco largo NO cuentan como incongruencia (ver
 * SPLIT_SHIFT_MIN_GAP_MINUTES en dailyJourney.ts).
 */
export const findAttendanceIncongruences = (
    instructor: Instructor,
    allSchedules: ProcessedSchedule[],
    startDate: Date,
    endDate: Date
): AttendanceIncongruence[] => {
    const result: AttendanceIncongruence[] = [];
    collectAttendanceDays(instructor, allSchedules, startDate, endDate).forEach(({ date, dayScheds }) => {
        const inc = getDayIncongruence(dayScheds, instructor.type);
        if (!inc) return;
        result.push({
            date,
            dateStr: date.toLocaleDateString('es-PE'),
            dayName: getDayName(date),
            ...inc,
            blocks: dayScheds
                .filter(s => s.category !== 'refrigerio')
                .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
                .map(s => `${s.startTime}-${s.endTime} ${(s.courseName || s.activity || 'BLOQUE').trim()}`),
        });
    });
    return result;
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
    // 2. Generar las jornadas diarias (una por turno: mañana/tarde si hay Refrigerio, o un
    // registro por turno si el día es partido — nunca un registro para el Refrigerio en sí).
    const journeys: DailyJourney[] = [];

    collectAttendanceDays(instructor, allSchedules, startDate, endDate).forEach(({ date: current, dayScheds }) => {
        // Mismo motor de "Jornada Diaria" (ScheduleGrid, ExportarSemana HE): parte el
        // día en turnos por el bloque de Refrigerio si existe, o por huecos largos si no.
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
            // Sin Refrigerio: un registro por turno (un día corrido es un solo turno; un
            // turno partido genera un registro de entrada/salida por cada uno).
            journey.shifts.forEach(shift => {
                const shiftStart = timeToMinutes(shift.start!);
                const shiftEnd = timeToMinutes(shift.end!);
                const shiftBlocks = nonBreakBlocks.filter(s => timeToMinutes(s.startTime) >= shiftStart && timeToMinutes(s.endTime) <= shiftEnd);
                pushEntry(shift, shiftBlocks);
            });
        }
    });

    // 3. Resumen de horario semanal para la cabecera
    const instructorScheds = getAttendanceInstructorScheds(instructor, allSchedules, startDate, endDate);
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
