import { ProcessedSchedule, Instructor } from '../types';
import { isPresencialOrComputableAsinc, belongsToInstructor } from './businessRules';

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

const minutesToTime = (totalMinutes: number): string => {
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
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

    // 2. Generar un mapa de jornadas diarias
    const journeyMap: Record<string, DailyJourney> = {};
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
            let minMinutes = 24 * 60;
            let maxMinutes = 0;
            let classCourseFound = '';
            let anyCourseFound = '';

            dayScheds.forEach(s => {
                const startMin = timeToMinutes(s.startTime);
                const endMin = timeToMinutes(s.endTime);

                if (startMin < minMinutes) minMinutes = startMin;
                if (endMin > maxMinutes) maxMinutes = endMin;

                const name = (s.courseName || '').trim();
                const isAsincrona = normalize(name).includes('ASINCRONA');

                // Si no es administrativa Y no es asíncrona, es una clase real
                if (!s.isAdministrative && !isAsincrona) {
                    classCourseFound = name;
                }
                if (!anyCourseFound || (!isAsincrona && anyCourseFound.toUpperCase().includes('ASINCRONA'))) {
                    anyCourseFound = name;
                }
            });

            const finalCourseName = classCourseFound || anyCourseFound || 'ASÍNCRONA PRESENCIAL';

            journeyMap[dateKey] = {
                date: new Date(current),
                dateStr: current.toLocaleDateString('es-PE'),
                dayName: getDayName(current),
                startTime: minutesToTime(minMinutes),
                endTime: minutesToTime(maxMinutes),
                totalHours: Number(((maxMinutes - minMinutes) / 60).toFixed(2)),
                courseName: finalCourseName.toUpperCase(),
                campus: '06',
                observations: ''
            };
        }

        current.setDate(current.getDate() + 1);
    }

    // 3. Resumen de horario semanal para la cabecera
    const weeklySummary: { course: string; day: string; start: string; end: string; }[] = [];
    const handled = new Set<string>();

    instructorScheds.forEach(s => {
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
        journeys: Object.values(journeyMap).sort((a, b) => a.date.getTime() - b.date.getTime()),
        weeklyScheduleSummary: weeklySummary
    };
};
