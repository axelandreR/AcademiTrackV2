import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { ProcessedSchedule, RoomData, InstructorData, HolidayData } from '../types';
import { supabase } from '../supabaseClient';

interface DataContextType {
  schedules: ProcessedSchedule[];
  administrativeTasks: ProcessedSchedule[];
  rooms: RoomData[];
  instructors: InstructorData[];
  holidays: HolidayData[];
  isLoading: boolean;
  hasInitialData: boolean;
  error: string | null;

  // Actions (Local state + Cloud sync wrappers would go here)
  setSchedules: React.Dispatch<React.SetStateAction<ProcessedSchedule[]>>;
  setAdministrativeTasks: React.Dispatch<React.SetStateAction<ProcessedSchedule[]>>;
  setRooms: React.Dispatch<React.SetStateAction<RoomData[]>>;
  setInstructors: React.Dispatch<React.SetStateAction<InstructorData[]>>;
  setHolidays: React.Dispatch<React.SetStateAction<HolidayData[]>>;

  // Helpers
  allSchedules: ProcessedSchedule[];
  refreshData: () => Promise<void>;
  uploadSchedulesToSupabase: (data: {
    schedules: ProcessedSchedule[];
    instructors: InstructorData[];
    rooms: RoomData[];
    holidays: HolidayData[];
  }, mode?: 'full' | 'delta') => Promise<void>;

  exportedInstructors: Set<string>;
  toggleInstructorExported: (id: string) => void;

  // Cloud CRUD
  saveScheduleCloud: (schedule: ProcessedSchedule | ProcessedSchedule[]) => Promise<void>;
  deleteScheduleCloud: (id: string | string[]) => Promise<void>;

