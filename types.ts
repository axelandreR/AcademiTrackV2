
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
  nrc: string;
  color: string;
  weeklyHours: number;
  aforo: number;
  periodo: string;
  semestre: string;
  category?: ScheduleCategory;
  isAdministrative?: boolean;
  modality?: ModalityType;
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
}

export interface ReconciliationResult {
  id: string; // App schedule ID
  nrc: string;
  status: 'ok' | 'discrepancy' | 'extra' | 'missing';
  errors: string[];
  reference?: InstitutionalReference;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  data: any;
}
