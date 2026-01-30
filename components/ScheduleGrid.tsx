
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isOtherFunctionsCourse, isAcademicMetaLoad, isContractualLoad, isExcludedFromTotalLoad } from '../services/businessRules';
import { ProcessedSchedule, ViewType, AvailabilityWindow, InstructorData, ScheduleCategory, AppMode, ModalityType, HolidayData } from '../types';
import { DAYS_OF_WEEK, getTimeSlots, TIME_START, COLORS, CONTRACT_HOURS_TC, getShortLabel, SEMESTER_START_DATE } from '../constants';
import {
  Clock, MapPin,
  CheckCircle, Briefcase, Hash, MonitorPlay,
  ShieldAlert, Coffee, Zap, BookOpen,
  Video, UserCircle, Settings, AlertTriangle,
  Info, Trash2, Link2Off, LayoutDashboard, Table as TableIcon, Calendar as CalendarIcon,
  ChevronRight, ChevronLeft, X, ShieldCheck, Activity, ChevronDown, ChevronUp, Layers,
  AlertCircle
} from 'lucide-react';
import DataTable from './DataTable';

const SEMESTER_END_DATE = new Date(2026, 5, 28); // 28/06/2026

interface ScheduleGridProps {
  schedules: ProcessedSchedule[];
  weekStartDate: Date;
  onEditRecord?: (record: ProcessedSchedule) => void;
  onDeleteRecord?: (id: string) => void;
  onIndividualizeTask?: (id: string, targetDate: Date) => void;
  viewType?: ViewType;
  appMode?: AppMode;
  availability?: AvailabilityWindow;
  onNavigate?: (type: ViewType, filter: string) => void;
  onNavigateWeek?: (weeks: number) => void;
  instructorsData?: InstructorData[];
  selectedFilterName?: string;
  onAddAdministrativeTask?: (day: string, startTime: string, duration: number, category: ScheduleCategory, modality: ModalityType) => void;
  holidays?: HolidayData[];
  onDeficitStatusChange?: (hasDeficit: boolean) => void;
  contentMode: 'grid' | 'table';
}

type InstructorType = 'TC' | 'TP';