  // Normalized
  instructorsMap: Record<string, InstructorData>;
  instructorsByNameMap: Record<string, InstructorData>;
  roomsMap: Record<string, RoomData>;
  holidaysMap: Record<string, HolidayData>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Helper para evitar desfase de zona horaria (UTC -> Local)
const parseLocalDBDate = (dateStr: string | null | undefined): Date => {
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

const mapSchedFromDB = (dbItem: any): ProcessedSchedule => ({
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

const mapInstructorToDB = (inst: InstructorData) => ({
  id: inst.id,
  name: inst.name,
  type: inst.type,
  specialty: inst.specialty,
  max_hours: inst.maxHours
  // email: inst.email -- no existe en interface actual
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

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [schedules, setSchedules] = useState<ProcessedSchedule[]>([]);
  const [administrativeTasks, setAdministrativeTasks] = useState<ProcessedSchedule[]>([]);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [instructors, setInstructors] = useState<InstructorData[]>([]);
  const [holidays, setHolidays] = useState<HolidayData[]>([]);
  const [exportedInstructors, setExportedInstructors] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem('exportedInstructors');
    if (saved) {
      try {
        setExportedInstructors(new Set(JSON.parse(saved)));
      } catch (e) { console.error(e); }
    }
  }, []);

  const toggleInstructorExported = (id: string) => {
    setExportedInstructors(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem('exportedInstructors', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const [isLoading, setIsLoading] = useState(true);
  const [hasInitialData, setHasInitialData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch ALL Schedules (handling pagination for > 1000 rows)
      let allDbSchedules: any[] = [];
      let lastCount = 0;
      let offset = 0;
      const limit = 1000;

      do {
        const { data, error: schedError } = await supabase
          .from('schedules')
          .select('*')
          .range(offset, offset + limit - 1);

        if (schedError) throw schedError;
        if (data) {
          allDbSchedules = [...allDbSchedules, ...data];
          lastCount = data.length;
          offset += limit;
        } else {
          lastCount = 0;
        }
      } while (lastCount === limit);

      const processed: ProcessedSchedule[] = allDbSchedules.map(mapSchedFromDB);

      const academic = processed.filter(s => !s.isAdministrative);
      const admin = processed.filter(s => s.isAdministrative);

      setSchedules(academic);
      setAdministrativeTasks(admin);

      if (processed.length > 0) setHasInitialData(true);

      // 2. Fetch ALL Instructors
      let allDbInstructors: any[] = [];
      offset = 0; // Reset offset for new table
      // limit is already defined
      do {
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
        setInstructors(allDbInstructors.map(i => ({
          id: i.id, name: i.name, type: i.type as 'TC' | 'TP', specialty: i.specialty, maxHours: i.max_hours, campus: '', status: 'Activo'
        })));
      }

      // 3. Fetch Rooms
      const { data: dbRooms, error: roomError } = await supabase.from('rooms').select('*');
      if (roomError) throw roomError;
      if (dbRooms) {
        setRooms(dbRooms.map(r => ({
          roomKey: r.room_key, room: r.name || '', building: r.building, capacity: r.capacity, type: r.type, career: '', description: ''
        })));
      }

      // 4. Fetch Holidays
      const { data: dbHolidays, error: holidayError } = await supabase.from('holidays').select('*');
      if (holidayError) throw holidayError;
      if (dbHolidays) {
        setHolidays(dbHolidays.map(h => ({
          date: parseLocalDBDate(h.date), name: h.name, description: h.type || ''
        })));
      }

    } catch (err: any) {
      console.error("Error fetching data from Supabase:", err);
      setError(err.message || 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  const uploadSchedulesToSupabase = async (data: {
    schedules: ProcessedSchedule[];
    instructors: InstructorData[];
    rooms: RoomData[];
    holidays: HolidayData[];
  }, mode: 'full' | 'delta' = 'full') => {
    setIsLoading(true);
    try {
      // 1. Limpieza de tablas según el modo
      if (mode === 'full') {
        // Reemplazo total
        await supabase.from('schedules').delete().neq('id', '_root_');
        await supabase.from('instructors').delete().neq('id', '_root_');
        await supabase.from('rooms').delete().neq('room_key', '_root_');
        await supabase.from('holidays').delete().neq('name', '_root_');
      } else {
        // Modo Delta (NRC): Solo borramos los NRCs que vienen en el nuevo archivo
        const nrcsToRootOut = [...new Set(data.schedules.map(s => s.nrc).filter(Boolean))];
        if (nrcsToRootOut.length > 0) {
          // Solo borramos clases académicas (no administrativas) para esos NRCs
          await supabase.from('schedules')
            .delete()
            .in('nrc', nrcsToRootOut)
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
        if (instPayload.length > 0) await supabase.from('instructors').insert(instPayload);
        if (roomPayload.length > 0) await supabase.from('rooms').insert(roomPayload);
        if (holidayPayload.length > 0) await supabase.from('holidays').insert(holidayPayload);
      } else {
        // En modo delta, solo añadimos instructores/salas si no existen (Upsert por ID/Key)
        if (instPayload.length > 0) await supabase.from('instructors').upsert(instPayload, { onConflict: 'id' });
        if (roomPayload.length > 0) await supabase.from('rooms').upsert(roomPayload, { onConflict: 'room_key' });
        if (holidayPayload.length > 0) await supabase.from('holidays').upsert(holidayPayload, { onConflict: 'name' });
      }

      // Dividir schedules en bloques de 500 para evitar timeout en cargas pesadas
      const chunkSize = 500;
      for (let i = 0; i < schedPayload.length; i += chunkSize) {
        const chunk = schedPayload.slice(i, i + chunkSize);
        const { error: batchError } = await supabase.from('schedules').insert(chunk);
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
  };

  const saveScheduleCloud = async (newData: ProcessedSchedule | ProcessedSchedule[]) => {
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
    } catch (err: any) {
      console.error("Error saving to Supabase:", err);
      alert('Error al guardar en la nube: ' + err.message);
    }
  };

  const deleteScheduleCloud = async (id: string | string[]) => {
    const ids = Array.isArray(id) ? id : [id];
    try {
      const { error } = await supabase.from('schedules').delete().in('id', ids);
      if (error) throw error;

      // Actualizar estado local eliminando los IDs
      const idSet = new Set(ids);
      setSchedules(prev => prev.filter(s => !idSet.has(s.id)));
      setAdministrativeTasks(prev => prev.filter(s => !idSet.has(s.id)));
    } catch (err: any) {
      console.error("Error deleting from Supabase:", err);
      alert('Error al eliminar de la nube: ' + err.message);
    }
  };

  // Carga inicial
  useEffect(() => {
    refreshData();
  }, []);

  const allSchedules = React.useMemo(() => {
    return [...schedules, ...administrativeTasks];
  }, [schedules, administrativeTasks]);

  return (
    <DataContext.Provider value={{
      schedules, administrativeTasks, rooms, instructors, holidays,
      isLoading, hasInitialData, error,
      setSchedules, setAdministrativeTasks, setRooms, setInstructors, setHolidays,
      refreshData, uploadSchedulesToSupabase, saveScheduleCloud, deleteScheduleCloud,
      allSchedules, exportedInstructors, toggleInstructorExported,
      // Estados normalizados para acceso O(1)
      instructorsMap: React.useMemo(() => {
        const map: Record<string, InstructorData> = {};
        instructors.forEach(inst => { map[inst.id] = inst; });
        return map;
      }, [instructors]),
      instructorsByNameMap: React.useMemo(() => {
        const map: Record<string, InstructorData> = {};
        instructors.forEach(inst => { map[inst.name.toLowerCase()] = inst; });
        return map;
      }, [instructors]),
      roomsMap: React.useMemo(() => {
        const map: Record<string, RoomData> = {};
        rooms.forEach(room => { map[room.roomKey] = room; });
        return map;
      }, [rooms]),
      holidaysMap: React.useMemo(() => {
        const map: Record<string, HolidayData> = {};
        holidays.forEach(h => { map[h.date.toDateString()] = h; });
        return map;
      }, [holidays])
    }}>
      {children}
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
