
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Calendar, Layers, MapPin, Users, Filter, Search, 
  ChevronRight, ChevronLeft, ChevronRight as ChevronRightIcon,
  LayoutDashboard, Edit3, FileDown, BarChart4, ArrowRight,
  PanelLeftClose, PanelLeft, Home, AlertCircle, ChevronDown, ChevronUp,
  BookOpen, Building2, UserRound, ArrowLeft, ShieldAlert, Eye, Table as TableIcon,
  AlertTriangle, Info, Menu, X, Calendar as CalendarIcon, Check, Plus, Trash2, Edit2
} from 'lucide-react';
import FileUploader from './components/FileUploader';
import ScheduleGrid from './components/ScheduleGrid';
import ReportsDashboard from './components/ReportsDashboard';
import RecordModal from './components/RecordModal';
import ExportModal from './components/ExportModal';
import { ProcessedSchedule, ViewType, AppMode, RoomData, InstructorData, ScheduleCategory, ModalityType, ExportConfig, HolidayData } from './types';
import { generateScheduleExcel } from './services/excelExporter';
import { ParseResult } from './services/excelParser';
import { DAYS_OF_WEEK } from './constants';
import JSZip from 'jszip';

const SEMESTER_END_DATE = new Date(2026, 5, 28); // 28/06/2026 (Mes 5 es Junio en JS)

const getStartOfWeek = (date: Date) => {
  const d = new Date(date); const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
  d.setDate(diff); d.setHours(0, 0, 0, 0); return d;
};

const timeToMinutes = (t: string) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

interface GroupedOption {
  groupName: string;
  items: string[];
}

