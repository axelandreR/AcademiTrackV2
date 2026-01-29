import * as XLSX from 'xlsx';
import { ProcessedSchedule, RoomData, InstructorData, HolidayData } from '../types';
import { COLORS, SEMESTER_START_DATE, SEMESTER_END_DATE } from '../constants';

export interface ParseResult {
  schedules: ProcessedSchedule[];
  rooms: RoomData[];
  instructors: InstructorData[];
  holidays: HolidayData[];
}

const normalizeKey = (key: string) => {
  if (!key) return '';
  return key.toString().trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '_');
};

const normalizeName = (name: string) => {
  if (!name) return 'Sin asignar';
  return name.toString()
    .toUpperCase()
    .replace(/,/g, ' ') // Quitar comas
    .replace(/\s+/g, ' ') // Quitar espacios dobles
    .trim();
};

const mapFuzzy = (obj: any, candidates: string[]) => {
  const normalizedCandidates = candidates.map(normalizeKey);
  for (const key in obj) {
    if (normalizedCandidates.includes(normalizeKey(key))) return obj[key];
  }
  return undefined;
};

export const parseExcelFile = async (file: File): Promise<ParseResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });

        // 1. Programación
        const schedSheetName = workbook.SheetNames.find(name => normalizeKey(name).includes('progr')) || workbook.SheetNames[0];
        const schedWorksheet = workbook.Sheets[schedSheetName];
        const schedJson = XLSX.utils.sheet_to_json<any>(schedWorksheet, { defval: null });

        // 2. Aulas
        const roomSheetName = workbook.SheetNames.find(name => normalizeKey(name) === 'aula' || normalizeKey(name).includes('ambiente'));
        let rooms: RoomData[] = [];
        if (roomSheetName) {
          const roomJson = XLSX.utils.sheet_to_json<any>(workbook.Sheets[roomSheetName], { defval: null });
          rooms = roomJson.map(r => ({
            career: String(mapFuzzy(r, ['CARRERA']) || ''),
            roomKey: `${String(mapFuzzy(r, ['EDIF']) || '').trim()} - ${String(mapFuzzy(r, ['AULA']) || '').trim()}`,
            building: String(mapFuzzy(r, ['EDIF']) || ''),
            room: String(mapFuzzy(r, ['AULA']) || ''),
            description: String(mapFuzzy(r, ['DESCRIPCION_ACTUAL', 'DESCRIPCION']) || ''),
            type: String(mapFuzzy(r, ['TIPO']) || 'SIN TIPO').trim().toUpperCase(),
            capacity: Number(mapFuzzy(r, ['AFORO', 'CAPACIDAD']) || 0)
          }));
        }

        // 3. Instructores
        const instSheetName = workbook.SheetNames.find(name => normalizeKey(name).includes('instructor') || normalizeKey(name).includes('docente'));
        let instructors: InstructorData[] = [];
        if (instSheetName) {
          const instJson = XLSX.utils.sheet_to_json<any>(workbook.Sheets[instSheetName], { defval: null });
          instructors = instJson.map(i => {
            const tipoRaw = String(mapFuzzy(i, ['TIPO']) || '').toUpperCase();
            return {
              id: String(mapFuzzy(i, ['ID', 'CODIGO']) || ''),
              name: normalizeName(String(mapFuzzy(i, ['TRABAJADOR', 'NOMBRE', 'INSTRUCTOR', 'DOCENTE']) || '')),
              type: (tipoRaw.includes('TC') || tipoRaw.includes('COMPLETO')) ? 'TC' : 'TP',
              maxHours: Number(mapFuzzy(i, ['HORAS_MAX', 'META']) || 0),
              specialty: String(mapFuzzy(i, ['ESPECIALIDAD']) || 'General'),
              campus: String(mapFuzzy(i, ['SEDE', 'CAMPUS']) || 'N/A'),
              status: String(mapFuzzy(i, ['ESTADO']) || 'Activo')
            };
          });
        }

        // 4. Feriados
        const holidaySheetName = workbook.SheetNames.find(name => normalizeKey(name).includes('feriado'));
        let holidays: HolidayData[] = [];
        if (holidaySheetName) {
          const holidayJson = XLSX.utils.sheet_to_json<any>(workbook.Sheets[holidaySheetName], { defval: null });
          holidays = holidayJson.map(h => ({
            date: parseExcelDateFixed(mapFuzzy(h, ['DIA_FERIADO', 'FECHA', 'FERIADO'])),
            name: String(mapFuzzy(h, ['CELEBRACION', 'NOMBRE', 'DESCRIPCION']) || 'Feriado'),
            description: String(mapFuzzy(h, ['NOMBRE_DIA', 'DIA']) || '')
          })).filter(h => h.date instanceof Date && !isNaN(h.date.getTime()));
        }

        const nrcColorMap = new Map<string, string>();
        let colorCounter = 0;
        const getOrCreateColor = (nrc: string) => {
          const cleanNrc = String(nrc || 'unknown').trim();
          if (!nrcColorMap.has(cleanNrc)) { nrcColorMap.set(cleanNrc, COLORS[colorCounter % COLORS.length]); colorCounter++; }
          return nrcColorMap.get(cleanNrc)!;
        };

        const schedules = schedJson.map((item, index) => {
          const days: string[] = [];
          const isMarked = (key: string) => {
            const val = String(item[key] || '').trim().toUpperCase();
            return val === 'X' || val === '1' || val === 'SI' || val === 'S';
          };

          for (const key in item) {
            const n = normalizeKey(key);
            if ((n === 'lunes' || n === 'lun' || n === 'l') && isMarked(key)) days.push('LUNES');
            if ((n === 'martes' || n === 'mar' || n === 'ma' || n === 'm') && isMarked(key)) days.push('MARTES');
            if ((n === 'miercoles' || n === 'mie' || n === 'mi' || n === 'x' || n === 'w') && isMarked(key)) days.push('MIERCOLES');
            if ((n === 'jueves' || n === 'jue' || n === 'ju' || n === 'j') && isMarked(key)) days.push('JUEVES');
            if ((n === 'viernes' || n === 'vie' || n === 'vi' || n === 'v') && isMarked(key)) days.push('VIERNES');
            if ((n === 'sabado' || n === 'sab' || n === 'sa' || n === 's') && isMarked(key)) days.push('SABADO');
            if ((n === 'domingo' || n === 'dom' || n === 'do' || n === 'd') && isMarked(key)) days.push('DOMINGO');
          }

          const startTime = formatTime(mapFuzzy(item, ['HORA_INI', 'INICIO_HORA', 'HORA_INICIO', 'H_INI', 'T_INI']));
          const endTime = formatTime(mapFuzzy(item, ['HORA_FIN', 'FIN_HORA', 'HORA_FINAL', 'H_FIN', 'T_FIN']));
          // Valor por defecto si faltan fechas: SEMESTER_START / SEMESTER_END
          const startDate = parseExcelDateFixed(mapFuzzy(item, ['D_INICIO', 'FECHA_INICIO', 'INICIO', 'F_INICIO', 'DESDE'])) || new Date(SEMESTER_START_DATE);
          const endDate = parseExcelDateFixed(mapFuzzy(item, ['D_FIN', 'FECHA_FIN', 'FIN', 'F_FIN', 'HASTA'])) || new Date(SEMESTER_END_DATE);

          const weeklyHoursRaw = parseNumberRobust(mapFuzzy(item, ['HORAS_SEMANALES', 'HORAS', 'HRS', 'CARGA', 'CREDITOS', 'WEEKLY_HRS']));

          // Cálculo MANUAL de Carga como respaldo si la columna falta, PERO PRIORIZANDO weeklyHoursRaw si existe
          let weeklyHours = weeklyHoursRaw;
          if (weeklyHours === 0 && startTime && endTime && days.length > 0) {
            const [h1, m1] = startTime.split(':').map(Number);
            const [h2, m2] = endTime.split(':').map(Number);
            const duration = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
            weeklyHours = duration * days.length;
          }

          const nrcValue = String(mapFuzzy(item, ['SECCION', 'NRC', 'ID_NRC', 'SEC', 'ID_SECCION']) || '-');

          return {
            id: `row-${index}-${mapFuzzy(item, ['ID', 'INDICE']) || Date.now()}`,
            courseCode: String(mapFuzzy(item, ['CODIGO', 'CURSO_ID', 'MAT-CUR', 'MAT_CUR', 'MATRICULA_CURSO']) || ''),
            courseName: String(mapFuzzy(item, ['DESCRIPCION_CURSO', 'MATERIA', 'CURSO']) || ''),
            activity: String(mapFuzzy(item, ['ACTIVIDAD', 'TIPO_ACT']) || ''),
            meetingType: String(mapFuzzy(item, ['TIPO_REUNION', 'MODALIDAD']) || ''),
            block: String(mapFuzzy(item, ['BLOQUE', 'GRUPO']) || ''),
            instructor: normalizeName(String(mapFuzzy(item, ['INSTRUCTOR', 'DOCENTE', 'TRABAJADOR']) || '')),
            instructorId: String(mapFuzzy(item, ['ID_INST', 'DOCENTE_ID']) || ''),
            room: String(mapFuzzy(item, ['SALON', 'AULA', 'AMBIENTE']) || ''),
            building: String(mapFuzzy(item, ['EDIFICIO', 'EDIF']) || ''),
            days, startTime, endTime, startDate, endDate,
            career: String(mapFuzzy(item, ['CARRERA', 'PROGRAMA', 'DEPT']) || ''),
            nrc: nrcValue, color: getOrCreateColor(nrcValue),
            weeklyHours, aforo: parseNumberRobust(mapFuzzy(item, ['AFORO', 'CAPACIDAD'])),
            periodo: String(mapFuzzy(item, ['PERIODO', 'CICLO']) || ''),
            semestre: String(mapFuzzy(item, ['SEMESTRE', 'NIVEL']) || '')
          };
        }).filter(item =>
          // RELAJAMOS EL FILTRO: Solo exigimos que tenga horas para no perder carga
          (item.weeklyHours > 0 || (item.days.length > 0 && item.startTime)) &&
          item.startDate instanceof Date && !isNaN(item.startDate.getTime())
        );

        resolve({ schedules, rooms, instructors, holidays });
      } catch (err) { reject(err); }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

