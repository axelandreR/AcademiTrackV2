
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { isOtherFunctionsCourse, isAcademicMetaLoad, isContractualLoad, isExcludedFromTotalLoad } from '../services/businessRules';
import { ProcessedSchedule, ViewType, AvailabilityWindow, Instructor, ScheduleCategory, AppMode, ModalityType, HolidayData } from '../types';
import { DAYS_OF_WEEK, getTimeSlots, TIME_START, COLORS, CONTRACT_HOURS_TC, getShortLabel, SEMESTER_START_DATE } from '../constants';
import {
  Clock, MapPin, Hash, Video, LayoutDashboard, Table as TableIcon,
  ChevronRight, ChevronLeft, Layers, AlertTriangle
} from 'lucide-react';
import DataTable from './DataTable';
import AuditModal from './AuditModal';
import AuditFooter from './AuditFooter';
import ScheduleSidebar from './ScheduleSidebar';
import ScheduleCard from './ScheduleCard';

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
  instructorsData?: Instructor[];
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

  const { instructorsByNameMap, simulationConfig, isSimulationMode } = useData();

  const currentInstructorMeta = useMemo(() => {
    if (!isInstructorView || !selectedFilterName) return null;
    return instructorsByNameMap[selectedFilterName.toLowerCase()] || null;
  }, [instructorsByNameMap, selectedFilterName, isInstructorView]);


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
      return isAcademicMetaLoad(s) && s.startDate.getTime() <= weekEndAt && s.endDate.getTime() >= weekStartAt;
    });

    fileLoadHours = activeTasksThisWeek.reduce((sum, s) => sum + s.weeklyHours, 0);

    const isHolidayInWeek = datesOfWeek.some(day => isHoliday(day.date));
    let hasDailyBreach = false;
    const dailyLimit = instructorType === 'TC' ? 9.2 : 7.0;
    const dailyLimitMins = instructorType === 'TC' ? 552.01 : 420.01;

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

      if (dayTotalMin > dailyLimitMins && !isHoliday(day.date)) {
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
    let hasAuditWarning = (instructorType === 'TC' ? hasContractDiscrepancy : hasAcademicDiscrepancy) || hasDailyBreach;

    // OVERRIDE: Si estamos en simulación enfocada (horas extras), desactivar alertas visuales
    if (simulationConfig?.ignoreAudit) {
      hasAuditWarning = false;
      // Opcionalmente podemos forzar las discrepancias a false también si queremos ocultar los colores rojos en los textos,
      // pero hasAuditWarning controla el modal y el punto rojo principal.
      // Si queremos limpiar todo:
      // hasContractDiscrepancy = false; // (const requires readjustment)
    }

    // OVERRIDE FINAL: Si la configuración de simulación ignora auditoría, forzamos todo a false/clean.
    if (simulationConfig?.ignoreAudit) {
      return {
        syncHours: syncH, asyncHours: asyncH, prepHours: prepTotalMin / 60, otherHours: otherH,
        assignHours: assignTotalMin / 60, fileLoadHours, academicLoad, totalContractHours, targetLoadForWeek: fileLoadHours,
        hasAcademicDiscrepancy: false,
        hasContractDiscrepancy: false,
        hasAuditWarning: false,
        hasDailyBreach: false,
        isDeficit: false,
        isHolidayInWeek, isWeekOutOfSemester
      };
    }

    return {
      syncHours: syncH, asyncHours: asyncH, prepHours: prepTotalMin / 60, otherHours: otherH,
      assignHours: assignTotalMin / 60, fileLoadHours, academicLoad, totalContractHours, targetLoadForWeek: fileLoadHours,
      hasAcademicDiscrepancy,
      hasContractDiscrepancy: simulationConfig?.ignoreAudit ? false : hasContractDiscrepancy, // Redundant but safe
      hasAuditWarning: simulationConfig?.ignoreAudit ? false : hasAuditWarning,
      hasDailyBreach: simulationConfig?.ignoreAudit ? false : hasDailyBreach,
      isDeficit: simulationConfig?.ignoreAudit ? false : (!isHolidayInWeek && academicLoad < fileLoadHours - 0.01),
      isHolidayInWeek, isWeekOutOfSemester
    };
  }, [schedules, datesOfWeek, instructorType, holidays, simulationConfig]);

  const auditObservations = useMemo(() => {
    const list: { date: Date; type: 'academic' | 'contractual' | 'daily'; meta: number; real: number }[] = [];

    // OPTIMIZACIÓN 1: Ejecución perezosa. Solo calculamos si el modal está abierto.
    if (!showAuditModal || !isInstructorView || !selectedFilterName || simulationConfig?.ignoreAudit) return list;

    const isTC = instructorType === 'TC';
    const dailyLimit = isTC ? 9.2 : 7.0;
    const scanDailyLimitMins = isTC ? 552.01 : 420.01;

    // OPTIMIZACIÓN 2: Pre-filtrado. Separamos administrativas de académicas una sola vez.
    const academicInFile = schedules.filter(s => !s.isAdministrative);

    // OPTIMIZACIÓN 3: Agrupación por día de la semana para evitar .filter internos costosos.
    const tasksByDay = {
      'LUNES': schedules.filter(s => s.days.includes('LUNES')),
      'MARTES': schedules.filter(s => s.days.includes('MARTES')),
      'MIERCOLES': schedules.filter(s => s.days.includes('MIERCOLES')),
      'JUEVES': schedules.filter(s => s.days.includes('JUEVES')),
      'VIERNES': schedules.filter(s => s.days.includes('VIERNES')),
      'SABADO': schedules.filter(s => s.days.includes('SABADO')),
      'DOMINGO': schedules.filter(s => s.days.includes('DOMINGO')),
    };

    let scannerDate = new Date(SEMESTER_START_DATE);

    while (scannerDate <= SEMESTER_END_DATE) {
      let wTarget = 0, wSync = 0, wAsync = 0, wPC = 0, wCoord = 0, wAssign = 0;
      let hasHolidayInWeek = false;

      const weekStart = new Date(scannerDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const weekStartAt = weekStart.getTime();
      const weekEndAt = weekEnd.getTime();

      // Meta Académica de la semana
      const weeklyMetaTasks = academicInFile.filter(s =>
        isAcademicMetaLoad(s) && s.startDate.getTime() <= weekEndAt && s.endDate.getTime() >= weekStartAt
      );
      wTarget = weeklyMetaTasks.reduce((sum, s) => sum + s.weeklyHours, 0);

      for (let d = 0; d < 7; d++) {
        const current = new Date(scannerDate);
        current.setDate(scannerDate.getDate() + d);
        if (current > SEMESTER_END_DATE) continue;

        const currentTime = current.getTime();
        const dayIdx = current.getDay();
        const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][dayIdx] as keyof typeof tasksByDay;

        const isHol = isHoliday(current);
        if (isHol) hasHolidayInWeek = true;

        // OPTIMIZACIÓN 4: Usamos el subset pre-filtrado por día.
        const calTasks = tasksByDay[dayName].filter(s => currentTime >= s.startDate.getTime() && currentTime <= s.endDate.getTime());
        let dayMinutesTotal = 0;

        calTasks.forEach(s => {
          const dur = (timeToMinutes(s.endTime) - timeToMinutes(s.startTime));
          if (isContractualLoad(s)) dayMinutesTotal += dur;

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

        if (dayMinutesTotal > scanDailyLimitMins && !isHol) {
          list.push({ date: new Date(current), type: 'daily', meta: dailyLimit, real: dayMinutesTotal / 60 });
        }
      }

      if (!hasHolidayInWeek) {
        const currentAcademicReal = wSync + wAsync;
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
  }, [schedules, selectedFilterName, isInstructorView, holidays, instructorType, showAuditModal]);

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

  // Estilos y visualización movidos a ScheduleCard.tsx

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

      <ScheduleSidebar
        isEditorMode={isEditorMode}
        isSelectorExpanded={isSelectorExpanded}
        setIsSelectorExpanded={setIsSelectorExpanded}
        sidebarWidth={sidebarWidth}
        isResizing={isResizing}
        setIsResizing={setIsResizing}
        activeEditorTool={activeEditorTool}
        setActiveEditorTool={setActiveEditorTool}
        instructorType={instructorType}
        activeModality={activeModality}
        setActiveModality={setActiveModality}
        currentHours={instructorType === 'TC' ? stats.totalContractHours : stats.academicLoad}
        maxHours={instructorType === 'TC' ? 46 : stats.fileLoadHours}
        suppressWarnings={isSimulationMode || simulationConfig?.ignoreAudit}
      />

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

                          return dayTasks.map((sched) => (
                            <ScheduleCard
                              key={`${sched.id}-${day.key}`}
                              sched={sched}
                              day={day}
                              isHolidayDay={!!holiday}
                              isInstructorView={isInstructorView}
                              isOverlapping={overlappingIds.has(sched.id)}
                              getPosition={getPosition}
                              getDurationHeight={getDurationHeight}
                              onEditRecord={onEditRecord}
                              onDeleteRecord={onDeleteRecord}
                              onIndividualizeTask={onIndividualizeTask}
                              onNavigate={onNavigate}
                            />
                          ));
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

        <AuditFooter
          isInstructorView={isInstructorView}
          instructorType={instructorType}
          stats={stats}
          isFooterExpanded={isFooterExpanded}
          setIsFooterExpanded={setIsFooterExpanded}
          setShowAuditModal={setShowAuditModal}
        />
      </div>

      <AuditModal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        instructorName={selectedFilterName || ''}
        instructorType={instructorType}
        observations={auditObservations}
      />
    </div>
  );
};

export default ScheduleGrid;
