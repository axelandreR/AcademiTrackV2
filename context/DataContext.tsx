import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { ProcessedSchedule, RoomData, Instructor, HolidayData, InstitutionalReference, ExtraHoursConfig } from '../types';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';
import { supabase } from '../supabaseClient';
import { validateInstructorWeek } from '../services/auditService';
import { SEMESTER_START_DATE, SEMESTER_END_DATE, ACTIVE_PERIODO } from '../constants';
import { belongsToInstructor, findFuzzyNameMatches, isFuzzyNameMatch, normalizeNameKey, buildInstructorScheduleIndex, getInstructorSchedules } from '../services/businessRules';
import Toast, { ToastState } from '../components/Toast';

const mapHolidayFromDB = (h: any): HolidayData => ({
  date: parseLocalDBDate(h.date),
  name: h.name,
  description: h.description || h.type || ''
});

const mapRoomFromDB = (r: any): RoomData => ({
  roomKey: r.room_key || `${r.building}-${r.name}`,
  room: r.name || '',
  building: r.building || '',
  capacity: r.capacity || 0,
  type: r.type || 'AULA',
  career: '',
  description: ''
});

interface DataContextType {
  schedules: ProcessedSchedule[];
  administrativeTasks: ProcessedSchedule[];
  rawSchedules: ProcessedSchedule[]; // Raw data from DB (not simulation)
  rawAdministrativeTasks: ProcessedSchedule[]; // Raw data from DB (not simulation)
  searchSchedules: (query: string) => Promise<ProcessedSchedule[]>;
  rooms: RoomData[];
  instructors: Instructor[];
  holidays: HolidayData[];
  isLoading: boolean;
  hasInitialData: boolean;
  error: string | null;
  institutionalReferences: InstitutionalReference[];
  settings: Record<string, string>;
  loadSchedulesForFilter: (type: 'Instructor' | 'Aula' | 'Bloque', value: string) => Promise<void>;

  // Actions (Local state + Cloud sync wrappers would go here)
  setSchedules: React.Dispatch<React.SetStateAction<ProcessedSchedule[]>>;
  setAdministrativeTasks: React.Dispatch<React.SetStateAction<ProcessedSchedule[]>>;
  setRooms: React.Dispatch<React.SetStateAction<RoomData[]>>;
  setInstructors: React.Dispatch<React.SetStateAction<Instructor[]>>;
  setHolidays: React.Dispatch<React.SetStateAction<HolidayData[]>>;

  // Helpers
  allSchedules: ProcessedSchedule[];
  refreshData: () => Promise<void>;
  uploadSchedulesToSupabase: (data: {
    schedules: ProcessedSchedule[];
    instructors: Instructor[];
    rooms: RoomData[];
    holidays: HolidayData[];
  }, mode?: 'full' | 'delta' | 'new_period') => Promise<void>;
  uploadInstitutionalReference: (data: InstitutionalReference[]) => Promise<void>;

  exportedInstructors: Set<string>;
  toggleInstructorExported: (id: string) => void;

  // Cloud CRUD
  saveScheduleCloud: (schedule: ProcessedSchedule | ProcessedSchedule[]) => Promise<void>;
  deleteScheduleCloud: (id: string | string[]) => Promise<void>;
  saveInstructorCloud: (instructor: Instructor) => Promise<void>;
  deleteInstructorCloud: (id: string) => Promise<void>;
  bulkUpsertInstructors: (list: Instructor[]) => Promise<void>;
  saveRoomCloud: (room: RoomData) => Promise<void>;
  deleteRoomCloud: (roomKey: string) => Promise<void>;
  bulkUpsertRooms: (list: RoomData[]) => Promise<void>;
  saveAttendanceTracking: (instructorId: string, month: number, year: number) => Promise<void>;
  getAttendanceTracking: (month: number, year: number) => Promise<Set<string>>;

  // Global Summary (DEPRECATED - Will reuse if needed but primary source is now auditStatus on instructor)
  globalSchedulesSummary: ProcessedSchedule[];

  // Normalized
  instructorsMap: Record<string, Instructor>;
  instructorsByNameMap: Record<string, Instructor>;
  roomsMap: Record<string, RoomData>;
  holidaysMap: Record<string, HolidayData>;
  careersMap: Record<string, string>;

  // Simulation Mode
  isSimulationMode: boolean;
  simulationConfig: any;
  extraHoursConfig: ExtraHoursConfig | null;
  setExtraHoursConfig: (config: ExtraHoursConfig | null) => void;
  startSimulation: (instructorFilter?: string) => void;
  endSimulation: () => void;
  importScheduleToSimulation: (scheduleId: string | string[], targetInstructor: string) => number;
  applySimulation: () => Promise<void>;
  saveScenario: (name: string, description?: string, metadata?: any) => Promise<void>;
  updateScenario: (id: string, metadata?: any) => Promise<void>;
  loadScenario: (id: string) => Promise<any>;
  currentScenarioId: string | null;
  currentScenarioName: string | null;
  notify: (message: string, type?: 'success' | 'error') => void;
  recalculateInstructorAudit: (instructorName: string, currentSchedules: ProcessedSchedule[], instructorsList?: Instructor[]) => Promise<void>;
  syncInstructorIdInSchedules: (instructor: Instructor) => Promise<void>;
  updateAppSetting: (key: string, value: string) => Promise<void>;
  recalculateAllInstructorsAudit: (cutoffDate: Date) => Promise<void>;
  getAuditCutoffDate: () => Date;
  liveAuditByInstructor: Map<string, { isAuditOk: boolean; hasData: boolean; issues: { week: string; reasons: string[] }[] }>;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export const parseLocalDBDate = (dateStr: string | null | undefined): Date => {
  if (!dateStr) return new Date(NaN);

  // Extraemos solo la parte de la fecha (YYYY-MM-DD)
  // Manejamos casos con 'T' (ISO) o espacio (Postgres standard)
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.split(' ')[0];
  const parts = datePart.split('-');

  if (parts.length !== 3) return new Date(dateStr);

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  // Forzamos medianoche LOCAL. Esto evita que desfases de zona horaria
  // muevan la fecha al día anterior o siguiente al cargar.
  return new Date(year, month, day, 0, 0, 0, 0);
};

// Helper para convertir Date a string YYYY-MM-DD local
const formatDateToDB = (date: Date): string | null => {
  if (!date || isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const mapSchedFromDB = (dbItem: any): ProcessedSchedule => ({
  id: dbItem.id,
  courseCode: dbItem.course_code || '',
  courseName: dbItem.course_name || '',
  activity: dbItem.activity || '',
  meetingType: dbItem.meeting_type || '',
  block: dbItem.block || '',
  instructor: dbItem.instructor || '',
  instructorId: dbItem.instructor_id || '',
  room: dbItem.room || '',
  building: dbItem.building || '',
  days: dbItem.days || [],
  startTime: dbItem.start_time || '',
  endTime: dbItem.end_time || '',
  startDate: parseLocalDBDate(dbItem.start_date),
  endDate: parseLocalDBDate(dbItem.end_date),
  career: dbItem.career || '',
  codCarrera: dbItem.cod_carrera || '',
  nrc: dbItem.nrc || '',
  color: dbItem.color || '',
  weeklyHours: Number(dbItem.weekly_hours) || 0,
  aforo: dbItem.aforo || 0,
  periodo: dbItem.periodo || '',
  semestre: dbItem.semestre || '',
  category: dbItem.category,
  isAdministrative: Boolean(dbItem.is_administrative),
  modality: dbItem.modality
});

const mapInstructorToDB = (inst: Instructor) => ({
  id: inst.id,
  name: inst.name,
  type: inst.type,
  specialty: inst.specialty,
  max_hours: inst.maxHours,
  audit_status: inst.auditStatus,
  audit_json: inst.auditJson
});

const mapRoomToDB = (room: RoomData) => ({
  room_key: room.roomKey,
  name: room.room || '', // Usamos room como nombre
  building: room.building,
  capacity: room.capacity,
  type: room.type
  // resources: room.resources -- no existe en interface actual
});

const mapHolidayToDB = (holiday: HolidayData) => ({
  date: formatDateToDB(holiday.date),
  name: holiday.name,
  type: holiday.description || 'Feriado' // Usamos description como type en DB
});

const mapSchedToDB = (appItem: ProcessedSchedule) => ({
  id: appItem.id,
  course_code: appItem.courseCode || null,
  course_name: appItem.courseName || null,
  activity: appItem.activity || null,
  meeting_type: appItem.meetingType || null,
  block: appItem.block || null,
  instructor: appItem.instructor || null,
  instructor_id: appItem.instructorId || null,
  room: appItem.room || null,
  building: appItem.building || null,
  days: appItem.days || [],
  start_time: appItem.startTime || null,
  end_time: appItem.endTime || null,
  start_date: formatDateToDB(appItem.startDate),
  end_date: formatDateToDB(appItem.endDate),
  career: appItem.career || null,
  cod_carrera: appItem.codCarrera || null,
  nrc: appItem.nrc || null,
  color: appItem.color || null,
  weekly_hours: appItem.weeklyHours || 0,
  aforo: appItem.aforo || 0,
  periodo: appItem.periodo || null,
  semestre: appItem.semestre || null,
  category: appItem.category || null,
  is_administrative: appItem.isAdministrative === true,
  modality: appItem.modality || null
});

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [schedules, setSchedules] = useState<ProcessedSchedule[]>([]);
  const [globalSchedulesSummary, setGlobalSchedulesSummary] = useState<ProcessedSchedule[]>([]);
  const [administrativeTasks, setAdministrativeTasks] = useState<ProcessedSchedule[]>([]);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [holidays, setHolidays] = useState<HolidayData[]>([]);
  const [careers, setCareers] = useState<{ cod_carrera: string; name: string }[]>([]);
  const [institutionalReferences, setInstitutionalReferences] = useState<InstitutionalReference[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULT_SETTINGS);
  const [exportedInstructors, setExportedInstructors] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem('exportedInstructors');
    if (saved) {
      try {
        setExportedInstructors(new Set(JSON.parse(saved)));
      } catch (e) { console.error(e); }
    }
  }, []);

