import * as XLSX from 'xlsx';
import { ProcessedSchedule, RoomData, Instructor, HolidayData, InstitutionalReference, ScheduleCategory, ModalityType } from '../types';
import { COLORS, SEMESTER_START_DATE, SEMESTER_END_DATE } from '../constants';

export interface ParseResult {
  schedules: ProcessedSchedule[];
  rooms: RoomData[];
  instructors: Instructor[];
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
        let instructors: Instructor[] = [];
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
            instructorId: String(mapFuzzy(item, ['ID_INST', 'DOCENTE_ID', 'ID']) || '').trim(),
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

export const parseInstitutionalReport = async (file: File): Promise<InstitutionalReference[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(worksheet, { defval: null });

        const results: InstitutionalReference[] = [];
        const daysKeys = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];
        const dayNamesMap: Record<string, string> = {
          'LUN': 'LUNES', 'MAR': 'MARTES', 'MIE': 'MIERCOLES', 'JUE': 'JUEVES', 'VIE': 'VIERNES', 'SAB': 'SABADO', 'DOM': 'DOMINGO'
        };

        json.forEach((row) => {
          const nrc = String(mapFuzzy(row, ['NRC', 'SECCION', 'SEC', 'ID_NRC']) || '');
          if (!nrc || nrc === 'null' || nrc === '-') return;

          const tipo = String(mapFuzzy(row, ['TIPO', 'ACTIVIDAD']) || '');
          const instId = String(mapFuzzy(row, ['ID_INST', 'ID', 'CODIGO', 'ID_INSTRUCTOR']) || '');
          const instNombre = String(mapFuzzy(row, ['INSTRUCTOR', 'DOCENTE', 'TRABAJADOR', 'NOMBRE']) || '');
          const cursoNombre = String(mapFuzzy(row, ['DESCRIPCIÓN_CURSO', 'CURSO', 'MATERIA', 'DESCRIPCION']) || '');
          const edif = String(mapFuzzy(row, ['EDIFICIO', 'EDIF']) || '');
          const salon = String(mapFuzzy(row, ['SALON', 'AULA', 'AMBIENTE']) || '');
          const bloque = String(mapFuzzy(row, ['BLOQUE', 'GRUPO', 'SECCION_ACADEMICA']) || '');
          const carrera = String(mapFuzzy(row, ['CARRERA', 'PROGRAMA', 'ESCUELA', 'DEPARTAMENTO']) || '');

          // Mapeo robusto de fechas de vigencia
          const fInicio = parseExcelDateFixed(mapFuzzy(row, ['FECHA_INICIO', 'INICIO', 'F_INICIO', 'D_INICIO', 'DESDE', 'START_DATE']));
          const fFin = parseExcelDateFixed(mapFuzzy(row, ['FECHA_FIN', 'FIN', 'F_FIN', 'D_FIN', 'HASTA', 'END_DATE']));

          const rawHorario = String(mapFuzzy(row, ['HORARIO', 'INTERVALO', 'TIME']) || '');

          let hIni = '', hFin = '';
          if (rawHorario.includes('-')) {
            [hIni, hFin] = rawHorario.split('-').map(t => formatTime(t.trim()));
          }

          daysKeys.forEach(dk => {
            const val = String(row[dk] || '').trim().toUpperCase();
            if (val === 'X' || val === '1' || val === 'SI' || val === 'S') {
              results.push({
                nrc,
                tipo,
                instructor_id: instId,
                instructor_nombre: instNombre,
                curso_nombre: cursoNombre,
                dia: dayNamesMap[dk],
                hora_inicio: hIni,
                hora_fin: hFin,
                fecha_inicio: formatDateToDB(fInicio) || '',
                fecha_fin: formatDateToDB(fFin) || '',
                edificio: edif,
                salon: salon,
                bloque: bloque,
                carrera: carrera
              });
            }
          });
        });

        resolve(results);
      } catch (err) { reject(err); }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

