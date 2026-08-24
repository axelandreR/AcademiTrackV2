
export interface RawScheduleData {
  Índice: string | number;
  periodo: string;
  ID: string;
  CODIGO: string;
  CARRERA: string;
  Semestre: string;
  "Parte Periodo": string;
  SECCION: string;
  Bloque: string;
  "MAT CUR": string;
  "TIPO*": string;
  ACTIVIDAD: string;
  UNION: string;
  DESCRIPCION_CURSO: string;
  SEMANAS: string;
  HORAS_SEMANALES: string | number;
  INICIO: string;
  FIN: string;
  LUNES: string;
  MARTES: string;
  MIERCOLES: string;
  JUEVES: string;
  VIERNES: string;
  SABADO: string;
  DOMINGO: string;
  HORA_INI: string;
  HORA_FIN: string;
  D_INICIO: string;
  D_FIN: string;
  "# DIAS": string | number;
  IND_SESION: string;
  EDIFICIO: string;
  SALON: string;
  AFORO: string | number;
  ID_INST: string;
  INSTRUCTOR: string;
  NRO_ALU: string | number;
  TIPO_REUNION?: string;
}

export interface RawHolidayData {
  "DÍA FERIADO": any;
  "CELEBRACIÓN": string;
  "NOMBRE DIA": string;
}

export interface HolidayData {
  date: Date;
  name: string;
  description: string;
}

export interface RawRoomData {
  CARRERA: string;
  "Edif-Aula": string;
  EDIF: string;
  AULA: string;
  "DESCRIPCIÓN ACTUAL": string;
  TIPO: string;
  AFORO: string | number;
}

export interface RawInstructorData {
  ID: string;
  TRABAJADOR: string;
  TIPO: string;
  "HORAS MAX": string | number;
  ESPECIALIDAD: string;
  SEDE: string;
  ESTADO: string;
}

export interface Instructor {
  id: string;
  name: string;
  type: 'TC' | 'TP';
  maxHours: number;
  specialty: string;
  campus: string;
  status: string;
  auditStatus?: 'OK' | 'DEFICIT' | 'EXCESS' | 'PENDING' | 'ERROR' | null;
  auditJson?: string | null;
  // Cuando es true, el motor de auditoría no marca discrepancia académica/contractual ni
  // exceso de jornada diaria para este instructor (tiene horas extra asignadas en general).
  // Los choques de horario/aula siguen detectándose normalmente.
  hasExtraHoursAssigned?: boolean;
}

export interface RoomData {
  career: string;
  roomKey: string; // Edif-Aula
  building: string;
  room: string;
  description: string;
  type: string;
  capacity: number;
}

export type ScheduleCategory = 'clase' | 'asincrona' | 'preparacion' | 'refrigerio' | 'coordinador' | 'por_asignar';
export type ModalityType = 'presencial' | 'virtual';

export interface ProcessedSchedule {
  id: string;
  courseCode: string;
  courseName: string;
  activity: string;
  meetingType: string;
  block: string;
  instructor: string;
  instructorId: string;
  room: string;
  building: string;
  days: string[];
  startTime: string;
  endTime: string;
  startDate: Date;
  endDate: Date;
  career: string;
  codCarrera?: string;
  nrc: string;
  color: string;
  weeklyHours: number;
  aforo: number;
  periodo: string;
  semestre: string;
  category?: ScheduleCategory;
  isAdministrative?: boolean;
  modality?: ModalityType;
  // Cobertura temporal de Horas Extra (ver services/businessRules.ts::isTempHECoverage):
  // el bloque se muestra con tempHEInstructor pero instructor/instructorId conservan el
  // valor base ("Sin asignar") para poder revertir al llegar el titular permanente.
  tempHEActive?: boolean;
  tempHEInstructor?: string;
  tempHEInstructorId?: string;
}

export type ViewType = 'Bloque' | 'Aula' | 'Instructor' | 'Simulacion';
export type AppMode = 'landing' | 'schedule' | 'reports' | 'editor' | 'instructors_manager' | 'rooms_manager' | 'progress';

export interface TimeSlot {
  hour: number;
  label: string;
}

export interface AvailabilityWindow {
  start: string;
  end: string;
}

export interface ExportConfig {
  mode: 'individual' | 'global';
  type: ViewType;
  format: 'pdf' | 'excel';
  selectedItem?: string;
  selectedItemId?: string; // ID del instructor (cuando type === 'Instructor'), prioridad sobre el nombre
  selectedCareer?: string;
  scope: 'firstWeek' | 'allWeeks' | 'custom';
  customStartDate?: string;
  customEndDate?: string;
  logo?: string; // Base64 logo
}
export interface InstitutionalReference {
  id?: string;
  nrc: string;
  tipo: string;
  instructor_id: string;
  dia: string;
  hora_inicio: string;
  hora_fin: string;
  fecha_inicio: string;
  fecha_fin: string;
  edificio: string;
  salon: string;
  instructor_nombre: string;
  curso_nombre: string;
  bloque?: string;
  carrera?: string;
}

export interface ReconciliationResult {
  id: string; // App schedule ID
  nrc: string;
  status: 'ok' | 'discrepancy' | 'extra' | 'missing';
  errors: string[];
  reference?: InstitutionalReference;
}

export interface ExtraHoursShift {
  start: string;
  end: string;
}

export interface ExtraHoursDayShifts {
  [day: string]: {
    morning?: ExtraHoursShift;
    afternoon?: ExtraHoursShift;
  };
}

// Un tramo: rango de fechas con su propia programación de días/turnos. Un instructor
// puede tener varios tramos consecutivos con horarios de HE distintos (ej. 6 semanas con
// un patrón, luego otro patrón el resto del semestre).
export interface ExtraHoursSegment {
  id: string;
  startDate: string;
  endDate: string;
  repeatWeekly: boolean;
  shifts: ExtraHoursDayShifts;
}

export interface ExtraHoursConfig {
  segments: ExtraHoursSegment[];
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  data: {
    schedules: ProcessedSchedule[];
    metadata?: any;
    simulationConfig?: any;
    extraHoursConfig?: ExtraHoursConfig;
  };
}