  const toggleInstructorExported = useCallback((id: string) => {
    setExportedInstructors(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem('exportedInstructors', JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const [isLoading, setIsLoading] = useState(true);
  const [hasInitialData, setHasInitialData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fecha límite de auditoría: hasta dónde se exige que el horario esté completo para
  // marcarlo "OK". Configurable desde Avance de Horarios (tabla app_settings); si no está
  // configurada, cae al fin de semestre real (comportamiento de siempre). Separada a
  // propósito de SEMESTER_END_DATE, que sigue controlando la grilla, los exportes y la
  // detección de conflictos — mover solo esta fecha no acorta esas otras vistas.
  const getAuditCutoffDate = useCallback((): Date => {
    const raw = settings['audit_validation_cutoff_date'];
    return raw ? parseLocalDBDate(raw) : new Date(SEMESTER_END_DATE);
  }, [settings]);

  const recalculateInstructorAudit = useCallback(async (instructorName: string, currentSchedules: ProcessedSchedule[], instructorsList?: Instructor[]) => {
    const listToUse = instructorsList || instructors;
    const inst = listToUse.find(i => i.name === instructorName || i.id === instructorName);
    if (!inst || inst.name.startsWith('INST.')) return;

    // Generar semanas del semestre (hasta la fecha límite de auditoría configurable)
    const auditCutoff = getAuditCutoffDate();
    const semesterWeeks: Date[] = [];
    let current = new Date(SEMESTER_START_DATE);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    current.setDate(diff);
    current.setHours(0, 0, 0, 0);
    while (current <= auditCutoff) {
      semesterWeeks.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }


    // El ID es la única fuente de verdad cuando el bloque lo trae; el fuzzy match por
    // nombre solo aplica a bloques legados sin ID (ver belongsToInstructor).
    const instSchedules = currentSchedules.filter(s => belongsToInstructor(inst, s));
    let totalWeeksChecked = 0;
    let weeksOk = 0;
    const auditIssues: { week: string, reasons: string[] }[] = [];

    for (const weekStart of semesterWeeks) {
      let hasHoliday = false;
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
        if (holidays.some(h => h.date.toDateString() === d.toDateString())) { hasHoliday = true; break; }
      }
      if (hasHoliday) continue;

      const validation = validateInstructorWeek(inst, weekStart, instSchedules, holidays, auditCutoff);
      totalWeeksChecked++;
      if (validation.isValid) {
        weeksOk++;
      } else {
        const weekLabel = `${weekStart.getDate().toString().padStart(2, '0')}/${(weekStart.getMonth() + 1).toString().padStart(2, '0')}`;
        auditIssues.push({ week: weekLabel, reasons: validation.reasons });
      }
    }

    const isAuditOk = totalWeeksChecked === 0 || (weeksOk === totalWeeksChecked);
    const status = isAuditOk ? 'OK' : (auditIssues.length > 0 ? 'DEFICIT' : 'PENDING');

    // Update in Supabase
    await supabase.from('instructors').update({
      audit_status: status,
      audit_json: JSON.stringify(auditIssues)
    }).eq('id', inst.id);

    // Update in local state
    setInstructors(prev => prev.map(i => i.id === inst.id ? { ...i, auditStatus: status, auditJson: JSON.stringify(auditIssues) } : i));
  }, [instructors, holidays, getAuditCutoffDate]);

  // Guarda un valor en app_settings y lo refleja de inmediato en el estado local.
  const updateAppSetting = useCallback(async (key: string, value: string) => {
    const { error } = await supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
    if (error) throw error;
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  // Recalcula la auditoría de TODOS los instructores contra una fecha límite dada, en una
  // sola pasada indexada (ver businessRules.ts) en vez de repetir un filtro completo de
  // horarios por instructor. Se usa al cambiar la fecha límite de auditoría desde Avance de
  // Horarios, para que el cambio se refleje de inmediato en todos los docentes.
  const recalculateAllInstructorsAudit = useCallback(async (cutoffDate: Date) => {
    const allCurrentSchedules = [...schedules, ...administrativeTasks];
    const index = buildInstructorScheduleIndex<ProcessedSchedule>(allCurrentSchedules);

    const weeks: Date[] = [];
    let current = new Date(SEMESTER_START_DATE);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    current.setDate(diff);
    current.setHours(0, 0, 0, 0);
    while (current <= cutoffDate) {
      weeks.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }

    const results = instructors
      .filter(inst => !inst.name.startsWith('INST.'))
      .map(inst => {
        const instSchedules = getInstructorSchedules<ProcessedSchedule>(inst, index);

        let totalWeeksChecked = 0;
        let weeksOk = 0;
        const auditIssues: { week: string, reasons: string[] }[] = [];

        for (const weekStart of weeks) {
          let hasHoliday = false;
          for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
            if (holidays.some(h => h.date.toDateString() === d.toDateString())) { hasHoliday = true; break; }
          }
          if (hasHoliday) continue;

          const validation = validateInstructorWeek(inst, weekStart, instSchedules, holidays, cutoffDate);
          totalWeeksChecked++;
          if (validation.isValid) {
            weeksOk++;
          } else {
            const weekLabel = `${weekStart.getDate().toString().padStart(2, '0')}/${(weekStart.getMonth() + 1).toString().padStart(2, '0')}`;
            auditIssues.push({ week: weekLabel, reasons: validation.reasons });
          }
        }

        const isAuditOk = totalWeeksChecked === 0 || (weeksOk === totalWeeksChecked);
        const status: 'OK' | 'DEFICIT' | 'PENDING' = isAuditOk ? 'OK' : (auditIssues.length > 0 ? 'DEFICIT' : 'PENDING');
        return { inst, status, auditJson: JSON.stringify(auditIssues) };
      });

    const payload = results.map(r => mapInstructorToDB({ ...r.inst, auditStatus: r.status, auditJson: r.auditJson }));
    const chunkSize = 500;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const { error } = await supabase.from('instructors').upsert(payload.slice(i, i + chunkSize));
      if (error) throw error;
    }

    const statusMap = new Map<string, { inst: Instructor; status: 'OK' | 'DEFICIT' | 'PENDING'; auditJson: string }>(
      results.map(r => [r.inst.id, r])
    );
    setInstructors(prev => prev.map(i => {
      const r = statusMap.get(i.id);
      return r ? { ...i, auditStatus: r.status, auditJson: r.auditJson } : i;
    }));
  }, [schedules, administrativeTasks, instructors, holidays]);

  /**
   * Vincula el ID de un instructor en bloques legados que llegaron SIN id (datos del
   * Excel antiguos o mal cargados). El ID nunca se reasigna si el bloque YA tiene uno
   * distinto: eso sería robarle el bloque a otro instructor. Tampoco se vincula si el
   * nombre del bloque es ambiguo (coincide por fuzzy match con más de un instructor del
   * catálogo, ej. dos personas con los mismos dos apellidos) — esos casos quedan sin
   * vincular para que se resuelvan manualmente en vez de asignarlos a ciegas.
   */
  const syncInstructorIdInSchedules = useCallback(async (instructor: Instructor) => {
    // 1. Solo bloques SIN id asignado (nunca tocar uno que ya pertenece a alguien más)
    const unlinkedCandidates = [...schedules, ...administrativeTasks].filter(s => {
      const hasNoId = !s.instructorId || s.instructorId.trim() === '';
      return hasNoId && isFuzzyNameMatch(instructor.name, s.instructor);
    });

    if (unlinkedCandidates.length === 0) return;

    // 2. Descartar los ambiguos: si el nombre del bloque también matchea a OTRO
    // instructor del catálogo, no hay forma segura de decidir -> se deja pendiente.
    const safeToLink = unlinkedCandidates.filter(s => {
      const otherMatches = findFuzzyNameMatches(s.instructor, instructors, instructor.id);
      if (otherMatches.length > 0) {
        console.warn(
          `[Vinculación de instructor] El bloque "${s.courseName}" (${s.id}) con nombre "${s.instructor}" ` +
          `es ambiguo entre ${instructor.name} y ${otherMatches.map(o => o.name).join(', ')}. ` +
          `Se deja SIN vincular; asígnalo manualmente para evitar un cruce.`
        );
        return false;
      }
      return true;
    });

    if (safeToLink.length === 0) return;

    console.log(`Vinculando ID ${instructor.id} para ${safeToLink.length} bloque(s) sin ID de ${instructor.name}`);

    try {
      const updatedSchedules = safeToLink.map(s => ({
        ...s,
        instructor: instructor.name, // Unificamos también el nombre al oficial
        instructorId: instructor.id
      }));

      // Update in Supabase
      const payload = updatedSchedules.map(mapSchedToDB);
      const { error } = await supabase.from('schedules').upsert(payload);
      if (error) throw error;

      // Update Local State
      const idSet = new Set(updatedSchedules.map(s => s.id));
      setSchedules(prev => prev.map(s => idSet.has(s.id) ? { ...s, instructor: instructor.name, instructorId: instructor.id } : s));
      setAdministrativeTasks(prev => prev.map(s => idSet.has(s.id) ? { ...s, instructor: instructor.name, instructorId: instructor.id } : s));

      // Recalcular auditoría tras el cambio
      recalculateInstructorAudit(instructor.name, [...schedules, ...administrativeTasks]);

    } catch (err: any) {
      console.error("Error syncing IDs:", err);
    }
  }, [schedules, administrativeTasks, instructors, recalculateInstructorAudit]);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch BASIC METADATA (Settings, Instructors, Rooms, Holidays, References)
      // DO NOT FETCH SCHEDULES HERE to improve performance.

      // Fetch App Settings
      const { data: settingsData } = await supabase.from('app_settings').select('*');
      if (settingsData && settingsData.length > 0) {
        const newSettings = { ...DEFAULT_SETTINGS };
        settingsData.forEach((s: AppSettings) => {
          newSettings[s.key] = s.value;
        });
        setSettings(newSettings);
      }

      // Fetch Holidays
      const { data: allDbHolidays, error: holError } = await supabase.from('holidays').select('*');
      if (holError) throw holError;
      if (allDbHolidays) {
        setHolidays(allDbHolidays.map(mapHolidayFromDB));
      }

      // Fetch Rooms
      const { data: allDbRooms, error: roomError } = await supabase.from('rooms').select('*');
      if (roomError) throw roomError;
      if (allDbRooms) {
        setRooms(allDbRooms.map(mapRoomFromDB));
      }

      // Fetch Careers (catálogo cod_carrera -> nombre, usado para derivar la carrera desde el BLOQUE)
      const { data: allDbCareers, error: careerError } = await supabase.from('careers').select('*');
      if (careerError) throw careerError;
      if (allDbCareers) {
        setCareers(allDbCareers);
      }

      // Fetch Instructors
      // Fetch Instructors
      let allDbInstructors: any[] = [];
      let lastCount = 0;
      let offset = 0;
      const limit = 1000;

      do {
        // Fetch including audit status from live DB
        const { data, error: instError } = await supabase
          .from('instructors')
          .select('*')
          .range(offset, offset + limit - 1);

        if (instError) throw instError;
        if (data) {
          allDbInstructors = [...allDbInstructors, ...data];
          lastCount = data.length;
          offset += limit;
        } else {
          lastCount = 0;
        }
      } while (lastCount === limit);

      if (allDbInstructors) {
        // Sort alphabetically by name to fix "desordenada" issue
        allDbInstructors.sort((a, b) => a.name.localeCompare(b.name));

        setInstructors(allDbInstructors.map(i => ({
          id: i.id,
          name: i.name,
          type: i.type as 'TC' | 'TP',
          specialty: i.specialty,
          maxHours: i.max_hours,
          campus: '',
          status: 'Activo',
          auditStatus: i.audit_status,
          auditJson: i.audit_json
        })));
      }

      // LOAD SCHEDULES FIRST to have them for audit trigger
      let allSchedulesData: any[] = [];
      let schedOffset = 0;
      let schedLimit = 1000;
      let schedLastCount = 0;
      do {
        const { data: schedData, error: schedError } = await supabase
          .from('schedules')
          .select('*')
          .eq('periodo', ACTIVE_PERIODO)
          .range(schedOffset, schedOffset + schedLimit - 1);
        if (schedError) throw schedError;
        if (schedData) {
          allSchedulesData = [...allSchedulesData, ...schedData];
          schedLastCount = schedData.length;
          schedOffset += schedLimit;
        } else {
          schedLastCount = 0;
        }
      } while (schedLastCount === schedLimit);

      const processedSchedules = allSchedulesData.map(mapSchedFromDB);
      setSchedules(processedSchedules.filter(s => !s.isAdministrative));
      setAdministrativeTasks(processedSchedules.filter(s => s.isAdministrative));
      setGlobalSchedulesSummary(processedSchedules);

      // Load Local Institutional References (No DB)
      try {
        const cachedRefs = localStorage.getItem('cached_institutional_ref');
        if (cachedRefs) {
          setInstitutionalReferences(JSON.parse(cachedRefs));
        }
      } catch (e) { console.warn("Error loading cached refs", e); }

      setHasInitialData(true);
      setIsLoading(false);

      const instructorsMapped: Instructor[] = allDbInstructors.map(i => ({
        id: i.id,
        name: i.name,
        type: i.type as 'TC' | 'TP',
        specialty: i.specialty,
        maxHours: i.max_hours,
        campus: '',
        status: 'Activo',
        auditStatus: i.audit_status,
        auditJson: i.audit_json
      }));

      setInstructors(instructorsMapped);

      setHasInitialData(true);
      setIsLoading(false);

      // Trigger Audit Sync for all if needed - PASANDO LA LISTA RECIÉN MAPADA
      const pendingNames = allDbInstructors.filter(i => !i.audit_status || i.audit_status === 'PENDING').map(i => i.name);
      pendingNames.forEach(name => {
        recalculateInstructorAudit(name, processedSchedules, instructorsMapped);
      });

    } catch (err: any) {
      console.error('Error loading initial data:', err);
      setError(err.message || 'Error al cargar datos iniciales');
      setIsLoading(false);
    }
  }, [recalculateInstructorAudit]); // Asegurar que use la versión más reciente


  const loadSchedulesForFilter = useCallback(async (type: 'Instructor' | 'Aula' | 'Bloque', value: string) => {
    // In Full Load mode, filters are now handled client-side
    return;
  }, []);

  const uploadSchedulesToSupabase = useCallback(async (data: {
    schedules: ProcessedSchedule[];
    instructors: Instructor[];
    rooms: RoomData[];
    holidays: HolidayData[];
  }, mode: 'full' | 'delta' | 'new_period' = 'full') => {
    setIsLoading(true);
    try {
      // 1. Limpieza de tablas según el modo
      // Los periodos que trae el archivo que se está cargando (normalmente uno solo,
      // ej. "202620"). Usamos esto para NUNCA borrar horarios de OTROS periodos
      // (ej. "202610") al cargar uno nuevo.
      const periodosDelArchivo = [...new Set(data.schedules.map(s => s.periodo).filter(Boolean))];

      if (mode === 'full') {
        // Reemplazo total, pero SOLO del/los periodo(s) que trae este archivo.
        // Instructores/aulas/feriados siguen siendo catálogo compartido entre periodos.
        if (periodosDelArchivo.length > 0) {
          await supabase.from('schedules').delete().in('periodo', periodosDelArchivo);
        } else {
          // Archivo sin periodo identificado: no hay forma segura de aislar el borrado,
          // así que no tocamos schedules existentes para no arriesgar otros periodos.
          console.warn('uploadSchedulesToSupabase(full): el archivo no trae "periodo" en ninguna fila; se omite el borrado de schedules existentes por seguridad.');
        }
        // Solo borramos cada catálogo si el archivo efectivamente trae reemplazo para él.
        // Archivos "solo horarios" (ej. export crudo sin hojas de Aulas/Instructores/Feriados)
        // NO deben dejar esos catálogos vacíos por venir en modo 'full'.
        if (data.instructors.length > 0) {
          await supabase.from('instructors').delete().neq('id', '_root_');
        } else {
          console.warn('uploadSchedulesToSupabase(full): el archivo no trae instructores; se omite el borrado del catálogo de instructores.');
        }
        if (data.rooms.length > 0) {
          await supabase.from('rooms').delete().neq('room_key', '_root_');
        } else {
          console.warn('uploadSchedulesToSupabase(full): el archivo no trae aulas; se omite el borrado del catálogo de aulas.');
        }
        if (data.holidays.length > 0) {
          await supabase.from('holidays').delete().neq('name', '_root_');
        } else {
          console.warn('uploadSchedulesToSupabase(full): el archivo no trae feriados; se omite el borrado del catálogo de feriados.');
        }
      } else if (mode === 'new_period') {
        // Carga de un periodo académico nuevo: reemplaza TODA la programación académica
        // de ese periodo (a diferencia de delta, no depende de qué NRC trae el archivo,
        // así que no deja NRC huérfanos de una carga parcial/anterior). Nunca toca
        // instructores/aulas/feriados ni las tareas administrativas ya creadas para ese periodo.
        if (periodosDelArchivo.length > 0) {
          await supabase.from('schedules')
            .delete()
            .in('periodo', periodosDelArchivo)
            .eq('is_administrative', false);
        } else {
          console.warn('uploadSchedulesToSupabase(new_period): el archivo no trae "periodo" en ninguna fila; se omite el borrado por seguridad.');
        }
      } else {
        // Modo Delta (NRC + Periodo): Solo borramos los NRC de ESE periodo que vienen en el nuevo archivo
        const nrcsToRootOut = [...new Set(data.schedules.map(s => s.nrc).filter(Boolean))];
        if (nrcsToRootOut.length > 0 && periodosDelArchivo.length > 0) {
          // Solo borramos clases académicas (no administrativas) para esos NRC, y solo
          // dentro de los periodos del archivo (evita pisar el mismo NRC de otro periodo)
          await supabase.from('schedules')
            .delete()
            .in('nrc', nrcsToRootOut)
            .in('periodo', periodosDelArchivo)
            .eq('is_administrative', false);
        }
      }

      // 2. Preparar Payloads
      const schedPayload = data.schedules.map(mapSchedToDB);
      const instPayload = data.instructors.map(mapInstructorToDB);
      const roomPayload = data.rooms.map(mapRoomToDB);
      const holidayPayload = data.holidays.map(mapHolidayToDB);

      // 3. Inserciones Masivas
      if (mode === 'full') {
        if (instPayload.length > 0) await supabase.from('instructors').upsert(instPayload);
        if (roomPayload.length > 0) await supabase.from('rooms').upsert(roomPayload);
        if (holidayPayload.length > 0) await supabase.from('holidays').upsert(holidayPayload);
      } else {
        // En modo delta / new_period, solo añadimos instructores/salas si no existen (Upsert por ID/Key)
        if (instPayload.length > 0) await supabase.from('instructors').upsert(instPayload, { onConflict: 'id' });
        if (roomPayload.length > 0) await supabase.from('rooms').upsert(roomPayload, { onConflict: 'room_key' });
        if (holidayPayload.length > 0) await supabase.from('holidays').upsert(holidayPayload, { onConflict: 'name' });
      }

      // Dividir schedules en bloques de 500 para evitar timeout en cargas pesadas
      const chunkSize = 500;
      for (let i = 0; i < schedPayload.length; i += chunkSize) {
        const chunk = schedPayload.slice(i, i + chunkSize);
        const { error: batchError } = await supabase.from('schedules').upsert(chunk);
        if (batchError) throw batchError;
      }


      // 4. Actualizar Estado Local
      await refreshData();
      alert('Base de Datos actualizada correctamente en la nube.');
    } catch (err: any) {
      console.error("Error uploading to Supabase:", err);
      alert('Hubo un error al sincronizar con la nube: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [refreshData]);

  const uploadInstitutionalReference = useCallback(async (data: InstitutionalReference[]) => {
    setIsLoading(true);
    try {
      // Version Local: Guardamos en estado y en LocalStorage para persistencia básica sin BD
      setInstitutionalReferences(data);
      try {
        // Intentamos guardar en localStorage (puede fallar si es muy grande, manejamos el error)
        localStorage.setItem('cached_institutional_ref', JSON.stringify(data));
      } catch (e) {
        console.warn("No se pudo persistir en localStorage (posiblemente quota excedida), pero funcionará en esta sesión.");
      }

      alert('Referencia institucional cargada localmente para validación.');
    } catch (err: any) {
      console.error("Error setting institutional reference:", err);
      alert('Error: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveScheduleCloud = useCallback(async (newData: ProcessedSchedule | ProcessedSchedule[]) => {
    // 1. Preparar items y payload
    const items = Array.isArray(newData) ? newData : [newData];
    try {
      const payload = items.map(mapSchedToDB);
      const { error } = await supabase.from('schedules').upsert(payload);
      if (error) throw error;

      // 2. Actualizar estado local inmediatamente SIN refetch
      // Separamos los items en académicos y administrativos
      const newAcademic = items.filter(s => !s.isAdministrative);
      const newAdmin = items.filter(s => s.isAdministrative);

      if (newAcademic.length > 0) {
        setSchedules(prev => {
          const ids = new Set(newAcademic.map(i => i.id));
          const filtered = prev.filter(p => !ids.has(p.id));
          return [...filtered, ...newAcademic];
        });
      }

      if (newAdmin.length > 0) {
        setAdministrativeTasks(prev => {
          const ids = new Set(newAdmin.map(i => i.id));
          const filtered = prev.filter(p => !ids.has(p.id));
          return [...filtered, ...newAdmin];
        });
      }

      setHasInitialData(true);

      // Auto-Audit Trigger
      // `schedules`/`administrativeTasks` son closures desactualizadas (el setState de
      // arriba aún no se reflejó en ellas). Si `items` edita un registro que YA existe en
      // esas listas (mismo id), sin deduplicar quedaban AMBAS versiones — la vieja del
      // closure y la nueva de `items` — en el array que recibe recalculateInstructorAudit,
      // duplicando esas horas para esa semana (mismo patrón de bug que "Individualizar").
      // Se filtra por id cualquier copia desactualizada antes de sumar `items` (la versión
      // recién guardada), igual que ya se hace arriba para setSchedules/setAdministrativeTasks.
      const itemIds = new Set(items.map(i => i.id));
      const auditSchedules = [
        ...schedules.filter(s => !itemIds.has(s.id)),
        ...administrativeTasks.filter(s => !itemIds.has(s.id)),
        ...items
      ];
      const affectedInstructors = new Set(items.map(i => i.instructor));
      affectedInstructors.forEach(name => {
        recalculateInstructorAudit(name, auditSchedules);
      });
    } catch (err: any) {
      console.error("Error saving to Supabase:", err);
      alert('Error al guardar en la nube: ' + err.message);
    }
  }, [schedules, administrativeTasks, recalculateInstructorAudit]);

  const deleteScheduleCloud = useCallback(async (id: string | string[]) => {
    const ids = Array.isArray(id) ? id : [id];
    try {
      const { error } = await supabase.from('schedules').delete().in('id', ids);
      if (error) throw error;

      // Actualizar estado local eliminando los IDs
      const idSet = new Set(ids);
      const affectedInstructors = new Set([...schedules, ...administrativeTasks].filter(s => idSet.has(s.id)).map(s => s.instructor));

      setSchedules(prev => prev.filter(s => !idSet.has(s.id)));
      setAdministrativeTasks(prev => prev.filter(s => !idSet.has(s.id)));

      // Trigger recalculation after state update (using current snapshots)
      const remainingSchedules = [...schedules, ...administrativeTasks].filter(s => !idSet.has(s.id));
      affectedInstructors.forEach(name => {
        recalculateInstructorAudit(name, remainingSchedules);
      });
    } catch (err: any) {
      console.error("Error deleting from Supabase:", err);
      alert('Error al eliminar de la nube: ' + err.message);
    }
  }, [schedules, administrativeTasks, recalculateInstructorAudit]);

  const saveInstructorCloud = useCallback(async (inst: Instructor) => {
    try {
      const dbInst = mapInstructorToDB(inst);
      const { error } = await supabase.from('instructors').upsert(dbInst);
      if (error) throw error;

      // Actualizar localmente
      setInstructors(prev => {
        const index = prev.findIndex(i => i.id === inst.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = inst;
          return next;
        }
        return [...prev, inst];
      });

      // SINCRONIZACIÓN AUTOMÁTICA: Si el instructor es guardado/actualizado, buscamos su carga
      // Esto soluciona la "mala mezcla" de datos de instructores nuevos
      await syncInstructorIdInSchedules(inst);

    } catch (err: any) {
      console.error("Error saving instructor to Supabase:", err);
      alert('Error al guardar instructor: ' + err.message);
    }
  }, [syncInstructorIdInSchedules]);

  const deleteInstructorCloud = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('instructors').delete().eq('id', id);
      if (error) throw error;

      setInstructors(prev => prev.filter(i => i.id !== id));
    } catch (err: any) {
      console.error("Error deleting instructor from Supabase:", err);
      alert('Error al eliminar instructor: ' + err.message);
    }
  }, []);

  // Carga masiva (upsert) de instructores, ej. desde el Excel dedicado de InstructorsPage.
  // Nunca borra: solo agrega nuevos o actualiza existentes por ID.
  const bulkUpsertInstructors = useCallback(async (list: Instructor[]) => {
    if (list.length === 0) return;
    try {
      const payload = list.map(mapInstructorToDB);
      const { error } = await supabase.from('instructors').upsert(payload, { onConflict: 'id' });
      if (error) throw error;

      setInstructors(prev => {
        const map = new Map(prev.map(i => [i.id, i]));
        list.forEach(i => map.set(i.id, i));
        return Array.from(map.values());
      });
    } catch (err: any) {
      console.error("Error en carga masiva de instructores:", err);
      alert('Error al cargar instructores: ' + err.message);
      throw err;
    }
  }, []);

  const saveRoomCloud = useCallback(async (room: RoomData) => {
    try {
      const dbRoom = mapRoomToDB(room);
      const { error } = await supabase.from('rooms').upsert(dbRoom, { onConflict: 'room_key' });
      if (error) throw error;

      setRooms(prev => {
        const index = prev.findIndex(r => r.roomKey === room.roomKey);
        if (index >= 0) {
          const next = [...prev];
          next[index] = room;
          return next;
        }
        return [...prev, room];
      });
    } catch (err: any) {
      console.error("Error saving room to Supabase:", err);
      alert('Error al guardar ambiente: ' + err.message);
    }
  }, []);

  const deleteRoomCloud = useCallback(async (roomKey: string) => {
    try {
      const { error } = await supabase.from('rooms').delete().eq('room_key', roomKey);
      if (error) throw error;

      setRooms(prev => prev.filter(r => r.roomKey !== roomKey));
    } catch (err: any) {
      console.error("Error deleting room from Supabase:", err);
      alert('Error al eliminar ambiente: ' + err.message);
    }
  }, []);

  // Carga masiva (upsert) de aulas, ej. desde el Excel dedicado de RoomsPage.
  // Nunca borra: solo agrega nuevas o actualiza existentes por roomKey.
  const bulkUpsertRooms = useCallback(async (list: RoomData[]) => {
    if (list.length === 0) return;
    try {
      const payload = list.map(mapRoomToDB);
      const { error } = await supabase.from('rooms').upsert(payload, { onConflict: 'room_key' });
      if (error) throw error;

      setRooms(prev => {
        const map = new Map(prev.map(r => [r.roomKey, r]));
        list.forEach(r => map.set(r.roomKey, r));
        return Array.from(map.values());
      });
    } catch (err: any) {
      console.error("Error en carga masiva de aulas:", err);
      alert('Error al cargar aulas: ' + err.message);
      throw err;
    }
  }, []);

  const saveAttendanceTracking = useCallback(async (instructorId: string, month: number, year: number) => {
    try {
      const { error } = await supabase
        .from('attendance_tracking')
        .upsert({
          instructor_id: instructorId,
          period_month: month,
          period_year: year
        }, { onConflict: 'instructor_id,period_month,period_year' });

      if (error) throw error;
    } catch (err: any) {
      console.error("Error saving attendance tracking:", err);
    }
  }, []);

  const getAttendanceTracking = useCallback(async (month: number, year: number): Promise<Set<string>> => {
    try {
      const { data, error } = await supabase
        .from('attendance_tracking')
        .select('instructor_id')
        .eq('period_month', month)
        .eq('period_year', year);

      if (error) throw error;
      return new Set((data || []).map(item => item.instructor_id));
    } catch (err: any) {
      console.error("Error fetching attendance tracking:", err);
      return new Set();
    }
  }, []);


  // Carga inicial
  useEffect(() => {
    refreshData();
  }, []);

  // Simulation State
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [simulationSchedules, setSimulationSchedules] = useState<ProcessedSchedule[]>([]);
  const [simulationAdmin, setSimulationAdmin] = useState<ProcessedSchedule[]>([]);
  const [simulationConfig, setSimulationConfig] = useState<any>({});
  const [extraHoursConfig, setExtraHoursConfig] = useState<ExtraHoursConfig | null>(null);
  // Escenario guardado del que proviene la simulación actual (si se cargó uno con
  // loadScenario, o si ya se guardó una vez en esta sesión) — permite que "Guardar
  // Escenario" ofrezca actualizar el mismo registro en vez de crear uno nuevo siempre.
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [currentScenarioName, setCurrentScenarioName] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  // Persistencia de HE aislada por instructor. Antes había un efecto separado que
  // recargaba automáticamente desde localStorage cada vez que cambiaba
  // simulationConfig.instructorFilter — eso competía con loadScenario (que también
  // setea extraHoursConfig, con el valor guardado en el escenario) y podía pisar el
  // valor recién restaurado con una versión vieja de localStorage del mismo instructor.
  // Ahora cada punto de entrada (startSimulation / loadScenario) decide explícitamente
  // el valor correcto, sin un efecto reactivo de por medio.
  //
  // La clave preferimos por ID de instructor (estable) en vez de nombre crudo, para
  // no colisionar entre instructores homónimos; instructorKey cae a instructorFilter
  // (nombre) para escenarios guardados antes de este cambio, que no lo tienen.
  useEffect(() => {
    const key = simulationConfig?.instructorKey || simulationConfig?.instructorFilter;
    if (isSimulationMode && key && extraHoursConfig) {
      localStorage.setItem(`extraHoursConfig_${key}`, JSON.stringify(extraHoursConfig));
    }
  }, [extraHoursConfig, isSimulationMode, simulationConfig?.instructorKey, simulationConfig?.instructorFilter]);

  const startSimulation = useCallback((instructorFilter?: string) => {
    console.log("Starting Simulation...");
    try {
      // Deep copy using JSON to break all references, then restore Dates
      const clone = (items: ProcessedSchedule[]) => {
        const deepCopy = JSON.parse(JSON.stringify(items));
        return deepCopy.map((s: any) => ({
          ...s,
          startDate: new Date(s.startDate),
          endDate: new Date(s.endDate)
        }));
      };

      let schedulesToClone = schedules;
      let adminToClone = administrativeTasks;

      if (instructorFilter) {
        // Filter data for specific instructor. Buscamos el objeto Instructor real para
        // poder usar belongsToInstructor (prioriza ID); si no lo encontramos en el
        // catálogo, caemos a comparación de nombre como último recurso.
        const instObj = instructors.find(i => normalizeNameKey(i.name) === normalizeNameKey(instructorFilter));
        const matchesFilter = (s: ProcessedSchedule) => instObj ? belongsToInstructor(instObj, s) : s.instructor === instructorFilter;
        schedulesToClone = schedules.filter(matchesFilter);
        adminToClone = administrativeTasks.filter(matchesFilter);
        // Set configuration to ignore audit alerts for this focused simulation.
        // instructorKey identifica al instructor por ID cuando lo tenemos (evita
        // colisiones entre homónimos en localStorage); si no, cae al nombre.
        const instructorKey = instObj?.id || instructorFilter;
        setSimulationConfig({ instructorFilter, instructorKey, ignoreAudit: true });

        // Cargar la plantilla de Horas Extra guardada para este instructor (si existe).
        // Se hace explícito aquí, en vez de un efecto reactivo separado, para que no
        // compita con loadScenario al restaurar un escenario guardado.
        const savedHE = localStorage.getItem(`extraHoursConfig_${instructorKey}`);
        if (savedHE) {
          try {
            setExtraHoursConfig(JSON.parse(savedHE));
          } catch (e) {
            console.error(`Error loading HE for ${instructorKey}:`, e);
            setExtraHoursConfig(null);
          }
        } else {
          setExtraHoursConfig(null);
        }
      } else {
        // Global simulation (standard behavior) — sin instructor específico no hay
        // dónde persistir la plantilla de HE, se empieza limpio.
        setSimulationConfig({ ignoreAudit: true });
        setExtraHoursConfig(null);
      }

      setSimulationSchedules(clone(schedulesToClone));
      setSimulationAdmin(clone(adminToClone));
      setIsSimulationMode(true);
      // Simulación nueva, no proviene de ningún escenario guardado — "Guardar
      // Escenario" debe ofrecer crear uno nuevo directamente, sin la opción de
      // "actualizar" (no hay a qué escenario actualizar todavía).
      setCurrentScenarioId(null);
      setCurrentScenarioName(null);
    } catch (e: any) {
      console.error("Error starting simulation:", e);
      notify("Error al iniciar simulación: " + e.message, 'error');
    }
  }, [schedules, administrativeTasks, notify]);

  const endSimulation = useCallback(() => {
    setIsSimulationMode(false);
    setSimulationSchedules([]);
    setSimulationAdmin([]);
    setExtraHoursConfig(null);
    setSimulationConfig({});
    setCurrentScenarioId(null);
    setCurrentScenarioName(null);
  }, []);

  // Acepta uno o varios IDs a la vez — un NRC suele tener más de una fila real (distintos
  // días/horarios), así que "importar el NRC" trae TODAS sus sesiones en un solo llamado
  // en vez de obligar a repetir la acción fila por fila y arriesgarse a dejar alguna
  // atrás. Devuelve cuántas sesiones se importaron con éxito.
  const importScheduleToSimulation = useCallback((scheduleId: string | string[], targetInstructor: string): number => {
    const ids = Array.isArray(scheduleId) ? scheduleId : [scheduleId];
    const archive = [...schedules, ...administrativeTasks];
    const targetInstData = instructors.find(i => i.name === targetInstructor);
    const targetId = targetInstData ? targetInstData.id : '';

    const newAcad: ProcessedSchedule[] = [];
    const newAdmin: ProcessedSchedule[] = [];

    ids.forEach((id, idx) => {
      const source = archive.find(s => s.id === id);
      if (!source) return;

      const clone = JSON.parse(JSON.stringify(source));
      const newSchedule: ProcessedSchedule = {
        ...clone,
        // Sufijo de índice para que dos sesiones del mismo NRC importadas en el mismo
        // milisegundo no colisionen en id.
        id: `sim-imported-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
        instructor: targetInstructor,
        instructorId: targetId,
        startDate: new Date(source.startDate),
        endDate: new Date(source.endDate)
      };

      if (newSchedule.isAdministrative) newAdmin.push(newSchedule);
      else newAcad.push(newSchedule);
    });

    if (newAcad.length === 0 && newAdmin.length === 0) {
      notify("No se encontró el horario original en el archivo.", 'error');
      return 0;
    }

    if (newAcad.length > 0) setSimulationSchedules(prev => [...prev, ...newAcad]);
    if (newAdmin.length > 0) setSimulationAdmin(prev => [...prev, ...newAdmin]);

    return newAcad.length + newAdmin.length;
  }, [schedules, administrativeTasks, instructors, notify]);

  // La confirmación previa (acción irreversible: escribe en la BD real) vive en el
  // componente que la dispara — components/SimulationBar.tsx — para poder usar el modal
  // propio de la app (ConfirmDialog) en vez del window.confirm nativo del navegador.
  const applySimulation = useCallback(async () => {
    setIsLoading(true);
    try {
      // Alcance real a comparar: si la simulación está filtrada a un instructor
      // (startSimulation con instructorFilter), 'simulationSchedules'/'simulationAdmin'
      // SOLO contienen los horarios de ESE instructor. Comparar contra TODOS los
      // horarios reales del sistema borraría los de todos los demás instructores
      // (todo lo que no está en la simulación se interpreta como "eliminado").
      // Por eso acotamos 'realItems' al mismo subconjunto que usó startSimulation,
      // usando el mismo matching (ID prioritario, nombre como último recurso).
      const instructorFilter = simulationConfig?.instructorFilter;
      let realItems: ProcessedSchedule[] = [...schedules, ...administrativeTasks];
      if (instructorFilter) {
        const instObj = instructors.find(i => normalizeNameKey(i.name) === normalizeNameKey(instructorFilter));
        const matchesFilter = (s: ProcessedSchedule) => instObj ? belongsToInstructor(instObj, s) : s.instructor === instructorFilter;
        realItems = realItems.filter(matchesFilter);
      }

      const realIds = new Set(realItems.map(s => s.id));
      const simIds = new Set([...simulationSchedules, ...simulationAdmin].map(s => s.id));

      const toDelete = [...realIds].filter(id => !simIds.has(id));
      const toUpsert = [...simulationSchedules, ...simulationAdmin]; // We update EVERYTHING to be safe

      // Execute Deletions
      if (toDelete.length > 0) {
        await supabase.from('schedules').delete().in('id', toDelete);
      }

      // Execute Upserts (Chunked)
      const payload = toUpsert.map(mapSchedToDB);
      const chunkSize = 500;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const { error } = await supabase.from('schedules').upsert(payload.slice(i, i + chunkSize));
        if (error) throw error;
      }

      // Actualizar el estado local: fusionar (quitar lo borrado, reemplazar/agregar lo
      // subido), NO reemplazar todo el arreglo — de lo contrario una simulación filtrada
      // borraría del estado local (aunque no de la BD) a todos los demás instructores.
      const deletedSet = new Set(toDelete);
      const upsertAcadIds = new Set(simulationSchedules.map(s => s.id));
      const upsertAdminIds = new Set(simulationAdmin.map(s => s.id));

      setSchedules(prev => [
        ...prev.filter(s => !deletedSet.has(s.id) && !upsertAcadIds.has(s.id)),
        ...simulationSchedules
      ]);
      setAdministrativeTasks(prev => [
        ...prev.filter(s => !deletedSet.has(s.id) && !upsertAdminIds.has(s.id)),
        ...simulationAdmin
      ]);

      // Exit Simulation
      endSimulation();
      notify("Simulación aplicada correctamente.", 'success');

    } catch (e: any) {
      console.error("Error applying simulation:", e);
      notify("Error al aplicar simulación: " + e.message, 'error');
      // El borrado y/o algunos chunks de upsert pudieron haberse aplicado ya en la BD
      // real antes de fallar; resincronizamos el estado local con lo que realmente
      // quedó guardado en vez de dejarlo desactualizado.
      await refreshData();
    } finally {
      setIsLoading(false);
    }
  }, [schedules, administrativeTasks, simulationSchedules, simulationAdmin, simulationConfig, instructors, refreshData, notify]);

  // Intercept Cloud Functions
  const saveScheduleCloudWrapper = useCallback(async (items: ProcessedSchedule | ProcessedSchedule[]) => {
    if (isSimulationMode) {
      const newItems = Array.isArray(items) ? items : [items];
      // Update Simulation State Only
      // Split Academic / Admin
      const newAcad = newItems.filter(i => !i.isAdministrative);
      const newAdmin = newItems.filter(i => i.isAdministrative);

      if (newAcad.length > 0) {
        setSimulationSchedules(prev => {
          const ids = new Set(newAcad.map(i => i.id));
          return [...prev.filter(p => !ids.has(p.id)), ...newAcad];
        });
      }
      if (newAdmin.length > 0) {
        setSimulationAdmin(prev => {
          const ids = new Set(newAdmin.map(i => i.id));
          return [...prev.filter(p => !ids.has(p.id)), ...newAdmin];
        });
      }
      return;
    }
    // Normal Mode
    return saveScheduleCloud(items);
  }, [isSimulationMode, saveScheduleCloud]);

  const deleteScheduleCloudWrapper = useCallback(async (id: string | string[]) => {
    if (isSimulationMode) {
      const ids = new Set(Array.isArray(id) ? id : [id]);
      setSimulationSchedules(prev => prev.filter(s => !ids.has(s.id)));
      setSimulationAdmin(prev => prev.filter(s => !ids.has(s.id)));
      return;
    }
    return deleteScheduleCloud(id);
  }, [isSimulationMode, deleteScheduleCloud]);

  const saveScenario = useCallback(async (name: string, description: string = '', metadata: any = null) => {
    try {
      const scenarioData = [...simulationSchedules, ...simulationAdmin];
      const payload = {
        schedules: scenarioData,
        metadata,
        simulationConfig, // Save the current config (including ignoreAudit)
        extraHoursConfig // Save extra hours config
      };

      const { data, error } = await supabase.from('scenarios').insert({
        name,
        description,
        data: payload,
      }).select('id').single();
      if (error) throw error;
      // A partir de ahora esta simulación "pertenece" al escenario recién creado —
      // el siguiente "Guardar Escenario" puede actualizarlo en vez de crear otro más.
      setCurrentScenarioId(data?.id ?? null);
      setCurrentScenarioName(name);
      notify('Escenario guardado exitosamente.', 'success');
    } catch (e: any) {
      console.error('Error saving scenario:', e);
      notify('Error al guardar escenario: ' + e.message, 'error');
    }
  }, [simulationSchedules, simulationAdmin, simulationConfig, extraHoursConfig, notify]);

  // Actualiza el MISMO registro de escenario (en vez de crear uno nuevo) — para cuando
  // el usuario carga un escenario guardado, sigue editando la simulación, y quiere
  // guardar esos cambios en el mismo lugar. created_at se refresca a "ahora" a falta de
  // una columna updated_at, para que la lista lo muestre como el más reciente.
  const updateScenario = useCallback(async (id: string, metadata: any = null) => {
    try {
      const scenarioData = [...simulationSchedules, ...simulationAdmin];
      const payload = {
        schedules: scenarioData,
        metadata,
        simulationConfig,
        extraHoursConfig
      };

      const { error } = await supabase
        .from('scenarios')
        .update({ data: payload, created_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      notify('Escenario actualizado exitosamente.', 'success');
    } catch (e: any) {
      console.error('Error updating scenario:', e);
      notify('Error al actualizar escenario: ' + e.message, 'error');
    }
  }, [simulationSchedules, simulationAdmin, simulationConfig, extraHoursConfig, notify]);

  const loadScenario = useCallback(async (scenarioId: string) => {
    try {
      const { data, error } = await supabase.from('scenarios').select('*').eq('id', scenarioId).single();
      if (error) throw error;
      if (data) {
        let loadedSchedules: any[] = [];
        let loadedConfig: any = { ignoreAudit: false };

        if (Array.isArray(data.data)) {
          loadedSchedules = data.data;
        } else if (data.data && Array.isArray(data.data.schedules)) {
          loadedSchedules = data.data.schedules;
          if (data.data.simulationConfig) {
            loadedConfig = data.data.simulationConfig;
          }
        }

        const parsed = loadedSchedules.map((s: any) => ({
          ...s,
          startDate: new Date(s.startDate),
          endDate: new Date(s.endDate)
        }));

        setSimulationSchedules(parsed.filter(s => !s.isAdministrative));
        setSimulationAdmin(parsed.filter(s => s.isAdministrative));
        setSimulationConfig(loadedConfig); // Restore config
        // Siempre explícito (incluso a null): el escenario es la fuente de verdad para
        // su propia plantilla de HE — si no tenía una guardada, no debe quedar visible
        // la de una simulación anterior para el mismo instructor en este navegador.
        setExtraHoursConfig(data.data?.extraHoursConfig ?? null);
        setIsSimulationMode(true);
        setCurrentScenarioId(data.id);
        setCurrentScenarioName(data.name);
        return data.data?.metadata;
      }
    } catch (e: any) {
      console.error('Error loading scenario:', e);
      notify('Error al cargar escenario: ' + e.message, 'error');
    }
  }, [notify]);

  const searchSchedules = useCallback(async (query: string): Promise<ProcessedSchedule[]> => {
    if (!query || query.length < 3) return [];

    // We search only in 'schedules' table (academic). If needed, we could union with 'administrative_tasks' but usually people import courses.
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('periodo', ACTIVE_PERIODO)
      .or(`nrc.ilike.%${query}%,course_name.ilike.%${query}%,course_code.ilike.%${query}%`)
      .limit(30);

    if (error) {
      console.error("Error searching schedules", error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      nrc: row.nrc,
      courseName: row.course_name,
      courseCode: row.course_code,
      days: row.days || [],
      startTime: row.start_time,
      endTime: row.end_time,
      startDate: new Date(row.start_date),
      endDate: new Date(row.end_date),
      modality: row.modality,
      instructor: row.instructor,
      instructorId: row.instructor_id,
      semester: row.semester,
      campus: row.campus,
      career: row.career,
      building: row.building,
      room: row.room,
      block: row.block,
      isAdministrative: false,
      // Default / Derived fields
      activity: 'DOCENCIA',
      meetingType: row.modality === 'VIRTUAL' ? 'VIRTUAL' : 'PRESENCIAL',
      color: 'bg-blue-100 border-blue-200 text-blue-700',
      weeklyHours: 0, // Will be recalculated if needed, or I can calc it here
      totalHours: 0,
      dailyHours: 0
    } as unknown as ProcessedSchedule));
  }, []);

  const allSchedules = React.useMemo(() => {
    if (isSimulationMode) return [...simulationSchedules, ...simulationAdmin];
    return [...schedules, ...administrativeTasks];
  }, [schedules, administrativeTasks, isSimulationMode, simulationSchedules, simulationAdmin]);

  // Estado de auditoría EN VIVO por instructor (mismo motor que la grilla y el Reporte
  // Global — ver services/auditCalculations.ts::calculateWeeklyAudit vía validateInstructorWeek).
  // Vive aquí en el Provider (que envuelve TODAS las rutas sin desmontarse, ver App.tsx) en
  // vez de duplicarse en ProgressPanel.tsx y AttendancePage.tsx como antes: así el costo
  // (~261 instructores × semanas del semestre) se paga UNA vez y sobrevive la navegación
  // entre "Avance de Horarios" y "Fichas de Asistencia", en vez de recalcularse desde cero
  // cada vez que se entra a cada pantalla.
  const liveAuditIndex = React.useMemo(() => buildInstructorScheduleIndex<ProcessedSchedule>(allSchedules), [allSchedules]);

  const liveAuditSemesterWeeks = React.useMemo(() => {
    const cutoff = getAuditCutoffDate();
    const weeks: Date[] = [];
    let current = new Date(SEMESTER_START_DATE);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    current.setDate(diff);
    current.setHours(0, 0, 0, 0);
    while (current <= cutoff) {
      weeks.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }
    return weeks;
  }, [getAuditCutoffDate]);

  const liveAuditByInstructor = React.useMemo(() => {
    const map = new Map<string, { isAuditOk: boolean; hasData: boolean; issues: { week: string; reasons: string[] }[] }>();
    const cutoff = getAuditCutoffDate();
    instructors.forEach(inst => {
      if (inst.name.startsWith('INST.')) return;
      const instSchedules = getInstructorSchedules<ProcessedSchedule>(inst, liveAuditIndex);
      if (instSchedules.length === 0) {
        map.set(inst.id, { isAuditOk: false, hasData: false, issues: [] });
        return;
      }

      let totalWeeksChecked = 0;
      let weeksOk = 0;
      const issues: { week: string; reasons: string[] }[] = [];

      for (const weekStart of liveAuditSemesterWeeks) {
        let hasHoliday = false;
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
          if (holidays.some(h => h.date.toDateString() === d.toDateString())) { hasHoliday = true; break; }
        }
        if (hasHoliday) continue;

        const validation = validateInstructorWeek(inst, weekStart, instSchedules, holidays, cutoff);
        totalWeeksChecked++;
        if (validation.isValid) {
          weeksOk++;
        } else {
          const weekLabel = `${weekStart.getDate().toString().padStart(2, '0')}/${(weekStart.getMonth() + 1).toString().padStart(2, '0')}`;
          issues.push({ week: weekLabel, reasons: validation.reasons });
        }
      }

      const isAuditOk = totalWeeksChecked === 0 || weeksOk === totalWeeksChecked;
      map.set(inst.id, { isAuditOk, hasData: true, issues });
    });
    return map;
  }, [instructors, liveAuditIndex, liveAuditSemesterWeeks, holidays, getAuditCutoffDate]);

  // Mapas normalizados para acceso O(1) (antes estaban como useMemo inline dentro del
  // objeto value, lo que dificultaba memoizar el value completo).
  const instructorsMap = React.useMemo(() => {
    const map: Record<string, Instructor> = {};
    instructors.forEach(inst => { map[inst.id] = inst; });
    return map;
  }, [instructors]);

  const instructorsByNameMap = React.useMemo(() => {
    const map: Record<string, Instructor> = {};
    instructors.forEach(inst => { map[normalizeNameKey(inst.name)] = inst; });
    return map;
  }, [instructors]);

  const roomsMap = React.useMemo(() => {
    const map: Record<string, RoomData> = {};
    rooms.forEach(room => { map[room.roomKey] = room; });
    return map;
  }, [rooms]);

  const holidaysMap = React.useMemo(() => {
    const map: Record<string, HolidayData> = {};
    holidays.forEach(h => { map[h.date.toDateString()] = h; });
    return map;
  }, [holidays]);

  const careersMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    careers.forEach(c => { map[c.cod_carrera] = c.name; });
    return map;
  }, [careers]);

  // Value memoizado: antes se creaba un objeto nuevo en CADA render del Provider, lo que
  // forzaba re-render de TODOS los consumidores de useData() ante cualquier cambio de
  // estado interno, aunque el dato que a ese consumidor le importa no hubiera cambiado.
  const contextValue = React.useMemo(() => ({
    // If Simulation Mode, we hijack the exposed state so standard components consume the simulation data.
    schedules: isSimulationMode ? simulationSchedules : schedules,
    administrativeTasks: isSimulationMode ? simulationAdmin : administrativeTasks,
    // Provide raw access for search features
    rawSchedules: schedules,
    rawAdministrativeTasks: administrativeTasks,
    searchSchedules,

    rooms, instructors, holidays, institutionalReferences,
    isLoading, hasInitialData, error,

    setSchedules, setAdministrativeTasks,
    setRooms, setInstructors, setHolidays,
    refreshData, uploadSchedulesToSupabase,

    saveScheduleCloud: saveScheduleCloudWrapper,
    deleteScheduleCloud: deleteScheduleCloudWrapper,

    saveInstructorCloud, deleteInstructorCloud, bulkUpsertInstructors,
    saveRoomCloud, deleteRoomCloud, bulkUpsertRooms,
    saveAttendanceTracking, getAttendanceTracking,
    uploadInstitutionalReference,
    allSchedules, exportedInstructors, toggleInstructorExported,
    instructorsMap, instructorsByNameMap, roomsMap, holidaysMap, careersMap,
    settings,
    loadSchedulesForFilter,
    globalSchedulesSummary: isSimulationMode ? allSchedules : globalSchedulesSummary,

    isSimulationMode,
    simulationConfig,
    extraHoursConfig,
    setExtraHoursConfig,
    startSimulation,
    endSimulation,
    importScheduleToSimulation,
    applySimulation,
    saveScenario,
    updateScenario,
    loadScenario,
    currentScenarioId,
    currentScenarioName,
    recalculateInstructorAudit,
    syncInstructorIdInSchedules,
    updateAppSetting,
    recalculateAllInstructorsAudit,
    getAuditCutoffDate,
    liveAuditByInstructor,
    notify
  }), [
    isSimulationMode, simulationSchedules, schedules, simulationAdmin, administrativeTasks,
    searchSchedules, rooms, instructors, holidays, institutionalReferences,
    isLoading, hasInitialData, error, refreshData, uploadSchedulesToSupabase,
    saveScheduleCloudWrapper, deleteScheduleCloudWrapper,
    saveInstructorCloud, deleteInstructorCloud, bulkUpsertInstructors,
    saveRoomCloud, deleteRoomCloud, bulkUpsertRooms,
    saveAttendanceTracking, getAttendanceTracking, uploadInstitutionalReference,
    allSchedules, exportedInstructors, toggleInstructorExported,
    instructorsMap, instructorsByNameMap, roomsMap, holidaysMap, careersMap,
    settings, loadSchedulesForFilter, globalSchedulesSummary,
    simulationConfig, extraHoursConfig, startSimulation, endSimulation,
    importScheduleToSimulation, applySimulation, saveScenario, updateScenario, loadScenario,
    currentScenarioId, currentScenarioName,
    recalculateInstructorAudit, syncInstructorIdInSchedules, updateAppSetting,
    recalculateAllInstructorsAudit, getAuditCutoffDate, liveAuditByInstructor, notify
  ]);

  return (
    <DataContext.Provider value={contextValue}>
      {children}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