const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  schedules,
  weekStartDate,
  onEditRecord,
  onDeleteRecord,
  onIndividualizeTask,
  viewType,
  appMode,
  instructorsData = [],
  selectedFilterName,
  onAddAdministrativeTask,
  onNavigate,
  onNavigateWeek,
  holidays = [],
  onDeficitStatusChange,
  contentMode
}) => {
  const allTimeSlots = getTimeSlots();
  const [instructorType, setInstructorType] = useState<InstructorType>('TC');
  const [activeEditorTool, setActiveEditorTool] = useState<ScheduleCategory>('asincrona');
  const [activeModality, setActiveModality] = useState<ModalityType>('virtual');
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [isSelectorExpanded, setIsSelectorExpanded] = useState(true);
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      // Calculamos el nuevo ancho basándonos en el movimiento del mouse
      // Limitamos el ancho entre 200px y 500px
      const newWidth = Math.min(Math.max(220, e.clientX - 20), 500);
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Evitar selección de texto durante el redimensionamiento
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'auto';
    };
  }, [isResizing]);

  const isEditorMode = appMode === 'editor' && viewType === 'Instructor';
  const isInstructorView = viewType === 'Instructor';

  const currentInstructorMeta = useMemo(() => {
    if (!isInstructorView || !selectedFilterName) return null;
    return instructorsData.find(i => i.name.toLowerCase() === selectedFilterName.toLowerCase());
  }, [instructorsData, selectedFilterName, isInstructorView]);

  useEffect(() => {
    if (currentInstructorMeta) {
      setInstructorType(currentInstructorMeta.type);
    }
  }, [currentInstructorMeta]);

  const HOUR_HEIGHT = 8;
  const SLOT_HEIGHT = HOUR_HEIGHT / 4;
  const TIME_COLUMN_WIDTH = '100px';

  const timeToMinutes = (t: string) => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const isHoliday = (date: Date) => {
    return holidays.find(h =>
      h.date.getDate() === date.getDate() &&
      h.date.getMonth() === date.getMonth() &&
      h.date.getFullYear() === date.getFullYear()
    );
  };

  const isScheduleActiveOnDate = (sched: ProcessedSchedule, date: Date, dayKey: string) => {
    if (!sched.days.includes(dayKey)) return false;
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const start = new Date(sched.startDate.getFullYear(), sched.startDate.getMonth(), sched.startDate.getDate()).getTime();
    const end = new Date(sched.endDate.getFullYear(), sched.endDate.getMonth(), sched.endDate.getDate()).getTime();
    return target >= start && target <= end;
  };

  const datesOfWeek = useMemo(() => {
    return DAYS_OF_WEEK.map((day, index) => {
      const date = new Date(weekStartDate);
      date.setDate(weekStartDate.getDate() + index);
      return { ...day, date };
    });
  }, [weekStartDate]);

  const stats = useMemo(() => {
    const academicSchedulesInFile = schedules.filter(s => !s.isAdministrative);
    let fileLoadHours = 0;
    let syncTotalMin = 0;
    let asyncTotalMin = 0;
    let prepTotalMin = 0;
    let otherFuncsTotalMin = 0;
    let assignTotalMin = 0;

    // --- CÁLCULO DE META DEL ARCHIVO (fileLoadHours) ---
    // En lugar de sumar por día (lo cual duplicaba carga en clases multi-día), 
    // sumamos cada tarea académica activa en ESTA semana una sola vez.
    const weekStartAt = datesOfWeek[0].date.getTime();
    const weekEndAt = datesOfWeek[datesOfWeek.length - 1].date.getTime();

    // Una tarea es válida si su rango de fechas [startDate, endDate] se solapa con la semana actual
    const activeTasksThisWeek = academicSchedulesInFile.filter(s => {
      return s.startDate.getTime() <= weekEndAt && s.endDate.getTime() >= weekStartAt;
    });

    fileLoadHours = activeTasksThisWeek.reduce((sum, s) => sum + s.weeklyHours, 0);

    const isHolidayInWeek = datesOfWeek.some(day => isHoliday(day.date));
    let hasDailyBreach = false;
    const dailyLimit = instructorType === 'TC' ? 9.2 : 7.0;

    datesOfWeek.forEach(day => {
      // REGLA 1: Ignorar días después del 28/06 en el cálculo de carga en calendario
      if (day.date > SEMESTER_END_DATE) return;

      const dayTasksInCalendar = schedules.filter(s => isScheduleActiveOnDate(s, day.date, day.key));
      let dayTotalMin = 0;

      dayTasksInCalendar.forEach(s => {
        const dur = (timeToMinutes(s.endTime) - timeToMinutes(s.startTime));
        if (isContractualLoad(s)) {
          dayTotalMin += dur;
        }

        if (isAcademicMetaLoad(s)) {
          const isAutoestudio = s.meetingType === 'VAEE' || (s.activity && s.activity.toUpperCase().includes('AUTOESTUDIO')) || s.category === 'asincrona';
          if (isAutoestudio) asyncTotalMin += dur;
          else syncTotalMin += dur;
        } else if (s.isAdministrative) {
          if (s.category === 'preparacion') prepTotalMin += dur;
          else if (s.category === 'coordinador') otherFuncsTotalMin += dur;
          else if (s.category === 'por_asignar') assignTotalMin += dur;
        } else if (isOtherFunctionsCourse(s)) {
          // Se cuenta para el total contractual (46h) pero no para la meta académica
          otherFuncsTotalMin += dur;
        }
      });

      if (dayTotalMin / 60 > dailyLimit + 0.01 && !isHoliday(day.date)) {
        hasDailyBreach = true;
      }
    });

    const syncH = syncTotalMin / 60;
    const asyncH = asyncTotalMin / 60;
    const otherH = otherFuncsTotalMin / 60;
    const academicLoad = syncH + asyncH + otherH;

    const totalContractHours = academicLoad + (prepTotalMin / 60) + (assignTotalMin / 60);

    // Una semana está fuera si es después del fin o antes del inicio del semestre
    const isWeekOutOfSemester = datesOfWeek[0].date > SEMESTER_END_DATE || datesOfWeek[datesOfWeek.length - 1].date < SEMESTER_START_DATE;

    const hasAcademicDiscrepancy = !isHolidayInWeek && !isWeekOutOfSemester && Math.abs(academicLoad - fileLoadHours) > 0.01;
    const hasContractDiscrepancy = !isHolidayInWeek && !isWeekOutOfSemester && instructorType === 'TC' && Math.abs(totalContractHours - CONTRACT_HOURS_TC) > 0.01;

    // REGLA DE ORO: Si es TC, la alerta se dispara si NO cumple las 46h O si hay exceso diario.
    // La discrepancia académica se vuelve informativa (opcional).
    const hasAuditWarning = (instructorType === 'TC' ? hasContractDiscrepancy : hasAcademicDiscrepancy) || hasDailyBreach;

    return {
      syncHours: syncH, asyncHours: asyncH, prepHours: prepTotalMin / 60, otherHours: otherH,
      assignHours: assignTotalMin / 60, fileLoadHours, academicLoad, totalContractHours, targetLoadForWeek: fileLoadHours,
      hasAcademicDiscrepancy, hasContractDiscrepancy, hasAuditWarning, hasDailyBreach,
      isDeficit: !isHolidayInWeek && academicLoad < fileLoadHours - 0.01,
      isHolidayInWeek, isWeekOutOfSemester
    };
  }, [schedules, datesOfWeek, instructorType, holidays]);

  const auditObservations = useMemo(() => {
    const list: { date: Date; type: 'academic' | 'contractual' | 'daily'; meta: number; real: number }[] = [];
    if (!isInstructorView || !selectedFilterName) return list;
    const isTC = instructorType === 'TC';
    const dailyLimit = isTC ? 9.2 : 7.0;

    // El escáner de auditoría siempre debe empezar desde el inicio del semestre
    let scannerDate = new Date(SEMESTER_START_DATE);
    const academicInFile = schedules.filter(s => !s.isAdministrative);

    // Auditar máximo hasta la semana que contiene el 28/06
    while (scannerDate <= SEMESTER_END_DATE) {
      let wTarget = 0, wSync = 0, wAsync = 0, wPC = 0, wCoord = 0, wAssign = 0;
      let hasHolidayInWeek = false;

      for (let d = 0; d < 7; d++) {
        const current = new Date(scannerDate); current.setDate(scannerDate.getDate() + d);

        // Si el día está fuera del semestre, no lo auditamos
        if (current > SEMESTER_END_DATE) continue;

        const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][current.getDay()];
        const isHol = isHoliday(current);
        if (isHol) {
          hasHolidayInWeek = true;
        }

        const fileSessions = academicInFile.filter(s => s.days.includes(dayName) && current >= s.startDate && current <= s.endDate);
        fileSessions.forEach(s => wTarget += s.weeklyHours);

        const calTasks = schedules.filter(s => s.days.includes(dayName) && current >= s.startDate && current <= s.endDate);
        let dayMinutesTotal = 0;

        calTasks.forEach(s => {
          const dur = (timeToMinutes(s.endTime) - timeToMinutes(s.startTime));
          if (isContractualLoad(s)) {
            dayMinutesTotal += dur;
          }

          if (isAcademicMetaLoad(s)) {
            const isAuto = s.meetingType === 'VAEE' || (s.activity && s.activity.toUpperCase().includes('AUTOESTUDIO')) || s.category === 'asincrona';
            if (isAuto) wAsync += dur / 60; else wSync += dur / 60;
          } else if (s.isAdministrative) {
            if (s.category === 'preparacion') wPC += dur / 60;
            else if (s.category === 'coordinador') wCoord += dur / 60;
            else if (s.category === 'por_asignar') wAssign += dur / 60;
          } else if (isOtherFunctionsCourse(s)) {
            wCoord += dur / 60;
          }
        });

        // Validación diaria
        const dayHours = dayMinutesTotal / 60;
        if (dayHours > dailyLimit + 0.01 && !isHol) {
          list.push({ date: new Date(current), type: 'daily', meta: dailyLimit, real: dayHours });
        }
      }

      // Si hay feriado, omitimos registrar observaciones semanales para esta semana
      if (!hasHolidayInWeek) {
        const currentAcademicReal = wSync + wAsync;

        // REGLA DE ORO: Si es TC, NO agregamos observaciones académicas a la lista (son opcionales)
        if (!isTC && Math.abs(currentAcademicReal - wTarget) > 0.01) {
          list.push({ date: new Date(scannerDate), type: 'academic', meta: wTarget, real: currentAcademicReal });
        }

        if (isTC) {
          const totalWeekContract = currentAcademicReal + wPC + wCoord + wAssign;
          if (Math.abs(totalWeekContract - CONTRACT_HOURS_TC) > 0.01) {
            list.push({ date: new Date(scannerDate), type: 'contractual', meta: CONTRACT_HOURS_TC, real: totalWeekContract });
          }
        }
      }
      scannerDate.setDate(scannerDate.getDate() + 7);
    }
    return list;
  }, [schedules, selectedFilterName, isInstructorView, holidays, instructorType]);

  useEffect(() => {
    if (isInstructorView) onDeficitStatusChange?.(stats.hasAuditWarning);
    else onDeficitStatusChange?.(false);
  }, [stats.hasAuditWarning, onDeficitStatusChange, isInstructorView]);

  const visibleTimeSlots = useMemo(() => {
    if (isEditorMode) return allTimeSlots;
    if (!isInstructorView || (schedules.length === 0)) return allTimeSlots;
    const latestMinutes = schedules.reduce((max, s) => Math.max(max, timeToMinutes(s.endTime)), 0);
    const clipLimitMinutes = latestMinutes > 0 ? Math.min(timeToMinutes("22:30"), latestMinutes + 60) : timeToMinutes("22:30");
    return allTimeSlots.filter(slot => timeToMinutes(slot.label) <= clipLimitMinutes);
  }, [allTimeSlots, schedules, isInstructorView, isEditorMode]);

  const TOTAL_GRID_HEIGHT = (visibleTimeSlots.length * SLOT_HEIGHT);

  const getCategoryStyles = (sched: ProcessedSchedule, isHolidayDay: boolean) => {
    const { category, modality, meetingType, activity } = sched;
    const isAutoestudio = meetingType === 'VAEE' || (activity && activity.toUpperCase().includes('AUTOESTUDIO'));
    if (sched.isAdministrative && isHolidayDay) return 'bg-rose-50 border-rose-300 border-dashed text-rose-700 opacity-60';
    switch (category) {
      case 'asincrona': return modality === 'presencial' ? 'bg-[#93bc81] border-[#7a9d6b] text-white' : 'bg-[#e4f4dd] border-[#93bc81] text-[#2d4a2d]';
      case 'preparacion': return modality === 'presencial' ? 'bg-[#EABC2D] border-[#c09a25] text-white' : 'bg-[#FFFA48] border-[#eabc2d] text-[#4a4600]';
      case 'por_asignar': return 'bg-violet-50 border-violet-200 text-violet-700';
      case 'refrigerio': return 'bg-slate-400 border-slate-500 text-white';
      case 'coordinador': return 'bg-[#e6fcf5] border-[#63e6be] text-[#087f5b]';
      case 'clase':
      default:
        if (isAutoestudio) return 'bg-slate-200 border-slate-300 text-slate-700';
        return 'bg-[#D9FFFF] border-cyan-200 text-slate-800';
    }
  };

  const getPosition = (time: string) => ((timeToMinutes(time) - TIME_START * 60) / 60) * HOUR_HEIGHT;
  const getDurationHeight = (start: string, end: string) => ((timeToMinutes(end) - timeToMinutes(start)) / 60) * HOUR_HEIGHT;

  const handleSlotClick = (dayKey: string, startTime: string) => {
    if (!isEditorMode || !onAddAdministrativeTask) return;
    const startMin = timeToMinutes(startTime);
    let requestedDuration = activeEditorTool === 'asincrona' ? 15 : (activeEditorTool === 'refrigerio' ? 45 : 60);
    const targetDayObj = datesOfWeek.find(d => d.key === dayKey);
    if (!targetDayObj) return;
    const existingAtStart = schedules.find(s => {
      if (!isScheduleActiveOnDate(s, targetDayObj.date, dayKey)) return false;
      const sStart = timeToMinutes(s.startTime); const sEnd = timeToMinutes(s.endTime);
      return startMin >= sStart && startMin < sEnd;
    });
    if (existingAtStart) return;
    const nextTask = schedules.filter(s => isScheduleActiveOnDate(s, targetDayObj.date, dayKey)).filter(s => timeToMinutes(s.startTime) > startMin).sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))[0];
    if (nextTask) {
      const availableGap = timeToMinutes(nextTask.startTime) - startMin;
      if (availableGap < 15) return;
      if (requestedDuration > availableGap) requestedDuration = availableGap;
    }
    let finalModality = activeModality;
    if (activeEditorTool === 'coordinador' || activeEditorTool === 'por_asignar') {
      finalModality = 'presencial';
    } else if (activeEditorTool === 'refrigerio') {
      finalModality = '' as any; // Neutral
    }

    onAddAdministrativeTask(dayKey, startTime, requestedDuration, activeEditorTool, finalModality);
  };

  const gridBorderClass = (isInstructorView && stats.hasAuditWarning)
    ? 'border-rose-600 ring-4 ring-rose-600 ring-opacity-50 border-[4px]'
    : 'border-slate-300';

  return (
    <div className={`flex flex-col xl:flex-row bg-white rounded-3xl shadow-xl border-2 relative w-full h-full overflow-hidden transition-all duration-500 ${gridBorderClass}`}>
      <style>{`
        @keyframes overlap-blink {
          0% { border-color: inherit; transform: scale(1); }
          50% { border-color: #ef4444 !important; box-shadow: 0 0 20px rgba(239, 68, 68, 0.8); border-width: 4px !important; transform: scale(1.02); }
          100% { border-color: inherit; transform: scale(1); }
        }
        .animate-overlap-error {
          animation: overlap-blink 1.5s infinite ease-in-out;
          z-index: 100 !important;
          border-style: solid !important;
        }
      `}</style>

      {isEditorMode && (
        <>
          <button
            onClick={() => setIsSelectorExpanded(!isSelectorExpanded)}
            className="xl:hidden w-full bg-slate-800 border-b border-slate-700 py-3 px-6 flex items-center justify-between text-white font-black uppercase text-[10px] tracking-widest z-[60]"
          >
            <div className="flex items-center space-x-2">
              <Settings size={14} className="text-blue-400" />
              <span>Tareas Administrativas</span>
            </div>
            {isSelectorExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          <div
            style={window.innerWidth >= 1280 ? { width: `${sidebarWidth}px` } : {}}
            className={`
              bg-slate-900 border-slate-800 flex flex-col shrink-0 overflow-y-auto custom-scrollbar z-50 transition-all duration-300
              ${isSelectorExpanded ? 'max-h-[800px] opacity-100 py-6 px-6' : 'max-h-0 opacity-0 py-0 px-6'}
              xl:max-h-none xl:opacity-100 xl:py-6 xl:border-r
              ${isResizing ? 'user-select-none' : ''}
            `}
          >
            <div className="flex flex-col md:flex-row xl:flex-col gap-6 md:gap-10">
              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center"><Settings size={14} className="mr-2 text-blue-400" />Tarea</h3>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-1 gap-2.5">
                  {[
                    { id: 'asincrona', label: 'Horas Asíncronas', icon: Zap, color: 'text-cyan-400' },
                    { id: 'preparacion', label: 'Preparación de Clase', icon: BookOpen, color: 'text-violet-400', disabled: instructorType === 'TP' },
                    { id: 'coordinador', label: 'Coordinador Carrera', icon: UserCircle, color: 'text-emerald-400' },
                    { id: 'por_asignar', label: 'Horas por Asignar', icon: Briefcase, color: 'text-violet-300', disabled: instructorType === 'TP' },
                    { id: 'refrigerio', label: 'Refrigerio', icon: Coffee, color: 'text-orange-400' },
                  ].map((tool) => (
                    <button
                      key={tool.id}
                      disabled={tool.disabled}
                      onClick={() => setActiveEditorTool(tool.id as ScheduleCategory)}
                      className={`flex items-center justify-between p-2.5 min-[1501px]:p-3.5 rounded-2xl transition-all border-2 ${tool.disabled ? 'opacity-20 cursor-not-allowed grayscale' : activeEditorTool === tool.id ? 'bg-white/10 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'border-transparent hover:bg-white/5'}`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <tool.icon size={16} className={`${tool.color} shrink-0`} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white truncate">{getShortLabel(tool.label)}</span>
                      </div>
                      {activeEditorTool === tool.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full md:w-[180px] xl:w-full pt-0 md:pt-0 xl:pt-6 xl:border-t border-white/10 flex flex-col gap-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center shrink-0"><MonitorPlay size={14} className="mr-2 text-blue-400" />Modalidad</h3>
                <div className={`flex flex-col p-1.5 rounded-2xl border border-white/5 w-full gap-2 ${activeEditorTool === 'refrigerio' ? 'bg-slate-900/50 opacity-40' : 'bg-slate-800 shadow-inner'}`}>
                  <button
                    disabled={activeEditorTool === 'por_asignar' || activeEditorTool === 'refrigerio' || activeEditorTool === 'coordinador'}
                    onClick={() => setActiveModality('presencial')}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center space-x-2 ${(activeModality === 'presencial' || activeEditorTool === 'coordinador' || activeEditorTool === 'por_asignar') ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <MapPin size={12} />
                    <span>Presencial</span>
                  </button>
                  <button
                    disabled={activeEditorTool === 'por_asignar' || activeEditorTool === 'refrigerio' || activeEditorTool === 'coordinador'}
                    onClick={() => setActiveModality('virtual')}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center space-x-2 ${(activeModality === 'virtual' && activeEditorTool !== 'coordinador' && activeEditorTool !== 'por_asignar' && activeEditorTool !== 'refrigerio') ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Video size={12} />
                    <span>Virtual</span>
                  </button>
                </div>
                {activeEditorTool === 'refrigerio' && <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest text-center">No aplica modalidad</p>}
                {(activeEditorTool === 'coordinador' || activeEditorTool === 'por_asignar') && <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest text-center">Forzado a Presencial</p>}
              </div>
            </div>
          </div>
          {/* Resizer Handle */}
          <div
            onMouseDown={() => setIsResizing(true)}
            className={`
              hidden xl:block w-1.5 h-full cursor-col-resize z-[60] -ml-1 transition-all
              ${isResizing ? 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]' : 'hover:bg-blue-600/30'}
            `}
          />
        </>
      )}

      <div className="flex-1 flex flex-col min-h-0 relative">
        <div className="flex-1 overflow-auto custom-scrollbar relative">
          {contentMode === 'grid' ? (
            <div className="min-w-[1100px] flex flex-col h-fit">
              <div className="flex border-b border-slate-300 bg-white sticky top-0 z-[70] shadow-sm">
                <div style={{ width: TIME_COLUMN_WIDTH }} className="flex-shrink-0 p-4 flex flex-col items-center justify-center font-black text-slate-400 text-[10px] uppercase tracking-[0.2em] border-r border-slate-200 bg-slate-50 sticky left-0 z-[80]"><span>Reloj</span><Clock size={12} className="mt-1 opacity-50" /></div>
                <div className="flex-1 grid grid-cols-7">
                  {datesOfWeek.map((day) => (
                    <div key={day.key} className="p-4 text-center border-r border-slate-200 last:border-r-0 flex flex-col items-center justify-center space-y-1 bg-white">
                      <div className="font-black text-slate-900 text-xs uppercase tracking-tighter">{day.label}</div>
                      <div className="text-[10px] text-blue-700 font-black bg-blue-50/50 px-3 py-0.5 rounded-full border border-blue-100 shadow-sm">{day.date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative flex bg-white" style={{ height: `${TOTAL_GRID_HEIGHT}rem` }}>
                <div style={{ width: TIME_COLUMN_WIDTH }} className="flex-shrink-0 bg-slate-50 border-r border-slate-300 z-30 sticky left-0 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                  {visibleTimeSlots.map((slot, idx) => (
                    <div key={`${slot.hour}-${slot.minute}`} className={`flex items-center justify-center border-slate-200 ${visibleTimeSlots[idx + 1]?.isMainHour ? 'border-b border-b-slate-300' : 'border-b border-dotted border-b-slate-200'}`} style={{ height: `${SLOT_HEIGHT}rem` }}>
                      <span className={`font-black tracking-tighter ${slot.isMainHour ? 'text-slate-900 text-[14px]' : 'text-slate-400 text-[9px]'}`}>{slot.label}</span>
                    </div>
                  ))}
                </div>

                <div className="flex-1 relative grid grid-cols-7 bg-white">
                  <div className="absolute inset-0 pointer-events-none z-0">
                    {visibleTimeSlots.map((_, idx) => <div key={`line-${idx}`} className={`w-full border-b ${visibleTimeSlots[idx + 1]?.isMainHour ? 'border-b-slate-300' : 'border-b-slate-200 border-dotted'}`} style={{ height: `${SLOT_HEIGHT}rem` }} />)}
                  </div>
                  {datesOfWeek.map((day) => {
                    const holiday = isHoliday(day.date);
                    const isOutOfPeriod = day.date > SEMESTER_END_DATE;
                    return (
                      <div key={day.key} className={`relative h-full border-r border-slate-200 last:border-r-0 z-10 ${isOutOfPeriod ? 'bg-slate-50/30' : ''}`}>
                        {isEditorMode && !holiday && !isOutOfPeriod && (
                          <div className="absolute inset-0 z-20">
                            {visibleTimeSlots.map((slot) => (
                              <div
                                key={`slot-${day.key}-${slot.label}`}
                                className="w-full hover:bg-blue-600/20 cursor-cell transition-colors"
                                style={{ height: `${SLOT_HEIGHT}rem` }}
                                onClick={() => handleSlotClick(day.key, slot.label)}
                              />
                            ))}
                          </div>
                        )}

                        {holiday && (
                          <div className="absolute left-[2px] right-[2px] bg-[#FEE2E2] border-2 border-rose-300 rounded-xl z-20 flex flex-col items-center justify-center p-4 text-center shadow-inner" style={{ top: `${getPosition("07:45")}rem`, height: `${getDurationHeight("07:45", "17:42")}rem` }}>
                            <AlertTriangle size={24} className="text-rose-500 mb-2" />
                            <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">{holiday.name}</p>
                          </div>
                        )}

                        {isOutOfPeriod && !holiday && (
                          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10">
                            <p className="font-black text-xs uppercase -rotate-45">Fin Periodo</p>
                          </div>
                        )}

                        {(() => {
                          const dayTasks = schedules.filter(s => isScheduleActiveOnDate(s, day.date, day.key));
                          const overlappingIds = new Set<string>();

                          for (let i = 0; i < dayTasks.length; i++) {
                            for (let j = i + 1; j < dayTasks.length; j++) {
                              const s1 = dayTasks[i];
                              const s2 = dayTasks[j];
                              const start1 = timeToMinutes(s1.startTime);
                              const end1 = timeToMinutes(s1.endTime);
                              const start2 = timeToMinutes(s2.startTime);
                              const end2 = timeToMinutes(s2.endTime);
                              if (start1 < end2 && start2 < end1) {
                                overlappingIds.add(s1.id);
                                overlappingIds.add(s2.id);
                              }
                            }
                          }

                          return dayTasks.map((sched) => {
                            const isOverlapping = overlappingIds.has(sched.id);
                            const catColor = getCategoryStyles(sched, !!holiday);
                            const isAutoestudio = sched.meetingType === 'VAEE' || (sched.activity && sched.activity.toUpperCase().includes('AUTOESTUDIO'));
                            const durationHours = (timeToMinutes(sched.endTime) - timeToMinutes(sched.startTime)) / 60;
                            const isLargeBlock = durationHours >= 1.5;
                            const overlapClass = isOverlapping ? 'animate-overlap-error' : '';

                            return (
                              <div
                                key={`${sched.id}-${day.key}`}
                                className={`absolute left-[5px] right-[5px] p-2.5 rounded-2xl border-l-[6px] shadow-lg overflow-hidden transition-all hover:scale-[1.015] hover:z-[60] cursor-pointer flex flex-col group z-30 ${catColor} ${overlapClass}`}
                                style={{ top: `${getPosition(sched.startTime)}rem`, height: `${getDurationHeight(sched.startTime, sched.endTime)}rem`, margin: '1px 0' }}
                                onClick={(e) => { e.stopPropagation(); onEditRecord?.(sched); }}
                              >
                                <div className="absolute top-1.5 right-1.5 flex space-x-1 opacity-0 group-hover:opacity-100 z-[80] transition-opacity">
                                  {(sched.isAdministrative || sched.courseName === 'REV Y CALIF CUADERNOS INFORME') && onIndividualizeTask && sched.startDate.getTime() !== sched.endDate.getTime() && (
                                    <button onClick={(e) => { e.stopPropagation(); onIndividualizeTask(sched.id, day.date); }} className="p-1.5 bg-black/5 hover:bg-blue-600 hover:text-white rounded-lg transition-all" title="Individualizar"><Link2Off size={12} /></button>
                                  )}
                                  {(sched.isAdministrative || sched.courseName === 'REV Y CALIF CUADERNOS INFORME') && onDeleteRecord && (
                                    <button onClick={(e) => { e.stopPropagation(); onDeleteRecord(sched.id); }} className="p-1.5 bg-black/5 hover:bg-rose-500 hover:text-white rounded-lg transition-all" title="Eliminar"><Trash2 size={12} /></button>
                                  )}
                                </div>
                                {!sched.isAdministrative ? (
                                  <>
                                    <div className="flex justify-between items-center font-black uppercase text-[8px] opacity-80 mb-1 shrink-0">
                                      <span onClick={(e) => { e.stopPropagation(); onNavigate?.('Bloque', sched.block); }} className="flex items-center hover:underline"><Hash size={8} className="mr-1" />NRC: {sched.nrc} • {sched.block}</span>
                                      <div className="flex items-center space-x-1">{sched.modality === 'presencial' ? <MapPin size={9} /> : <Video size={9} />}<span>{sched.modality?.toUpperCase()}</span></div>
                                    </div>
                                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden mb-1">
                                      <h4 onClick={(e) => { e.stopPropagation(); onNavigate?.('Bloque', sched.block); }} className={`font-black leading-tight text-slate-900 whitespace-normal break-words hover:underline xl:text-sm lg:text-[11px] text-[10px]`}>
                                        {isAutoestudio ? `${sched.courseName} (AUTOESTUDIO)` : sched.courseName}
                                        {isInstructorView && sched.activity && (
                                          <span className="ml-1.5 text-[8px] font-black bg-slate-900/10 text-slate-600 px-1 py-0.5 rounded-md align-middle">{sched.activity}</span>
                                        )}
                                      </h4>
                                      {!isInstructorView && (
                                        <div className="flex flex-col mt-0.5">
                                          <div onClick={(e) => { e.stopPropagation(); onNavigate?.('Instructor', sched.instructor); }} className={`font-bold text-slate-500 whitespace-normal break-words hover:underline hover:text-blue-600 transition-colors ${isLargeBlock ? 'text-[12px] mt-1' : 'text-[9px]'}`}>
                                            {sched.instructor}
                                          </div>
                                          {sched.activity && (
                                            <div className={`mt-0.5 font-black text-indigo-600 uppercase tracking-tighter ${isLargeBlock ? 'text-[10px]' : 'text-[8px]'}`}>
                                              TIPO: {sched.activity}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      <div className={`flex items-center flex-wrap gap-2 mt-auto pt-1 shrink-0 ${isLargeBlock ? 'justify-between' : ''}`}>
                                        <div onClick={(e) => { e.stopPropagation(); onNavigate?.('Aula', `${sched.building} - ${sched.room}`); }} className={`font-black text-slate-700 uppercase flex items-center hover:underline ${isLargeBlock ? 'text-[11px]' : 'text-[9px]'}`}><MapPin size={isLargeBlock ? 12 : 9} className="mr-1 shrink-0" /><span className="whitespace-nowrap">{sched.building} - {sched.room}</span></div>
                                        <div className={`font-black text-slate-500 flex items-center shrink-0 ${isLargeBlock ? 'text-[11px]' : 'text-[9px]'}`}><Clock size={isLargeBlock ? 12 : 9} className="mr-1" /><span className="whitespace-nowrap">{sched.startTime}-{sched.endTime}</span></div>
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex flex-col h-full items-center justify-center text-center px-1">
                                    <h4 className="font-black leading-tight uppercase text-[10px] whitespace-normal break-words">{getShortLabel(sched.courseName)} {sched.category !== 'coordinador' && sched.category !== 'refrigerio' ? `- ${sched.modality?.toUpperCase()}` : ''}</h4>
                                    <div className="font-black border-t border-black/5 w-full pt-1 mt-1 text-[10px]">{sched.startTime} - {sched.endTime}</div>
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 h-full flex flex-col overflow-hidden"><DataTable data={schedules} onEdit={(r) => onEditRecord?.(r)} onDelete={(id) => onDeleteRecord?.(id)} /></div>
          )}
        </div>

        {contentMode === 'grid' && onNavigateWeek && (
          <>
            <button
              onClick={() => onNavigateWeek(-1)}
              className="absolute left-[30px] top-1/2 -translate-y-1/2 z-[110] p-3 bg-white border-2 border-slate-200 rounded-full shadow-2xl text-slate-700 opacity-40 hover:opacity-100 hover:scale-110 active:scale-95 transition-all group"
              title="Semana Anterior"
            >
              <ChevronLeft size={24} className="group-hover:-translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={() => onNavigateWeek(1)}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-[110] p-3 bg-white border-2 border-slate-200 rounded-full shadow-2xl text-slate-700 opacity-40 hover:opacity-100 hover:scale-110 active:scale-95 transition-all group"
              title="Siguiente Semana"
            >
              <ChevronRight size={24} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </>
        )}

        {isInstructorView && (
          <div className="border-t-4 border-slate-900 bg-white shrink-0 shadow-[0_-15px_40px_rgba(0,0,0,0.15)] z-[100] relative">
            <div
              className="xl:hidden bg-slate-900 border-b border-white/10 px-8 py-4 flex items-center justify-between text-white cursor-pointer"
              onClick={() => setIsFooterExpanded(!isFooterExpanded)}
            >
              <div className="flex items-center space-x-4">
                <div className={`p-2 rounded-lg ${stats.hasAuditWarning ? 'bg-rose-600 animate-pulse' : 'bg-blue-600'}`}>
                  {stats.hasAuditWarning ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                </div>
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest leading-none">Resumen de Carga</h3>
                  <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Real: {stats.academicLoad.toFixed(2)}h / {stats.targetLoadForWeek.toFixed(2)}h</p>
                </div>
              </div>
              {isFooterExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            </div>

            <div className={`
              flex flex-col xl:flex-row items-stretch xl:items-center justify-between px-8 bg-slate-900 text-white transition-all duration-300 overflow-hidden
              ${isFooterExpanded ? 'max-h-[500px] py-6' : 'max-h-0 xl:max-h-none py-0 xl:py-5'}
            `}>
              <div className="flex items-center space-x-5">
                <div className={`hidden xl:block p-2.5 rounded-xl shadow-lg ${stats.hasAuditWarning ? 'bg-rose-600 animate-pulse' : 'bg-blue-600'}`}>
                  {stats.hasAuditWarning ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden xl:block">
                    <h3 className="text-sm font-black uppercase tracking-widest leading-none">Carga {instructorType}</h3>
                    <p className={`text-[10px] font-bold uppercase mt-1 ${stats.hasAuditWarning ? 'text-rose-300' : 'text-slate-400'}`}>
                      {stats.isWeekOutOfSemester ? 'Vigencia de Ciclo Finalizada' : stats.isHolidayInWeek ? 'Vigencia de Feriado (Auditoría Suspendida)' : stats.hasAuditWarning ? 'Alerta Detectada' : 'Estado Óptimo'}
                    </p>
                  </div>
                  {!stats.isHolidayInWeek && !stats.isWeekOutOfSemester && (
                    <button
                      onClick={() => setShowAuditModal(true)}
                      className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 px-4 py-2 text-[10px] w-full xl:w-auto justify-center"
                    >
                      <ShieldCheck size={14} />
                      <span className="whitespace-nowrap">Auditoría Detallada</span>
                    </button>
                  )}
                  {(stats.isHolidayInWeek || stats.isWeekOutOfSemester) && (
                    <div className={`flex items-center space-x-2 ${stats.isWeekOutOfSemester ? 'bg-slate-600' : 'bg-amber-500'} text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest`}>
                      <AlertCircle size={14} />
                      <span>{stats.isWeekOutOfSemester ? 'Fuera de Ciclo Lectivo' : 'Semana con Feriado'}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-4 xl:flex xl:items-center flex-wrap gap-x-6 gap-y-4 justify-center md:justify-end mt-6 xl:mt-0 pt-6 xl:pt-0 border-t border-white/10 xl:border-none">
                <div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-500 uppercase mb-1">Archivo</span><span className="text-base font-black text-blue-400">{stats.fileLoadHours.toFixed(2)}h</span></div>
                <div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-500 uppercase mb-1">Real</span><span className={`text-base font-black ${stats.hasAcademicDiscrepancy ? 'text-rose-400' : 'text-emerald-400'}`}>{stats.academicLoad.toFixed(2)}h</span></div>
                <div className="h-8 w-px bg-white/10 hidden xl:block" />
                <div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-500 uppercase mb-1">Sinc</span><span className="text-base font-black text-slate-200">{stats.syncHours.toFixed(2)}h</span></div>
                <div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-500 uppercase mb-1">Asinc</span><span className="text-base font-black text-slate-200">{stats.asyncHours.toFixed(2)}h</span></div>
                <div className="flex flex-col items-center"><span className="text-[8px] font-black text-blue-400 uppercase mb-1">Otros</span><span className="text-base font-black text-blue-300">{stats.otherHours.toFixed(2)}h</span></div>
                {instructorType === 'TC' && (
                  <>
                    <div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-500 uppercase mb-1">PC</span><span className="text-base font-black text-slate-200">{stats.prepHours.toFixed(2)}h</span></div>
                    <div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-500 uppercase mb-1">Asignar</span><span className="text-base font-black text-slate-200">{stats.assignHours.toFixed(2)}h</span></div>
                    <div className="h-8 w-px bg-white/10 hidden xl:block" />
                    <div className="flex flex-col items-center"><span className="text-[8px] font-black text-rose-400 uppercase mb-1">Meta 46h</span><span className={`text-lg font-black ${stats.hasContractDiscrepancy ? 'text-rose-500 animate-pulse' : 'text-emerald-400'}`}>{stats.totalContractHours.toFixed(2)}h</span></div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showAuditModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-5">
                <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-100"><ShieldCheck size={28} /></div>
                <div><h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase">Auditoría de Carga</h3><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{selectedFilterName} • {instructorType}</p></div>
              </div>
              <button onClick={() => setShowAuditModal(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-900"><X size={24} /></button>
            </div>
            <div className="p-10 overflow-y-auto custom-scrollbar flex-1 space-y-10">
              <section>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3"><div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Activity size={20} /></div><h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Auditoría Académica (Hasta 28/06)</h4></div>
                  {auditObservations.filter(o => o.type === 'academic').length === 0
                    ? <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><CheckCircle size={14} /><span>Sin discrepancias</span></div>
                    : <div className={`flex items-center space-x-2 ${instructorType === 'TC' ? 'text-amber-600 bg-amber-50' : 'text-rose-600 bg-rose-50'} px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest`}><AlertTriangle size={14} /><span>{instructorType === 'TC' ? 'Diferencia Informativa' : 'Observaciones'}</span></div>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {auditObservations.filter(o => o.type === 'academic').map((obs, i) => (
                    <div key={i} className={`p-5 ${instructorType === 'TC' ? 'bg-amber-50/30 border-amber-100' : 'bg-rose-50 border-rose-100'} border rounded-3xl flex items-center justify-between`}>
                      <div className="flex items-center space-x-4"><CalendarIcon size={20} className={instructorType === 'TC' ? 'text-amber-400' : 'text-rose-400'} /><div><p className={`text-[10px] font-black ${instructorType === 'TC' ? 'text-amber-800/60' : 'text-rose-800/60'} uppercase`}>Semana {obs.date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</p><p className={`text-xs font-black ${instructorType === 'TC' ? 'text-amber-900' : 'text-rose-900'}`}>Obs. Carga Académica</p></div></div>
                      <div className="text-right"><p className={`text-[10px] font-black ${instructorType === 'TC' ? 'text-amber-600' : 'text-rose-500'} uppercase`}>Dif: {(obs.real - obs.meta).toFixed(2)}h</p><p className={`text-[9px] font-bold ${instructorType === 'TC' ? 'text-amber-400' : 'text-rose-400'} uppercase`}>Total: {obs.real.toFixed(2)}h / {obs.meta.toFixed(2)}h</p></div>
                    </div>
                  ))}
                  {auditObservations.filter(o => o.type === 'academic').length === 0 && <div className="col-span-full p-10 border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center text-slate-300"><CheckCircle size={48} className="mb-4 opacity-20" /><p className="text-xs font-black uppercase tracking-widest">Carga académica perfecta.</p></div>}
                </div>
              </section>
              {instructorType === 'TC' && (
                <section className="pt-8 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3"><div className="p-2 bg-violet-50 text-violet-600 rounded-xl"><ShieldAlert size={20} /></div><h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Auditoría Contractual (Meta 46h)</h4></div>
                    {auditObservations.filter(o => o.type === 'contractual').length === 0 ? <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><CheckCircle size={14} /><span>Cumple 46h</span></div> : <div className="flex items-center space-x-2 text-rose-600 bg-rose-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><AlertTriangle size={14} /><span>Fuera de contrato</span></div>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {auditObservations.filter(o => o.type === 'contractual').map((obs, i) => (
                      <div key={i} className="p-5 bg-amber-50 border border-amber-100 rounded-3xl flex items-center justify-between">
                        <div className="flex items-center space-x-4"><Clock size={20} className="text-amber-500" /><div><p className="text-[10px] font-black text-amber-800/60 uppercase">Semana {obs.date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</p><p className="text-xs font-black text-amber-900">Obs. Contractual (Meta 46h)</p></div></div>
                        <div className="text-right"><p className="text-[10px] font-black text-amber-600 uppercase">Var: {(obs.real - 46).toFixed(2)}h</p><p className="text-[9px] font-bold text-amber-400 uppercase">Total: {obs.real.toFixed(2)}h / 46h</p></div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section className="pt-8 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3"><div className="p-2 bg-rose-50 text-rose-600 rounded-xl"><Clock size={20} /></div><h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Validación de Jornada Diaria</h4></div>
                  {auditObservations.filter(o => o.type === 'daily').length === 0
                    ? <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><CheckCircle size={14} /><span>Sin excesos</span></div>
                    : <div className="flex items-center space-x-2 text-rose-600 bg-rose-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><AlertTriangle size={14} /><span>Exceso detectado</span></div>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {auditObservations.filter(o => o.type === 'daily').map((obs, i) => (
                    <div key={i} className="p-5 bg-rose-50 border border-rose-100 rounded-3xl flex items-center justify-between">
                      <div className="flex items-center space-x-4"><Clock size={20} className="text-rose-400" /><div><p className="text-[10px] font-black text-rose-800/60 uppercase">{obs.date.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'short' })}</p><p className="text-xs font-black text-rose-900">Exceso Jornada (Límite {obs.meta}h)</p></div></div>
                      <div className="text-right"><p className="text-[10px] font-black text-rose-600 uppercase">Total: {obs.real.toFixed(2)}h</p><p className="text-[9px] font-bold text-rose-400 uppercase">Dif: +{(obs.real - obs.meta).toFixed(2)}h</p></div>
                    </div>
                  ))}
                  {auditObservations.filter(o => o.type === 'daily').length === 0 && <div className="col-span-full p-10 border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center text-slate-300"><CheckCircle size={48} className="mb-4 opacity-20" /><p className="text-xs font-black uppercase tracking-widest">Jornadas diarias correctas.</p></div>}
                </div>
              </section>
            </div>
            <div className="px-10 py-8 border-t border-slate-100 bg-slate-50/50 flex justify-end"><button onClick={() => setShowAuditModal(false)} className="px-12 py-4 bg-slate-900 text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl hover:bg-slate-800 transition-all active:scale-95">Cerrar</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleGrid;
