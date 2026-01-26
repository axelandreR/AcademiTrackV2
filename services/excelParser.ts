
import * as XLSX from 'xlsx';
import { RawScheduleData, RawRoomData, RawInstructorData, RawHolidayData, ProcessedSchedule, RoomData, InstructorData, HolidayData } from '../types';
import { COLORS } from '../constants';

export interface ParseResult {
  schedules: ProcessedSchedule[];
  rooms: RoomData[];
  instructors: InstructorData[];
  holidays: HolidayData[];
}

export const parseExcelFile = async (file: File): Promise<ParseResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        
        // 1. Procesar Hoja de Programación
        const schedSheetName = workbook.SheetNames.find(name => name.toUpperCase().includes('PROGR')) || workbook.SheetNames[0];
        const schedWorksheet = workbook.Sheets[schedSheetName];
        const schedJson = XLSX.utils.sheet_to_json<RawScheduleData>(schedWorksheet);
        
        // 2. Procesar Hoja de AULA
        const roomSheetName = workbook.SheetNames.find(name => name.toUpperCase() === 'AULA');
        let rooms: RoomData[] = [];
        if (roomSheetName) {
          const roomWorksheet = workbook.Sheets[roomSheetName];
          const roomJson = XLSX.utils.sheet_to_json<RawRoomData>(roomWorksheet);
          rooms = roomJson.map(r => {
            const edif = String(r.EDIF || '').trim();
            const aula = String(r.AULA || '').trim();
            const roomKey = `${edif} - ${aula}`;
            
            return {
              career: String(r.CARRERA || ''),
              roomKey: roomKey,
              building: edif,
              room: aula,
              description: String(r["DESCRIPCIÓN ACTUAL"] || ''),
              type: String(r.TIPO || 'SIN TIPO').trim().toUpperCase(),
              capacity: Number(r.AFORO || 0)
            };
          });
        }

        // 3. Procesar Hoja de Instructores
        const instSheetName = workbook.SheetNames.find(name => name.toUpperCase().includes('INSTRUCTOR'));
        let instructors: InstructorData[] = [];
        if (instSheetName) {
          const instWorksheet = workbook.Sheets[instSheetName];
          const instJson = XLSX.utils.sheet_to_json<RawInstructorData>(instWorksheet);
          instructors = instJson.map(i => {
            const tipoRaw = String(i.TIPO || '').toUpperCase();
            const type: 'TC' | 'TP' = tipoRaw.includes('TC') || tipoRaw.includes('COMPLETO') ? 'TC' : 'TP';
            
            return {
              id: String(i.ID || ''),
              name: String(i.TRABAJADOR || '').trim(),
              type: type,
              maxHours: Number(i["HORAS MAX"] || 0),
              specialty: String(i.ESPECIALIDAD || 'General'),
              campus: String(i.SEDE || 'N/A'),
              status: String(i.ESTADO || 'Activo')
            };
          });
        }

        // 4. Procesar Hoja de Feriados
        const holidaySheetName = workbook.SheetNames.find(name => name.toUpperCase() === 'FERIADOS');
        let holidays: HolidayData[] = [];
        if (holidaySheetName) {
          const holidayWorksheet = workbook.Sheets[holidaySheetName];
          const holidayJson = XLSX.utils.sheet_to_json<RawHolidayData>(holidayWorksheet);
          holidays = holidayJson.map(h => ({
            date: parseExcelDateFixed(h["DÍA FERIADO"]),
            name: String(h["CELEBRACIÓN"] || 'Feriado'),
            description: String(h["NOMBRE DIA"] || '')
          })).filter(h => h.date instanceof Date && !isNaN(h.date.getTime()));
        }

        const nrcColorMap = new Map<string, string>();
        let colorCounter = 0;

        const getOrCreateColor = (nrc: string) => {
          const cleanNrc = String(nrc || 'unknown').trim();
          if (!nrcColorMap.has(cleanNrc)) {
            nrcColorMap.set(cleanNrc, COLORS[colorCounter % COLORS.length]);
            colorCounter++;
          }
          return nrcColorMap.get(cleanNrc)!;
        };
        
        const schedules = schedJson.map((item, index) => {
          const days: string[] = [];
          const isX = (val: any) => String(val || '').trim().toUpperCase() === 'X';
          
          if (isX(item.LUNES)) days.push('LUNES');
          if (isX(item.MARTES)) days.push('MARTES');
          if (isX(item.MIERCOLES)) days.push('MIERCOLES');
          if (isX(item.JUEVES)) days.push('JUEVES');
          if (isX(item.VIERNES)) days.push('VIERNES');
          if (isX(item.SABADO)) days.push('SABADO');
          if (isX(item.DOMINGO)) days.push('DOMINGO');

          const startDate = parseExcelDateFixed(item.D_INICIO);
          const endDate = parseExcelDateFixed(item.D_FIN);
          const nrcValue = String(item.SECCION || '-');
          const edifSched = String(item.EDIFICIO || '').trim();
          const roomSched = String(item.SALON || '').trim();

          return {
            id: `row-${index}-${item.ID || 'no-id'}`, 
            courseCode: item.CODIGO,
            courseName: item.DESCRIPCION_CURSO,
            activity: String(item.ACTIVIDAD || ''),
            meetingType: String(item.TIPO_REUNION || ''),
            block: item.Bloque,
            instructor: item.INSTRUCTOR || 'Sin asignar',
            instructorId: String(item.ID_INST || ''),
            room: roomSched,
            building: edifSched,
            days,
            startTime: formatTime(item.HORA_INI),
            endTime: formatTime(item.HORA_FIN),
            startDate,
            endDate,
            career: item.CARRERA,
            nrc: nrcValue,
            color: getOrCreateColor(nrcValue),
            weeklyHours: Number(item.HORAS_SEMANALES || 0),
            aforo: Number(item.AFORO || 0),
            periodo: String(item.periodo || ''),
            semestre: String(item.Semestre || '')
          };
        }).filter(item => 
          item.days.length > 0 && 
          item.startTime && 
          item.endTime && 
          item.startDate instanceof Date && 
          !isNaN(item.startDate.getTime())
        );

        resolve({ schedules, rooms, instructors, holidays });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

const parseExcelDateFixed = (val: any): Date => {
  if (!val) return new Date(NaN);
  if (typeof val === 'number') {
    const date = new Date(1899, 11, 30);
    date.setDate(date.getDate() + Math.floor(val));
    date.setHours(0, 0, 0, 0);
    return date;
  }
  if (typeof val === 'string') {
    const parts = val.split(/[-/]/);
    if (parts.length === 3) {
      let day, month, year;
      if (parts[0].length === 4) {
        year = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        day = parseInt(parts[2]);
      } else {
        day = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        year = parseInt(parts[2]);
      }
      return new Date(year, month, day, 0, 0, 0, 0);
    }
  }
  const d = new Date(val);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatTime = (time: any): string => {
  if (!time) return '';
  if (typeof time === 'number') {
    let totalMinutes = Math.round(time * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  const str = String(time).trim();
  if (str.includes(':')) {
    const parts = str.split(':');
    const h = parts[0].padStart(2, '0');
    const m = (parts[1] || '00').slice(0, 2).padStart(2, '0');
    return `${h}:${m}`;
  }
  return str;
};