const parseNumberRobust = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(',', '.').replace(/[^\d.]/g, '');
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
};

const parseExcelDateFixed = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val === 'number') {
    const date = new Date(1899, 11, 30);
    date.setDate(date.getDate() + Math.floor(val));
    date.setHours(0, 0, 0, 0);
    return date;
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatTime = (time: any): string => {
  if (!time) return '';
  if (typeof time === 'number') {
    let totalMinutes = Math.round(time * 24 * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }
  let str = String(time).trim().toUpperCase();
  // Quitar segundos si existen (HH:MM:SS)
  if (str.split(':').length === 3) str = str.split(':').slice(0, 2).join(':');
  // Manejar AM/PM
  if (str.includes('AM') || str.includes('PM')) {
    let [t, p] = str.split(/\s+/);
    if (!p) { p = str.slice(-2); t = str.slice(0, -2).trim(); }
    let [h, m] = t.split(':').map(Number);
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
  }
  // Formato comprimido: 745 -> 07:45
  if (!str.includes(':') && /^\d{3,4}$/.test(str)) {
    const h = str.length === 3 ? '0' + str[0] : str.slice(0, 2);
    const m = str.slice(-2);
    return `${h}:${m}`;
  }
  if (str.includes(':')) {
    const [h, m] = str.split(':');
    return `${h.padStart(2, '0')}:${(m || '00').slice(0, 2).padStart(2, '0')}`;
  }
  return str;
};