const formatDateToDB = (date: Date | null): string | null => {
  if (!date || isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

  // Si ya es un objeto Date
  if (val instanceof Date && !isNaN(val.getTime())) {
    const d = new Date(val);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Si es el número serial de Excel
  if (typeof val === 'number') {
    const date = new Date(1899, 11, 30);
    date.setDate(date.getDate() + Math.floor(val));
    date.setHours(0, 0, 0, 0);
    return date;
  }

  if (typeof val === 'string') {
    return extractDateFromText(val);
  }

  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Intenta extraer una fecha de un texto que puede contener otros caracteres (ej: "LUNES 16/02/2026")
 */
const extractDateFromText = (text: string): Date | null => {
  if (!text) return null;
  const cleanStr = text.trim().toUpperCase();

  // 1. Buscar patrón DD/MM/YYYY o DD-MM-YYYY
  const standardMatch = cleanStr.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (standardMatch) {
    let [_, d, m, y] = standardMatch;
    let year = parseInt(y);
    if (year < 100) year += 2000;
    const date = new Date(year, parseInt(m) - 1, parseInt(d), 0, 0, 0, 0);
    if (!isNaN(date.getTime())) return date;
  }

  // 2. Buscar patrón DD-MON-YY (Banner)
  const monthMap: Record<string, number> = {
    'ENE': 0, 'FEB': 1, 'MAR': 2, 'ABR': 3, 'MAY': 4, 'JUN': 5,
    'JUL': 6, 'AGO': 7, 'SET': 8, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DIC': 11,
    'JAN': 0, 'APR': 3, 'AUG': 7, 'DEC': 11
  };
  const bannerMatch = cleanStr.match(/(\d{1,2})[-\s]([A-Z]{3})[-\s](\d{2,4})/);
  if (bannerMatch) {
    let [_, d, mon, y] = bannerMatch;
    let year = parseInt(y);
    if (year < 100) year += 2000;
    if (monthMap[mon] !== undefined) {
      const date = new Date(year, monthMap[mon], parseInt(d), 0, 0, 0, 0);
      if (!isNaN(date.getTime())) return date;
    }
  }

  return null;
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

/**
 * RECUPERACIÓN: Parsea el archivo de 'Tareas Administrativas' (el formato tabular)
 */
export const parseAdminTasksRecovery = async (file: File): Promise<ProcessedSchedule[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

        // BUSQUEDA DINÁMICA DEL INSTRUCTOR (Basado en tu imagen del Excel)
        let instructorId = '';
        let instructorName = '';

        // Buscamos en las primeras 15 filas las etiquetas ID: e INSTRUCTOR:
        for (let i = 0; i < Math.min(json.length, 15); i++) {
          const row = json[i] || [];
          row.forEach((cell: any, idx: number) => {
            const cellText = String(cell || '').toUpperCase();
            if (cellText.includes('ID:') && row[idx + 1]) instructorId = String(row[idx + 1]).trim();
            if (cellText.includes('INSTRUCTOR:') && row[idx + 1]) instructorName = normalizeName(String(row[idx + 1]).trim());
          });
        }

        const recovered: any[] = [];
        let currentCategory: ScheduleCategory = 'por_asignar';
        let stopParsing = false;

        // El archivo tiene secciones. Buscamos filas que parezcan encabezados o datos.
        json.forEach((row: any[]) => {
          if (stopParsing || !row || row.length === 0) return;

          // Row text for detection (joining all cells) - HEURISTICA ROBUSTA
          const rowText = row.filter(cell => cell !== null && cell !== undefined).join(' ').toUpperCase();

          // KILL SWITCH: Si llegamos al resumen de carga académica, paramos de procesar
          if (rowText.includes('RESUMEN DE CARGA') || rowText.includes('CURSOS ASIGNADOS')) {
            stopParsing = true;
            return;
          }

          // DETECCIÓN DE SECCIÓN (Categoría - Estado)
          if (rowText.includes('ASINCRON') || rowText.includes('ASÍNCRON')) currentCategory = 'asincrona';
          else if (rowText.includes('PREPARAC') || rowText.includes('PREPARACIÓN')) currentCategory = 'preparacion';
          else if (rowText.includes('REFRIGERIO')) currentCategory = 'refrigerio';
          else if (rowText.includes('COORDINADOR') || rowText.includes('OTRAS FUNCIONES')) currentCategory = 'coordinador';
          else if (rowText.includes('POR ASIGNAR')) currentCategory = 'por_asignar';

          if (row.length < 12) return;

          // Ignorar fila de encabezado de tabla o filas de instructor
          const firstCell = String(row[0] || '').toUpperCase();

          // --- FILTROS ESTRICTOS ---
          // 1. Descartar filas de encabezado repetidas en cualquier parte
          if (rowText.includes('NRC') && rowText.includes('BLOQUE')) return;
          if (firstCell === 'TIPO' || firstCell.includes('ID DOCENTE') || firstCell.includes('INSTRUCTOR')) return;

          // 2. Descartar filas de clases académicas (si la primera columna es un NRC numérico)
          if (/^\d{4,6}$/.test(firstCell) || (typeof row[0] === 'number' && row[0] > 1000)) return;

          const tipoRaw = String(row[0] || '').trim().toUpperCase();
          const startDate = parseExcelDateFixed(row[1]);
          const endDate = parseExcelDateFixed(row[2]);

          // 3. Validar Fechas Reales (No texto que parezca fecha)
          if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return;

          // 4. Validar Horas Reales (CRÍTICO: Regex estricto de hora + Anti-Texto)
          const rawStartTime = row[10];
          const rawEndTime = row[11];

          // Si las celdas de hora contienen CUALQUIER LETRA (A-Z), descartar fila inmediatamente
          if (/[a-zA-Z]/.test(String(rawStartTime)) || /[a-zA-Z]/.test(String(rawEndTime))) return;

          const startTime = formatTime(rawStartTime);
          const endTime = formatTime(rawEndTime);

          // Validación final: Debe ser HH:MM
          if (!/^\d{1,2}:\d{2}$/.test(startTime) || !/^\d{1,2}:\d{2}$/.test(endTime)) return;

          const days: string[] = [];
          if (String(row[3]) === '1') days.push('DOMINGO');
          if (String(row[4]) === '1') days.push('LUNES');
          if (String(row[5]) === '1') days.push('MARTES');
          if (String(row[6]) === '1') days.push('MIERCOLES');
          if (String(row[7]) === '1') days.push('JUEVES');
          if (String(row[8]) === '1') days.push('VIERNES');
          if (String(row[9]) === '1') days.push('SABADO');

          if (days.length === 0) return;

          // --- LÓGICA DE MODALIDAD INTELIGENTE (PRIORIDAD TEXTO) ---
          const isVirtualText = rowText.includes('VIRTUAL') || rowText.includes('REMT');
          let modStr = 'PRESENCIAL';
          let modalityVal: ModalityType = 'presencial';

          if (isVirtualText || tipoRaw === 'REMT' || tipoRaw === 'VIRTUAL') {
            modStr = 'VIRTUAL';
            modalityVal = 'virtual';
          } else {
            modStr = 'PRESENCIAL';
            modalityVal = 'presencial';
          }

          // --- CLASIFICACIÓN PUNTO A PUNTO (POR CONTENIDO DE FILA) ---
          let finalCategory = currentCategory;
          if (rowText.includes('REFRIGERIO')) finalCategory = 'refrigerio';
          else if (rowText.includes('PREPARAC') || rowText.includes('PREPARACIÓN')) finalCategory = 'preparacion';
          else if (rowText.includes('ASINCRON') || rowText.includes('ASÍNCRON')) finalCategory = 'asincrona';
          else if (rowText.includes('COORDINADOR')) finalCategory = 'coordinador';

          // El nombre de la tarea depende de la categoría final y la modalidad
          let taskName = '';
          switch (finalCategory) {
            case 'refrigerio': taskName = 'REFRIGERIO'; break;
            case 'preparacion': taskName = `PREPARACIÓN DE CLASE ${modStr}`; break;
            case 'asincrona': taskName = `ASÍNCRONA ${modStr}`; break;
            case 'coordinador': taskName = 'COORDINADOR CARRERA'; break;
            case 'por_asignar': taskName = `HORAS POR ASIGNAR ${modStr}`; break;
            default: taskName = `TAREA ADMINISTRATIVA ${modStr}`;
          }

          // ID Determinístico: Evita duplicados al re-subir el mismo archivo
          const deterministicId = `rec-admin-${instructorId}-${days.join('')}-${startTime.replace(':', '')}-${endTime.replace(':', '')}-${finalCategory}`;

          recovered.push({
            id: deterministicId,
            courseCode: '',
            courseName: taskName,
            activity: 'Administrativa',
            meetingType: 'ADM',
            block: 'ADM',
            instructor: instructorName,
            instructorId: instructorId,
            room: 'N/A',
            building: String(row[12] || '00-AC'),
            days,
            startTime,
            endTime,
            startDate,
            endDate,
            career: 'ADMIN',
            nrc: '-',
            color: 'slate',
            weeklyHours: (days.length * (timeToMinRecovery(endTime) - timeToMinRecovery(startTime))) / 60,
            aforo: 0,
            periodo: 'RECUPERADO',
            semestre: '',
            isAdministrative: true,
            category: finalCategory,
            modality: modalityVal,
            tipoRaw: tipoRaw || 'PRES' // Valor por defecto visual
          });
        });

        resolve(recovered);
      } catch (err) { reject(err); }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

/**
 * RECUPERACIÓN: Parsea el archivo de 'Horario' (el formato visual de colores)
 */
export const parseScheduleRecovery = async (file: File): Promise<ProcessedSchedule[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, defval: '' });

        // BUSQUEDA DINÁMICA DEL INSTRUCTOR
        let instructorId = '';
        let instructorName = '';
        for (let i = 0; i < Math.min(json.length, 15); i++) {
          const row = json[i] || [];
          row.forEach((cell: any, idx: number) => {
            const cellText = String(cell || '').toUpperCase();
            if (cellText.includes('ID:') && row[idx + 1]) instructorId = String(row[idx + 1]).trim();
            if (cellText.includes('INSTRUCTOR:') && row[idx + 1]) instructorName = normalizeName(String(row[idx + 1]).trim());
          });
        }

        const daysMap = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];

        // Detectar columnas de inicio de cada bloque semanal (SEMANA 1, SEMANA 2, etc.)
        const windowStarts: number[] = [];
        const firstTimeRowIdx = json.findIndex(row =>
          row && row.length > 2 && /^\d{1,2}:\d{2}$/.test(formatTime(row[0])) && /^\d{1,2}:\d{2}$/.test(formatTime(row[1]))
        );

        if (firstTimeRowIdx !== -1) {
          const headerRow = json[firstTimeRowIdx - 1] || [];
          headerRow.forEach((cell, idx) => {
            if (String(cell).toUpperCase().includes('INICIO')) windowStarts.push(idx);
          });
        }
        if (windowStarts.length === 0) windowStarts.push(0);

        // Almacén Detallado por Semana
        interface WeekTask {
          name: string;
          startTime: string;
          endTime: string;
          days: string[];
          category: ScheduleCategory;
          modality: ModalityType;
          building: string;
          startDate: Date;
          endDate: Date;
        }
        const tasksByWeek: WeekTask[][] = [];

        // 1. EXTRAER TAREAS DE CADA BLOQUE SEMANAL
        windowStarts.forEach((wIdx, weekIdx) => {
          const weekTasksList: WeekTask[] = [];

          // Detectar fechas de esta semana específica (Búsqueda Exhaustiva en Cabecera)
          let weekStart = new Date(SEMESTER_START_DATE);
          let weekEnd = new Date(SEMESTER_END_DATE);

          for (let rowOffset = 1; rowOffset <= 3; rowOffset++) {
            const rowIdx = firstTimeRowIdx - rowOffset;
            if (rowIdx < 0) continue;
            const headerRow = json[rowIdx] || [];

            for (let c = 0; c < 4; c++) {
              const d = extractDateFromText(String(headerRow[wIdx + c + 2] || ''));
              if (d) { weekStart = d; break; }
            }
            for (let c = 4; c < 7; c++) {
              const d = extractDateFromText(String(headerRow[wIdx + c + 2] || ''));
              if (d) {
                weekEnd = d;
                // NORMALIZACIÓN: Si la fecha detectada es Viernes (5) o Sábado (6), extender al Domingo (0)
                if (weekEnd.getDay() === 5) weekEnd.setDate(weekEnd.getDate() + 2);
                else if (weekEnd.getDay() === 6) weekEnd.setDate(weekEnd.getDate() + 1);
                break;
              }
            }
          }

          let blockStopParsing = false;
          for (let r = firstTimeRowIdx; r < json.length; r++) {
            if (blockStopParsing) break;
            const row = json[r];
            if (!row || row.length < wIdx + 3) continue;

            const rowText = row.filter(c => c).join(' ').toUpperCase();
            if (rowText.includes('RESUMEN DE CARGA') || rowText.includes('CURSOS ASIGNADOS')) {
              blockStopParsing = true;
              break;
            }

            const startTime = formatTime(row[wIdx]);
            const endTime = formatTime(row[wIdx + 1]);
            if (!/^\d{1,2}:\d{2}$/.test(startTime) || !/^\d{1,2}:\d{2}$/.test(endTime)) continue;

            for (let d = 0; d < 7; d++) {
              const cellValue = String(row[wIdx + d + 2] || '').trim();
              if (!cellValue || cellValue.includes('FERIADO')) continue;
              if (!/^\d{4,5}\s*-/.test(cellValue)) {
                // Es administrativa
                const fullCellUpper = cellValue.toUpperCase();
                const lines = cellValue.split('\n').map(l => l.trim());
                const taskName = lines[0] || 'Tarea Administrativa';
                const hRange = cellValue.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
                const cStart = hRange ? hRange[1] : startTime;
                const cEnd = hRange ? hRange[2] : endTime;

                let category: ScheduleCategory = 'por_asignar';
                if (fullCellUpper.includes('REFRIGERIO')) category = 'refrigerio';
                else if (fullCellUpper.includes('PREPARAC') || fullCellUpper.includes('PREPARACIÓN')) category = 'preparacion';
                else if (fullCellUpper.includes('ASINCRON') || fullCellUpper.includes('ASÍNCRON')) category = 'asincrona';
                else if (fullCellUpper.includes('COORDINADOR')) category = 'coordinador';

                const isVirtual = fullCellUpper.includes('VIRTUAL') || fullCellUpper.includes('REMT');
                const modalityLabel = isVirtual ? 'VIRTUAL' : 'PRESENCIAL';
                let finalTaskName = taskName;
                if (category === 'preparacion') finalTaskName = `PREPARACIÓN DE CLASE ${modalityLabel}`;
                else if (category === 'asincrona') finalTaskName = `ASÍNCRONA ${modalityLabel}`;
                else if (category === 'refrigerio') finalTaskName = 'REFRIGERIO';
                else if (category === 'coordinador') finalTaskName = 'COORDINADOR CARRERA';

                const existing = weekTasksList.find(t =>
                  t.name === finalTaskName && t.days.includes(daysMap[d]) && t.endTime === cStart
                );

                if (existing) {
                  existing.endTime = cEnd;
                } else {
                  weekTasksList.push({
                    name: finalTaskName,
                    startTime: cStart,
                    endTime: cEnd,
                    days: [daysMap[d]],
                    category,
                    modality: isVirtual ? 'virtual' : 'presencial',
                    building: isVirtual ? 'SV-EV' : '00-AC',
                    startDate: weekStart,
                    endDate: weekEnd
                  });
                }
              }
            }
          }
          tasksByWeek.push(weekTasksList);
        });

        // 2. CONSOLIDAR TAREAS A TRAVÉS DE LAS SEMANAS
        const consolidated: ProcessedSchedule[] = [];
        const weekTasksUnified = tasksByWeek.map(list => {
          const unified: WeekTask[] = [];
          list.forEach(t => {
            const match = unified.find(u => u.name === t.name && u.startTime === t.startTime && u.endTime === t.endTime);
            if (match) {
              if (!match.days.includes(t.days[0])) match.days.push(t.days[0]);
            } else {
              unified.push({ ...t });
            }
          });
          return unified;
        });

        weekTasksUnified.forEach((weekList, weekIdx) => {
          weekList.forEach(task => {
            const existing = consolidated.find(c =>
              c.courseName === task.name &&
              c.startTime === task.startTime &&
              c.endTime === task.endTime &&
              JSON.stringify([...(c.days)].sort()) === JSON.stringify([...(task.days)].sort()) &&
              Math.abs(task.startDate.getTime() - c.endDate.getTime()) < 8 * 24 * 60 * 60 * 1000
            );

            if (existing) {
              existing.endDate = task.endDate;
            } else {
              const deterministicId = `rec-vis-${instructorId}-${task.days.join('')}-${task.startTime.replace(':', '')}-${weekIdx}-${task.category}`;
              consolidated.push({
                id: deterministicId,
                courseCode: '',
                courseName: task.name,
                activity: 'Administrativa',
                meetingType: 'ADM',
                block: 'ADM',
                instructor: instructorName,
                instructorId: instructorId,
                room: 'N/A',
                building: task.building,
                days: task.days,
                startTime: task.startTime,
                endTime: task.endTime,
                startDate: task.startDate,
                endDate: task.endDate,
                career: 'ADMIN',
                nrc: '-',
                color: 'slate',
                weeklyHours: (task.days.length * (timeToMinRecovery(task.endTime) - timeToMinRecovery(task.startTime))) / 60,
                aforo: 0,
                periodo: 'RECUPERADO',
                semestre: '',
                isAdministrative: true,
                category: task.category,
                modality: task.modality
              });
            }
          });
        });

        resolve(consolidated);
      } catch (err) { reject(err); }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

const timeToMinRecovery = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