const App: React.FC = () => {
  const [data, setData] = useState<ProcessedSchedule[]>([]);
  const [administrativeTasks, setAdministrativeTasks] = useState<ProcessedSchedule[]>([]);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [instructors, setInstructors] = useState<InstructorData[]>([]);
  const [holidays, setHolidays] = useState<HolidayData[]>([]);
  const [appMode, setAppMode] = useState<AppMode>('landing');
  const [viewType, setViewType] = useState<ViewType>('Bloque');
  const [selectedFilter, setSelectedFilter] = useState<string>('');
  const [sidebarSearchTerm, setSidebarSearchTerm] = useState('');
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getStartOfWeek(new Date()));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isWeekPickerOpen, setIsWeekPickerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ProcessedSchedule | null>(null);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [currentWeekDeficit, setCurrentWeekDeficit] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [contentMode, setContentMode] = useState<'grid' | 'table'>('grid');
  const [showAuditPanel, setShowAuditPanel] = useState(false);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [isInfoAccordionExpanded, setIsInfoAccordionExpanded] = useState(false);
  const [managementSearch, setManagementSearch] = useState('');
  const [isManagementModalOpen, setIsManagementModalOpen] = useState(false);
  const [editingManagementItem, setEditingManagementItem] = useState<any>(null);
  
  const lastTaskCreationRef = useRef<number>(0);
  const weekPickerRef = useRef<HTMLDivElement>(null);

  const allSchedules = useMemo(() => [...data, ...administrativeTasks], [data, administrativeTasks]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (weekPickerRef.current && !weekPickerRef.current.contains(event.target as Node)) {
        setIsWeekPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const semesterWeeks = useMemo(() => {
    if (data.length === 0) return [];
    const starts = data.map(s => s.startDate.getTime());
    const ends = data.map(s => s.endDate.getTime());
    const globalMin = new Date(Math.min(...starts));
    
    // El límite de navegación se extiende hasta el final del semestre o el fin de la data
    const globalMax = new Date(Math.max(...ends, SEMESTER_END_DATE.getTime()));
    
    let current = getStartOfWeek(globalMin);
    const weeks: { start: Date; label: string }[] = [];
    while (current <= globalMax) {
      const weekEnd = new Date(current);
      weekEnd.setDate(current.getDate() + 6);
      const label = `${current.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).toUpperCase()} - ${weekEnd.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}`;
      weeks.push({ start: new Date(current), label });
      current.setDate(current.getDate() + 7);
    }
    return weeks;
  }, [data]);

  const handleDataLoaded = (result: ParseResult) => {
    setData(result.schedules); setRooms(result.rooms); setInstructors(result.instructors); setHolidays(result.holidays); setAppMode('landing');
    if (result.schedules.length > 0) {
      const academicWithHours = result.schedules.filter(s => s.weeklyHours > 0);
      const targetSchedules = academicWithHours.length > 0 ? academicWithHours : result.schedules;
      const allStartDates = targetSchedules.map(s => s.startDate.getTime());
      const minDate = new Date(Math.min(...allStartDates));
      setCurrentWeekStart(getStartOfWeek(minDate));
    }
  };

  const navigateWeek = (weeks: number) => {
    setCurrentWeekStart(prev => { const next = new Date(prev); next.setDate(prev.getDate() + (weeks * 7)); return next; });
  };

  const groupedSidebarOptions = useMemo(() => {
    const groups: GroupedOption[] = []; const term = sidebarSearchTerm.toLowerCase();
    if (viewType === 'Bloque') {
      const careerMap = new Map<string, Set<string>>();
      allSchedules.forEach(s => { if (!careerMap.has(s.career)) careerMap.set(s.career, new Set()); careerMap.get(s.career)!.add(s.block); });
      careerMap.forEach((blocks: Set<string>, career: string) => { const filtered = [...blocks].filter(b => b.toLowerCase().includes(term)).sort(); if (filtered.length > 0) groups.push({ groupName: career, items: filtered }); });
    } else if (viewType === 'Aula') {
      const typeMap = new Map<string, Set<string>>();
      allSchedules.forEach(s => { const roomKey = `${s.building} - ${s.room}`; const roomMeta = rooms.find(r => r.roomKey === roomKey); const type = roomMeta?.type || 'SIN TIPO'; if (!typeMap.has(type)) typeMap.set(type, new Set()); typeMap.get(type)!.add(roomKey); });
      typeMap.forEach((roomsInType: Set<string>, type: string) => { const filtered = [...roomsInType].filter(r => r.toLowerCase().includes(term)).sort(); if (filtered.length > 0) groups.push({ groupName: type, items: filtered }); });
    } else {
      const tcSet = new Set<string>(); const tpSet = new Set<string>();
      const activeInstructorNames = new Set(allSchedules.map(s => s.instructor));
      
      instructors.forEach(meta => { 
        if (activeInstructorNames.has(meta.name)) {
          if (meta.type === 'TC') tcSet.add(meta.name); else tpSet.add(meta.name); 
        }
      });

      const filteredTc = [...tcSet].filter(i => i.toLowerCase().includes(term)).sort(); 
      const filteredTp = [...tpSet].filter(i => i.toLowerCase().includes(term)).sort();
      
      if (filteredTc.length > 0) groups.push({ groupName: 'TIEMPO COMPLETO (TC)', items: filteredTc });
      if (filteredTp.length > 0) groups.push({ groupName: 'TIEMPO PARCIAL (TP)', items: filteredTp });
    }
    return viewType === 'Instructor' ? groups : groups.sort((a, b) => a.groupName.localeCompare(b.groupName));
  }, [allSchedules, viewType, sidebarSearchTerm, rooms, instructors]);

  useEffect(() => {
    if (groupedSidebarOptions.length > 0 && expandedGroups.size === 0) setExpandedGroups(new Set([groupedSidebarOptions[0].groupName]));
  }, [viewType, data, groupedSidebarOptions]);

  const toggleGroup = (groupName: string) => { const newExpanded = new Set(expandedGroups); if (newExpanded.has(groupName)) newExpanded.delete(groupName); else newExpanded.add(groupName); setExpandedGroups(newExpanded); };

  const changeViewType = (newType: ViewType) => {
    setViewType(newType); setSidebarSearchTerm('');
    const firstGroup = groupedSidebarOptions.find(g => g.items.length > 0);
    if (firstGroup) { setSelectedFilter(firstGroup.items[0]); setExpandedGroups(new Set([firstGroup.groupName])); }
  };

  const handleNavigate = (type: ViewType, filter: string) => {
    setViewType(type); setSelectedFilter(filter); setAppMode('schedule');
    if (type === 'Bloque') { const schedule = allSchedules.find(s => s.block === filter); if (schedule) setExpandedGroups(new Set([schedule.career])); }
    else if (type === 'Aula') { const room = rooms.find(r => r.roomKey === filter); if (room) setExpandedGroups(new Set([room.type])); }
    else if (type === 'Instructor') { const meta = instructors.find(i => i.name === filter); if (meta) setExpandedGroups(new Set([meta.type === 'TC' ? 'TIEMPO COMPLETO (TC)' : 'TIEMPO PARCIAL (TP)'])); }
    setIsSidebarVisible(true);
  };

  const handleIndividualizeTask = (taskId: string, targetDate: Date) => {
    setAdministrativeTasks(prev => {
      const taskIndex = prev.findIndex(t => t.id === taskId); if (taskIndex === -1) return prev;
      const task = prev[taskIndex]; const targetTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
      const startTime = new Date(task.startDate.getFullYear(), task.startDate.getMonth(), task.startDate.getDate()).getTime();
      const endTime = new Date(task.endDate.getFullYear(), task.endDate.getMonth(), task.endDate.getDate()).getTime();
      if (startTime === endTime) return prev;
      const newTasks = [...prev]; newTasks.splice(taskIndex, 1);
      if (startTime < targetTime) { const pastEndDate = new Date(targetTime); pastEndDate.setDate(pastEndDate.getDate() - 1); newTasks.push({ ...task, id: `past-${Date.now()}`, endDate: pastEndDate }); }
      const individualDate = new Date(targetTime); newTasks.push({ ...task, id: `indiv-${Date.now()}`, startDate: individualDate, endDate: individualDate });
      if (endTime > targetTime) { const futureStartDate = new Date(targetTime); futureStartDate.setDate(futureStartDate.getDate() + 1); newTasks.push({ ...task, id: `future-${Date.now()}`, startDate: futureStartDate }); }
      return newTasks;
    });
  };

  const checkInstructorDiscrepancy = (instructorName: string): boolean => {
    const inst = instructors.find(i => i.name === instructorName); 
    if (!inst) return false; 
    
    // REGLA 1: No auditar si la semana entera está después del 28/06/2026
    const weekStart = new Date(currentWeekStart); 
    if (weekStart > SEMESTER_END_DATE) return false;

    // REGLA 2: Si la semana tiene feriados, se suspende la auditoría
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(weekStart); currentDate.setDate(weekStart.getDate() + i);
      if (holidays.find(h => h.date.toDateString() === currentDate.toDateString())) return false;
    }

    const isTC = inst.type === 'TC';
    const academicSchedulesInFile = data.filter(s => s.instructor === instructorName && !s.isAdministrative);
    const instSchedules = allSchedules.filter(s => s.instructor === instructorName);
    let metaCarga = 0; 
    let cargaReal = 0;

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(weekStart); currentDate.setDate(weekStart.getDate() + i);
      // Solo auditar días hasta el 28/06
      if (currentDate > SEMESTER_END_DATE) continue;

      const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][currentDate.getDay()];
      const fileSessions = academicSchedulesInFile.filter(s => s.days.includes(dayName) && currentDate >= s.startDate && currentDate <= s.endDate);
      fileSessions.forEach(s => metaCarga += s.weeklyHours);
      
      instSchedules.filter(s => s.days.includes(dayName) && currentDate >= s.startDate && currentDate <= s.endDate).forEach(s => {
        const dur = (timeToMinutes(s.endTime) - timeToMinutes(s.startTime)) / 60;
        if (!s.isAdministrative) { cargaReal += dur; } 
        else { 
          const isAuto = s.meetingType === 'VAEE' || (s.activity && s.activity.toUpperCase().includes('AUTOESTUDIO')) || s.category === 'asincrona'; 
          if (isAuto || s.category === 'asincrona' || s.category === 'preparacion' || s.category === 'coordinador') cargaReal += dur; 
        }
      });
    }
    
    const academicDiscrepancy = Math.abs(cargaReal - metaCarga) > 0.01;
    if (academicDiscrepancy) return true;

    if (isTC) {
      let totalSemana = 0;
      for (let i = 0; i < 7; i++) {
        const currentDate = new Date(weekStart); currentDate.setDate(weekStart.getDate() + i);
        if (currentDate > SEMESTER_END_DATE) continue;

        const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][currentDate.getDay()];
        instSchedules.filter(s => s.days.includes(dayName) && currentDate >= s.startDate && currentDate <= s.endDate).forEach(s => {
          totalSemana += (timeToMinutes(s.endTime) - timeToMinutes(s.startTime)) / 60;
        });
      }
      // Solo marcamos déficit contractual si estamos dentro del rango semestral
      if (Math.abs(totalSemana - 46) > 0.01) return true;
    }
    return false;
  };

  const handleExport = async (config: ExportConfig) => {
    // Solo bloqueamos si es individual y detecta discrepancia en la semana actual
    if (config.type === 'Instructor' && config.mode === 'individual' && config.selectedItem && checkInstructorDiscrepancy(config.selectedItem)) { 
      alert('ERROR: Horario con discrepancia de carga. Corrija las observaciones antes de exportar.'); 
      return; 
    }
    
    setIsExportModalOpen(false);
    try {
      const zip = new JSZip();
      if (config.mode === 'individual') {
        const item = config.selectedItem || ''; const itemData = allSchedules.filter(s => { if (config.type === 'Bloque') return s.block === item; if (config.type === 'Aula') return `${s.building} - ${s.room}` === item; if (config.type === 'Instructor') return s.instructor === item; return false; });
        const blob = await generateScheduleExcel({ data: itemData, type: config.type, itemName: item, scope: config.scope, customStartDate: config.customStartDate, customEndDate: config.customEndDate, instructorInfo: instructors.find(i => i.name === item), logo: config.logo, holidays });
        const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${item}.xlsx`; a.click();
      } else {
        const itemsToExport = Array.from(new Set(allSchedules.map(s => { if (config.type === 'Bloque') return s.block; if (config.type === 'Aula') return `${s.building} - ${s.room}`; if (config.type === 'Instructor') return s.instructor; return ''; }))).filter((item): item is string => Boolean(item));
        for (const item of itemsToExport) { const itemData = allSchedules.filter(s => { if (config.type === 'Bloque') return s.block === item; if (config.type === 'Aula') return `${s.building} - ${s.room}` === item; if (config.type === 'Instructor') return s.instructor === item; return false; }); const blob = await generateScheduleExcel({ data: itemData, type: config.type, itemName: item, scope: config.scope, instructorInfo: instructors.find(i => i.name === item), logo: config.logo, holidays }); zip.file(`${item}.xlsx`, blob); }
        const zipBlob = await zip.generateAsync({ type: 'blob' }); const url = window.URL.createObjectURL(zipBlob); const a = document.createElement('a'); a.href = url; a.download = `Reporte_${config.type}.zip`; a.click();
      }
    } catch (err) { alert('Error al generar Excel.'); }
  };

  const handleAddAdministrativeTask = (day: string, startTime: string, duration: number, category: ScheduleCategory, modality: ModalityType) => {
    const now = Date.now(); if (now - lastTaskCreationRef.current < 400) return; lastTaskCreationRef.current = now;
    if (viewType !== 'Instructor' || !selectedFilter) return;
    const [h, m] = startTime.split(':').map(Number); const startMin = h * 60 + m; const endMin = startMin + duration; const endH = Math.floor(endMin / 60); const endM = endMin % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    const instructor = instructors.find(i => i.name === selectedFilter); const effectiveModality = category === 'por_asignar' ? 'presencial' : modality;
    
    const cutOffDate = new Date(2026, 5, 7); // 07/06/2026
    const baseStartDate = new Date(currentWeekStart); 
    baseStartDate.setHours(0,0,0,0);
    
    let finalEndDate: Date;
    if (baseStartDate <= cutOffDate) {
      // Bloque extendido hasta el corte
      finalEndDate = new Date(cutOffDate);
    } else {
      // Bloque de 1 semana (lunes a domingo)
      finalEndDate = new Date(baseStartDate);
      finalEndDate.setDate(baseStartDate.getDate() + 6);
      
      // Limitar al fin del semestre (28/06)
      if (finalEndDate > SEMESTER_END_DATE) {
        finalEndDate = new Date(SEMESTER_END_DATE);
      }
    }
    finalEndDate.setHours(23, 59, 59, 999);

    const newTask: ProcessedSchedule = {
      id: `admin-${Date.now()}`, courseCode: 'ADMIN', courseName: category === 'refrigerio' ? 'REFRIGERIO' : (category === 'preparacion' ? 'PREPARACIÓN DE CLASE' : (category === 'asincrona' ? 'ASÍNCRONA' : category.toUpperCase().replace('_', ' '))),
      activity: category === 'asincrona' ? 'AUTOESTUDIO' : category.toUpperCase(), meetingType: category === 'asincrona' ? 'VAEE' : 'ADMIN', block: 'ADMIN', instructor: selectedFilter, instructorId: instructor?.id || '', room: effectiveModality === 'virtual' ? 'VIRTUAL' : 'POR DEFINIR', building: effectiveModality === 'virtual' ? 'REMOTO' : 'CAMPUS', days: [day], startTime, endTime, startDate: baseStartDate, endDate: finalEndDate, career: instructor?.specialty || 'GENERAL', nrc: '0000', color: 'bg-slate-100', weeklyHours: duration / 60, aforo: 0, periodo: data[0]?.periodo || '202510', semestre: 'N/A', category, isAdministrative: true, modality: effectiveModality
    };
    setAdministrativeTasks(prev => [...prev, newTask]);
  };

  const filteredData = useMemo(() => { if (!selectedFilter) return []; return allSchedules.filter(s => { if (viewType === 'Bloque') return s.block === selectedFilter; if (viewType === 'Aula') return `${s.building} - ${s.room}` === selectedFilter; if (viewType === 'Instructor') return s.instructor === selectedFilter; return false; }); }, [allSchedules, viewType, selectedFilter]);

  // Lógica de Gestión de Instructores y Ambientes
  const filteredInstructors = useMemo(() => instructors.filter(i => i.name.toLowerCase().includes(managementSearch.toLowerCase()) || i.id.includes(managementSearch)), [instructors, managementSearch]);
  const filteredRooms = useMemo(() => rooms.filter(r => r.roomKey.toLowerCase().includes(managementSearch.toLowerCase()) || r.career.toLowerCase().includes(managementSearch.toLowerCase())), [rooms, managementSearch]);

  const handleSaveInstructor = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newInst: InstructorData = {
      id: formData.get('id') as string,
      name: formData.get('name') as string,
      type: formData.get('type') as 'TC' | 'TP',
      maxHours: Number(formData.get('maxHours')),
      specialty: formData.get('specialty') as string,
      campus: formData.get('campus') as string,
      status: formData.get('status') as string,
    };
    if (editingManagementItem) {
      setInstructors(prev => prev.map(i => i.id === editingManagementItem.id ? newInst : i));
    } else {
      setInstructors(prev => [...prev, newInst]);
    }
    setIsManagementModalOpen(false);
  };

  const handleSaveRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const b = formData.get('building') as string;
    const r = formData.get('room') as string;
    const newRoom: RoomData = {
      career: formData.get('career') as string,
      building: b,
      room: r,
      roomKey: `${b} - ${r}`,
      description: formData.get('description') as string,
      type: formData.get('type') as string,
      capacity: Number(formData.get('capacity')),
    };
    if (editingManagementItem) {
      setRooms(prev => prev.map(i => i.roomKey === editingManagementItem.roomKey ? newRoom : i));
    } else {
      setRooms(prev => [...prev, newRoom]);
    }
    setIsManagementModalOpen(false);
  };

  if (data.length === 0) return <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-10 relative"><div className="max-w-4xl w-full text-center z-10 animate-in fade-in duration-700"><div className="mb-12 space-y-4"><h1 className="text-6xl font-black text-slate-900 tracking-tighter">Academi<span className="text-blue-600">Track</span></h1><p className="text-lg text-slate-500 font-medium">Gestión inteligente de horarios y auditoría de carga.</p></div><FileUploader onDataLoaded={handleDataLoaded} /></div></div>;
  
  if (appMode === 'landing') return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 lg:p-12 animate-in fade-in duration-500 overflow-y-auto">
      <div className="max-w-6xl w-full space-y-12 py-10">
        <div className="text-center space-y-2">
          <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">Menú de Gestión</h2>
          <p className="text-slate-500 font-medium">Seleccione el módulo de operación para administrar el semestre</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          <button onClick={() => setAppMode('reports')} className="group bg-white p-6 lg:p-8 rounded-[40px] shadow-2xl border border-slate-100 text-left hover:border-indigo-500 transition-all hover:shadow-indigo-200/50">
            <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl w-fit mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-colors"><BarChart4 size={28} /></div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Reportes</h3>
            <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">Auditoría global de carga académica y ocupación semestral.</p>
            <div className="flex items-center space-x-2 text-indigo-600 font-black uppercase text-[10px] tracking-widest"><span>Ingresar</span><ArrowRight size={14} /></div>
          </button>
          
          <button onClick={() => { setAppMode('schedule'); changeViewType('Bloque'); }} className="group bg-white p-6 lg:p-8 rounded-[40px] shadow-2xl border border-slate-100 text-left hover:border-blue-500 transition-all hover:shadow-blue-200/50">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl w-fit mb-6 group-hover:bg-blue-600 group-hover:text-white transition-colors"><LayoutDashboard size={28} /></div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Visualizador</h3>
            <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">Grilla horaria interactiva por bloques, ambientes y docentes.</p>
            <div className="flex items-center space-x-2 text-blue-600 font-black uppercase text-[10px] tracking-widest"><span>Ingresar</span><ArrowRight size={14} /></div>
          </button>
          
          <button onClick={() => { setAppMode('editor'); changeViewType('Instructor'); }} className="group bg-white p-6 lg:p-8 rounded-[40px] shadow-2xl border border-slate-100 text-left hover:border-emerald-500 transition-all hover:shadow-emerald-200/50">
            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl w-fit mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors"><Edit3 size={28} /></div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Editor Docente</h3>
            <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">Asignación de tareas administrativas y preparación de carga.</p>
            <div className="flex items-center space-x-2 text-emerald-600 font-black uppercase text-[10px] tracking-widest"><span>Ingresar</span><ArrowRight size={14} /></div>
          </button>

          <button onClick={() => { setAppMode('instructors_manager'); setManagementSearch(''); }} className="group bg-white p-6 lg:p-8 rounded-[40px] shadow-2xl border border-slate-100 text-left hover:border-indigo-400 transition-all hover:shadow-indigo-100/50">
            <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl w-fit mb-6 group-hover:bg-indigo-500 group-hover:text-white transition-colors"><Users size={28} /></div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Instructores</h3>
            <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">Gestión de la base de datos de docentes, tipos y especialidades.</p>
            <div className="flex items-center space-x-2 text-indigo-500 font-black uppercase text-[10px] tracking-widest"><span>Gestionar</span><ArrowRight size={14} /></div>
          </button>

          <button onClick={() => { setAppMode('rooms_manager'); setManagementSearch(''); }} className="group bg-white p-6 lg:p-8 rounded-[40px] shadow-2xl border border-slate-100 text-left hover:border-orange-400 transition-all hover:shadow-orange-100/50">
            <div className="p-4 bg-orange-50 text-orange-500 rounded-2xl w-fit mb-6 group-hover:bg-orange-500 group-hover:text-white transition-colors"><MapPin size={28} /></div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Ambientes</h3>
            <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">Administración de aulas, edificios y aforos por carrera.</p>
            <div className="flex items-center space-x-2 text-orange-500 font-black uppercase text-[10px] tracking-widest"><span>Gestionar</span><ArrowRight size={14} /></div>
          </button>
        </div>
      </div>
    </div>
  );

  if (appMode === 'reports') return <ReportsDashboard schedules={allSchedules} instructors={instructors} holidays={holidays} onBack={() => setAppMode('landing')} />;

  if (appMode === 'instructors_manager' || appMode === 'rooms_manager') return (
    <div className="min-h-screen bg-slate-50 flex flex-col h-screen overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-[100] shadow-sm">
        <div className="flex items-center space-x-6">
          <button onClick={() => setAppMode('landing')} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all"><ArrowLeft size={20} /></button>
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-xl text-white ${appMode === 'instructors_manager' ? 'bg-indigo-600' : 'bg-orange-600'}`}>
              {appMode === 'instructors_manager' ? <Users size={20} /> : <MapPin size={20} />}
            </div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Gestión de {appMode === 'instructors_manager' ? 'Instructores' : 'Ambientes'}</h1>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder="Buscar..." value={managementSearch} onChange={e => setManagementSearch(e.target.value)} className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm font-bold w-64 focus:ring-2 focus:ring-slate-400" />
          </div>
          <button onClick={() => { setEditingManagementItem(null); setIsManagementModalOpen(true); }} className="flex items-center space-x-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all">
            <Plus size={16} /><span>Añadir {appMode === 'instructors_manager' ? 'Instructor' : 'Ambiente'}</span>
          </button>
        </div>
      </header>
      
      <main className="flex-1 overflow-auto p-8">
        <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
              {appMode === 'instructors_manager' ? (
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Trabajador</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Horas Max</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Especialidad</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sede</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Carrera</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Edificio</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aula</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aforo</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-50">
              {appMode === 'instructors_manager' ? filteredInstructors.map(inst => (
                <tr key={inst.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 text-sm font-bold text-slate-600">{inst.id}</td>
                  <td className="px-6 py-4 text-sm font-black text-slate-900">{inst.name}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{inst.type}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-500">{inst.maxHours}h</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-500">{inst.specialty}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-500">{inst.campus}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => { setEditingManagementItem(inst); setIsManagementModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={16} /></button>
                      <button onClick={() => setInstructors(prev => prev.filter(i => i.id !== inst.id))} className="p-2 text-slate-400 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              )) : filteredRooms.map(room => (
                <tr key={room.roomKey} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 text-sm font-bold text-slate-600">{room.career}</td>
                  <td className="px-6 py-4 text-sm font-black text-slate-900">{room.building}</td>
                  <td className="px-6 py-4 text-sm font-black text-slate-900">{room.room}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-500 truncate max-w-[200px]">{room.description}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{room.type}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-500">{room.capacity}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => { setEditingManagementItem(room); setIsManagementModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={16} /></button>
                      <button onClick={() => setRooms(prev => prev.filter(r => r.roomKey !== room.roomKey))} className="p-2 text-slate-400 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {isManagementModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{editingManagementItem ? 'Editar' : 'Crear'} {appMode === 'instructors_manager' ? 'Instructor' : 'Ambiente'}</h3>
              <button onClick={() => setIsManagementModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <form onSubmit={appMode === 'instructors_manager' ? handleSaveInstructor : handleSaveRoom} className="p-10 space-y-6">
              {appMode === 'instructors_manager' ? (
                <>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">ID Instructor</label><input required name="id" defaultValue={editingManagementItem?.id} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Nombre Completo</label><input required name="name" defaultValue={editingManagementItem?.name} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Tipo</label><select name="type" defaultValue={editingManagementItem?.type} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold"><option value="TC">Tiempo Completo (TC)</option><option value="TP">Tiempo Parcial (TP)</option></select></div>
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Horas Max</label><input type="number" name="maxHours" defaultValue={editingManagementItem?.maxHours} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Sede</label><input name="campus" defaultValue={editingManagementItem?.campus} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                  </div>
                  <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Especialidad</label><input name="specialty" defaultValue={editingManagementItem?.specialty} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                  <input type="hidden" name="status" value="Activo" />
                </>
              ) : (
                <>
                  <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Carrera Responsable</label><input required name="career" defaultValue={editingManagementItem?.career} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Edificio</label><input required name="building" defaultValue={editingManagementItem?.building} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Aula</label><input required name="room" defaultValue={editingManagementItem?.room} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Tipo Ambiente</label><input name="type" defaultValue={editingManagementItem?.type} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Aforo</label><input type="number" name="capacity" defaultValue={editingManagementItem?.capacity} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                  </div>
                  <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Descripción Actual</label><input name="description" defaultValue={editingManagementItem?.description} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                </>
              )}
              <div className="flex justify-end space-x-4 pt-6 border-t border-slate-100">
                <button type="button" onClick={() => setIsManagementModalOpen(false)} className="px-8 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Cancelar</button>
                <button type="submit" className="px-10 py-3 bg-slate-900 text-white text-xs font-black rounded-2xl uppercase tracking-widest shadow-xl">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col h-screen overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-8 py-3 lg:py-4 flex flex-col lg:flex-row lg:items-center justify-between sticky top-0 z-[100] shadow-sm shrink-0">
        <div className="flex items-center justify-between w-full lg:w-auto">
          <div className="flex items-center space-x-4 lg:space-x-8">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setAppMode('landing')}>
              <div className="p-2 lg:p-2.5 bg-slate-900 rounded-xl lg:rounded-2xl text-white shadow-lg shrink-0"><Calendar size={20} /></div>
              <div>
                <h1 className="text-base lg:text-lg font-black text-slate-900 leading-none">AcademiTrack</h1>
                <p className="text-[9px] lg:text-[10px] text-slate-400 mt-1 uppercase tracking-[0.2em] font-black hidden md:block">{appMode === 'editor' ? 'Editor Docente' : 'Visualizador'}</p>
              </div>
            </div>
            <button onClick={() => setAppMode('landing')} className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-900 flex items-center space-x-2">
              <Home size={18} /><span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Inicio</span>
            </button>
          </div>
          <button onClick={() => setIsHeaderExpanded(!isHeaderExpanded)} className="lg:hidden p-2 text-slate-400 hover:text-slate-900 transition-colors">
            {isHeaderExpanded ? <ChevronUp size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <div className={`${isHeaderExpanded ? 'flex' : 'hidden'} lg:flex flex-col lg:flex-row items-center space-y-4 lg:space-y-0 lg:space-x-4 mt-4 lg:mt-0 transition-all duration-300`}>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden min-h-0 relative">
        <aside className={`
          ${isSidebarVisible ? 'w-full md:w-[260px] min-[1501px]:w-[320px]' : 'w-0 overflow-hidden'} 
          bg-white border-r border-slate-200 flex flex-col transition-all duration-300 h-full z-40 shadow-lg shrink-0
        `}>
          <div className="p-4 lg:p-5 border-b border-slate-100 shrink-0 bg-slate-50/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center hidden min-[1030px]:flex"><Filter size={12} className="mr-2" />Categorización</h2>
              <button onClick={() => setIsSidebarVisible(false)} className="p-1.5 text-slate-400 hover:text-slate-800 transition-colors">
                <PanelLeftClose size={18} />
              </button>
            </div>
            
            <div className="grid grid-cols-3 min-[1030px]:grid-cols-1 gap-2">
              <button onClick={() => changeViewType('Bloque')} title="Bloques" className={`flex items-center justify-center min-[1030px]:justify-start px-3 py-3 min-[1030px]:px-4 rounded-xl transition-all ${viewType === 'Bloque' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Layers size={20} className="min-[1030px]:mr-3" />
                <span className="font-black text-[11px] uppercase tracking-widest hidden min-[1030px]:inline">Bloques</span>
              </button>
              <button onClick={() => changeViewType('Aula')} title="Ambientes" className={`flex items-center justify-center min-[1030px]:justify-start px-3 py-3 min-[1030px]:px-4 rounded-xl transition-all ${viewType === 'Aula' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-100'}`}>
                <MapPin size={20} className="min-[1030px]:mr-3" />
                <span className="font-black text-[11px] uppercase tracking-widest hidden min-[1030px]:inline">Ambientes</span>
              </button>
              <button onClick={() => changeViewType('Instructor')} title="Docentes" className={`flex items-center justify-center min-[1030px]:justify-start px-3 py-3 min-[1030px]:px-4 rounded-xl transition-all ${viewType === 'Instructor' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Users size={20} className="min-[1030px]:mr-3" />
                <span className="font-black text-[11px] uppercase tracking-widest hidden min-[1030px]:inline">Docentes</span>
              </button>
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="relative mb-4"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder={`Buscar ${viewType}...`} value={sidebarSearchTerm} onChange={(e) => setSidebarSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-100 border-none rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all" /></div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">{groupedSidebarOptions.map((group) => ( <div key={group.groupName} className="mb-2"><button onClick={() => toggleGroup(group.groupName)} className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors mb-1 shadow-sm"><div className="flex items-center space-x-2">{viewType === 'Bloque' ? <BookOpen size={14} className="text-blue-500" /> : viewType === 'Aula' ? <Building2 size={14} className="text-orange-500" /> : <UserRound size={14} className="text-indigo-500" />}<span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[180px]">{group.groupName}</span></div>{expandedGroups.has(group.groupName) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>{expandedGroups.has(group.groupName) && ( <div className="pl-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">{group.items.map(item => ( <button key={item} onClick={() => setSelectedFilter(item)} className={`w-full text-left px-4 py-2.5 rounded-lg text-[10px] font-black transition-all flex items-center justify-between border ${selectedFilter === item ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'text-slate-600 hover:bg-slate-100 border-transparent'}`}><span className="truncate">{item}</span><ChevronRightIcon size={12} /></button> ))}</div> )}</div> ))}</div>
          </div>
        </aside>

        {!isSidebarVisible && (
          <button 
            onClick={() => setIsSidebarVisible(true)} 
            className="absolute left-4 top-[15%] -translate-y-1/2 z-[210] p-2.5 bg-white border border-slate-200 rounded-full shadow-2xl text-slate-600 hover:bg-blue-600 hover:text-white transition-all hover:scale-110 active:scale-95"
            title="Mostrar Panel"
          >
            <PanelLeft size={20} />
          </button>
        )}

        <main className="flex-1 flex flex-col bg-slate-50 overflow-hidden p-4 lg:p-6 relative">
          <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-col mb-4 shrink-0 bg-white p-0 rounded-[24px] lg:rounded-[32px] shadow-sm border border-slate-100 overflow-visible transition-all">
              <div 
                className="flex items-center justify-between p-3 lg:p-4 cursor-pointer lg:cursor-default"
                onClick={() => { if (window.innerWidth < 1030) setIsInfoAccordionExpanded(!isInfoAccordionExpanded); }}
              >
                <div className="flex items-center space-x-3 lg:space-x-4 min-w-0 flex-1">
                  <div className="p-2 lg:p-3 bg-slate-50 rounded-xl lg:rounded-2xl border border-slate-100 shrink-0">
                    {viewType === 'Bloque' ? <Layers size={20} className="text-blue-600 lg:w-6 lg:h-6" /> : viewType === 'Aula' ? <MapPin size={20} className="text-orange-600 lg:w-6 lg:h-6" /> : <Users size={20} className="text-indigo-600 lg:w-6 lg:h-6" />}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <h2 className="text-xs sm:text-sm md:text-base lg:text-lg min-[1400px]:text-2xl font-black text-slate-900 tracking-tighter uppercase leading-tight whitespace-normal break-words line-clamp-2">
                      {selectedFilter || 'Sin Selección'}
                    </h2>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-0.5 hidden min-[1030px]:block">
                      {viewType} • {appMode === 'editor' ? 'Edición Activa' : 'Visualización'}
                    </p>
                  </div>
                </div>
                
                <div className="lg:hidden p-1.5 text-slate-400">
                  {isInfoAccordionExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>

                <div className="hidden lg:flex items-center space-x-4 shrink-0 overflow-visible">
                  <div className="flex items-center space-x-2 relative">
                    <div className="relative" ref={weekPickerRef}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsWeekPickerOpen(!isWeekPickerOpen); }} 
                        className={`p-1.5 border rounded-lg transition-all active:scale-95 flex items-center space-x-2 ${isWeekPickerOpen ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200'}`}
                        title="Seleccionar Semana"
                      >
                        <CalendarIcon size={18} />
                      </button>
                      
                      {isWeekPickerOpen && (
                        <div className="absolute top-full right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[200] overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-right">
                          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Semestralización</span>
                            <span className="text-[9px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">{semesterWeeks.length} SEMANAS</span>
                          </div>
                          <div className="max-h-72 overflow-y-auto custom-scrollbar p-2">
                            {semesterWeeks.map((week, idx) => {
                              const isActive = currentWeekStart.getTime() === week.start.getTime();
                              return (
                                <button 
                                  key={idx}
                                  onClick={(e) => { e.stopPropagation(); setCurrentWeekStart(week.start); setIsWeekPickerOpen(false); }}
                                  className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-600'}`}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-tighter">Semana {idx + 1}</span>
                                    <span className={`text-[11px] font-bold ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>{week.label}</span>
                                  </div>
                                  {isActive && <Check size={16} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {viewType === 'Instructor' && selectedFilter && ( 
                      <>
                        <button onClick={(e) => { e.stopPropagation(); setAppMode(appMode === 'schedule' ? 'editor' : 'schedule'); }} className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95">
                          {appMode === 'schedule' ? <Edit3 size={18} /> : <Eye size={18} />}
                        </button>
                        {currentWeekDeficit && (
                          <button onClick={(e) => { e.stopPropagation(); setShowAuditPanel(!showAuditPanel); }} className="p-1.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-500 animate-pulse hover:bg-rose-600 hover:text-white transition-all">
                            <AlertTriangle size={18} />
                          </button>
                        )}
                      </>
                    )}
                    {selectedFilter && (
                      <button onClick={(e) => { e.stopPropagation(); setIsExportModalOpen(true); }} className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-all active:scale-95" title="Exportar">
                        <FileDown size={18} />
                      </button>
                    )}
                  </div>
                  {selectedFilter && (
                    <div className="flex p-0.5 bg-slate-100 border border-slate-200 rounded-xl shadow-inner">
                      <button onClick={() => setContentMode('grid')} className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg transition-all ${contentMode === 'grid' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-500 hover:bg-slate-200'}`}>
                        <LayoutDashboard size={12} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Grilla</span>
                      </button>
                      <button onClick={() => setContentMode('table')} className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg transition-all ${contentMode === 'table' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-500 hover:bg-slate-200'}`}>
                        <TableIcon size={12} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Base</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className={`lg:hidden overflow-hidden transition-all duration-300 bg-slate-50/50 ${isInfoAccordionExpanded ? 'max-h-[350px] border-t border-slate-100 p-3' : 'max-h-0'}`}>
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{viewType} • {appMode === 'editor' ? 'Edición' : 'Vista'}</span>
                    <div className="flex space-x-2">
                      <button onClick={() => setIsWeekPickerOpen(!isWeekPickerOpen)} className={`p-1.5 border rounded-lg ${isWeekPickerOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-400'}`}>
                        <CalendarIcon size={14} />
                      </button>

                      {viewType === 'Instructor' && selectedFilter && ( 
                        <>
                          <button onClick={() => setAppMode(appMode === 'schedule' ? 'editor' : 'schedule')} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-slate-600 flex items-center space-x-2">
                            {appMode === 'schedule' ? <><Edit3 size={12} /> <span>Editar</span></> : <><Eye size={12} /> <span>Ver</span></>}
                          </button>
                          {currentWeekDeficit && (
                            <button onClick={() => setShowAuditPanel(!showAuditPanel)} className="p-1.5 bg-rose-600 text-white rounded-lg animate-pulse">
                              <AlertTriangle size={12} />
                            </button>
                          )}
                        </>
                      )}
                      {selectedFilter && (
                        <button onClick={() => setIsExportModalOpen(true)} className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-emerald-600 transition-all active:scale-95">
                          <FileDown size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {isWeekPickerOpen && (
                    <div className="bg-white rounded-xl border border-slate-200 p-2 grid grid-cols-2 gap-2 animate-in slide-in-from-top-2">
                      {semesterWeeks.slice(0, 10).map((week, idx) => (
                        <button 
                          key={idx}
                          onClick={() => { setCurrentWeekStart(week.start); setIsWeekPickerOpen(false); }}
                          className={`text-[9px] font-black p-2 rounded-lg border text-center ${currentWeekStart.getTime() === week.start.getTime() ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 border-slate-100 text-slate-500'}`}
                        >
                          SEM {idx + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedFilter && (
                    <div className="flex p-1 bg-slate-200/50 rounded-xl">
                      <button onClick={() => setContentMode('grid')} className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg transition-all ${contentMode === 'grid' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500'}`}>
                        <LayoutDashboard size={12} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Grilla</span>
                      </button>
                      <button onClick={() => setContentMode('table')} className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg transition-all ${contentMode === 'table' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500'}`}>
                        <TableIcon size={12} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Base</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex-1 min-h-0 relative">
              <ScheduleGrid 
                schedules={filteredData} 
                weekStartDate={currentWeekStart} 
                onEditRecord={(r) => { setEditingRecord(r); setIsModalOpen(true); }} 
                onDeleteRecord={(id) => { setData(prev => prev.filter(r => r.id !== id)); setAdministrativeTasks(prev => prev.filter(r => r.id !== id)); }} 
                onIndividualizeTask={handleIndividualizeTask} 
                onAddAdministrativeTask={handleAddAdministrativeTask} 
                onNavigate={handleNavigate} 
                onNavigateWeek={navigateWeek}
                viewType={viewType} 
                appMode={appMode} 
                instructorsData={instructors} 
                selectedFilterName={selectedFilter} 
                holidays={holidays} 
                onDeficitStatusChange={setCurrentWeekDeficit} 
                contentMode={contentMode} 
              />
            </div>
          </div>
        </main>
      </div>

      {showAuditPanel && currentWeekDeficit && (
        <div className="fixed top-[140px] left-1/2 -translate-x-1/2 lg:left-[350px] lg:translate-x-0 z-[150] bg-rose-600 text-white p-5 lg:p-6 rounded-2xl lg:rounded-3xl shadow-2xl border-4 border-white animate-in zoom-in flex items-center space-x-4 max-w-[90vw]">
          <div className="p-2 lg:p-3 bg-white/20 rounded-xl lg:rounded-2xl"><AlertCircle size={24} /></div>
          <div>
            <p className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Carga Académica</p>
            <h4 className="text-xs lg:text-sm font-black uppercase">¡OBSERVACIÓN DETECTADA!</h4>
            <p className="text-[9px] lg:text-[10px] font-medium mt-1">Ajuste requerido en carga administrativa.</p>
          </div>
          <button onClick={() => setShowAuditPanel(false)} className="ml-2 lg:ml-4 p-1 hover:bg-white/20 rounded-lg"><X size={16} /></button>
        </div>
      )}
      
      <RecordModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingRecord(null); }} onSave={(r) => { if (editingRecord) { setData(prev => prev.map(item => item.id === r.id ? r : item)); setAdministrativeTasks(prev => prev.map(item => item.id === r.id ? r : item)); } else { setData(prev => [...prev, r]); } }} initialData={editingRecord} onNavigate={handleNavigate} />
      <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} data={allSchedules} currentViewType={viewType} currentSelectedItem={selectedFilter} onExport={handleExport} />
    </div>
  );
};

export default App;
