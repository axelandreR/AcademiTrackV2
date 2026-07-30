
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { isContractualLoad, resolveInstructorByName } from '../services/businessRules';
import { calculateWeeklyAudit } from '../services/auditCalculations';
import { ProcessedSchedule, ViewType, AvailabilityWindow, Instructor, ScheduleCategory, AppMode, ModalityType, HolidayData, ExtraHoursConfig } from '../types';
import { DAYS_OF_WEEK, getTimeSlots, TIME_START, COLORS, CONTRACT_HOURS_TC, getShortLabel, SEMESTER_START_DATE, SEMESTER_END_DATE } from '../constants';
import {
  Clock, MapPin, Hash, Video, LayoutDashboard, Table as TableIcon,
  ChevronRight, ChevronLeft, Layers, AlertTriangle
} from 'lucide-react';
import DataTable from './DataTable';
import AuditModal from './AuditModal';
import AuditFooter from './AuditFooter';
import ScheduleSidebar from './ScheduleSidebar';
import ScheduleCard from './ScheduleCard';
import ScheduleLegend from './ScheduleLegend';

interface ScheduleGridProps {
  schedules: ProcessedSchedule[];
  weekStartDate: Date;
  onEditRecord?: (record: ProcessedSchedule) => void;
  onDeleteRecord?: (id: string) => void;
  onIndividualizeTask?: (id: string, targetDate: Date) => void;
  viewType?: ViewType;
  appMode?: AppMode;
  availability?: AvailabilityWindow;
  onNavigate?: (type: ViewType, filter: string, instructorId?: string) => void;
  onNavigateWeek?: (weeks: number) => void;
  instructorsData?: Instructor[];
  selectedFilterName?: string;
  selectedInstructorId?: string;
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
  selectedInstructorId,
  onAddAdministrativeTask,
  onNavigate,
  onNavigateWeek,
  holidays = [],
  onDeficitStatusChange,
  contentMode
}) => {
  const allTimeSlots = getTimeSlots();
  const { instructorsByNameMap, instructorsMap, simulationConfig, isSimulationMode, extraHoursConfig, settings } = useData();

  // Misma fecha de fin de semestre configurable que usa el sidebar (settings.semester_end_date),
  // en vez de la constante fija — así la grilla y el punto rojo de Docentes nunca discrepan
  // entre sí. Distinta a propósito de la fecha límite de auditoría de Avance de Horarios.
  const semesterEndDateSetting = useMemo(() => {
    const raw = settings['semester_end_date'];
    return raw ? new Date(raw) : new Date(SEMESTER_END_DATE);
  }, [settings]);

  const [activeEditorTool, setActiveEditorTool] = useState<ScheduleCategory>('asincrona');
  const [activeModality, setActiveModality] = useState<ModalityType>('virtual');
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [isSelectorExpanded, setIsSelectorExpanded] = useState(true);
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);

  const isEditorMode = appMode === 'editor' && viewType === 'Instructor';
  const isInstructorView = viewType === 'Instructor';

  // El ID (cuando viene) manda sobre el nombre: lookup exacto O(1) contra instructorsMap,
  // sin depender de que selectedFilterName coincida palabra por palabra con el catálogo.
  const currentInstructorMeta = useMemo(() => {
    if (!isInstructorView || !selectedFilterName) return null;
    if (selectedInstructorId) return instructorsMap[selectedInstructorId] || null;
    return resolveInstructorByName(selectedFilterName, instructorsByNameMap, instructorsData) || null;
  }, [instructorsMap, instructorsByNameMap, instructorsData, selectedFilterName, selectedInstructorId, isInstructorView]);

  const instructorType = currentInstructorMeta?.type || 'TP';

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(220, e.clientX - 20), 500);
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'auto';
    };
  }, [isResizing]);

  const HOUR_HEIGHT = 8;
  const SLOT_HEIGHT = HOUR_HEIGHT / 4;
  const TIME_COLUMN_WIDTH = '128px';

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
    const weekStart = datesOfWeek[0].date;
    const week = calculateWeeklyAudit(instructorType, weekStart, schedules, holidays, semesterEndDateSetting);

    // Una semana está fuera si es después del fin o antes del inicio del semestre
    const isWeekOutOfSemester = datesOfWeek[0].date > semesterEndDateSetting || datesOfWeek[datesOfWeek.length - 1].date < SEMESTER_START_DATE;

    const base = {
      syncHours: week.syncHours, asyncHours: week.asyncHours, prepHours: week.prepHours, otherHours: week.otherHours,
      assignHours: week.assignHours, fileLoadHours: week.academicMeta, academicLoad: week.academicReal,
      totalContractHours: week.contractReal, targetLoadForWeek: week.academicMeta,
      isHolidayInWeek: week.isHolidayWeek, isWeekOutOfSemester
    };

    // OVERRIDE: Si estamos en simulación enfocada (horas extras), desactivar alertas visuales
    if (simulationConfig?.ignoreAudit) {
      return {
        ...base,
        hasAcademicDiscrepancy: false, hasContractDiscrepancy: false, hasAuditWarning: false,
        hasDailyBreach: false, isDeficit: false
      };
    }

    const hasAcademicDiscrepancy = !isWeekOutOfSemester && week.hasAcademicDiscrepancy;
    const hasContractDiscrepancy = !isWeekOutOfSemester && week.hasContractDiscrepancy;
    const hasDailyBreach = !isWeekOutOfSemester && week.hasDailyBreach;

    // REGLA DE ORO: Si es TC, la alerta se dispara si NO cumple las 46h O si hay exceso diario.
    // La discrepancia académica se vuelve informativa (opcional).
    const hasAuditWarning = (instructorType === 'TC' ? hasContractDiscrepancy : hasAcademicDiscrepancy) || hasDailyBreach;

    return {
      ...base,
      hasAcademicDiscrepancy, hasContractDiscrepancy, hasAuditWarning, hasDailyBreach,
      isDeficit: week.isHolidayWeek ? false : week.academicReal < week.academicMeta - 0.01
    };
  }, [schedules, datesOfWeek, instructorType, holidays, simulationConfig, semesterEndDateSetting]);

  const auditObservations = useMemo(() => {
    const list: { date: Date; type: 'academic' | 'contractual' | 'daily'; meta: number; real: number }[] = [];

    // OPTIMIZACIÓN: Ejecución perezosa. Solo calculamos si el modal está abierto.
    if (!showAuditModal || !isInstructorView || !selectedFilterName || simulationConfig?.ignoreAudit) return list;

    const isTC = instructorType === 'TC';
    const dailyLimit = isTC ? 9.2 : 7.0;
    const dailyLimitMins = dailyLimit * 60 + 0.01;

    let scannerDate = new Date(SEMESTER_START_DATE);

    while (scannerDate <= semesterEndDateSetting) {
      const week = calculateWeeklyAudit(instructorType, scannerDate, schedules, holidays, semesterEndDateSetting);

      if (week.hasDailyBreach) {
        for (let d = 0; d < 7; d++) {
          const current = new Date(scannerDate);
          current.setDate(scannerDate.getDate() + d);
          if (current > semesterEndDateSetting || isHoliday(current)) continue;

          const dayTasks = schedules.filter(s => isScheduleActiveOnDate(s, current, DAYS_OF_WEEK[(current.getDay() + 6) % 7].key));
          const dayMin = dayTasks.reduce((sum, s) => isContractualLoad(s) ? sum + (timeToMinutes(s.endTime) - timeToMinutes(s.startTime)) : sum, 0);
          if (dayMin > dailyLimitMins) {
            list.push({ date: new Date(current), type: 'daily', meta: dailyLimit, real: dayMin / 60 });
          }
        }
      }

      if (!week.isHolidayWeek) {
        if (!isTC && week.hasAcademicDiscrepancy) {
          list.push({ date: new Date(scannerDate), type: 'academic', meta: week.academicMeta, real: week.academicReal });
        }
        if (isTC && week.hasContractDiscrepancy) {
          list.push({ date: new Date(scannerDate), type: 'contractual', meta: CONTRACT_HOURS_TC, real: week.contractReal });
        }
      }
      scannerDate.setDate(scannerDate.getDate() + 7);
    }
    return list;
  }, [schedules, selectedFilterName, isInstructorView, holidays, instructorType, showAuditModal, semesterEndDateSetting]);

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

  // Etiqueta de fin de un slot de 15min (para la regleta de 2 columnas: inicio | fin).
  const addMinutesToLabel = (h: number, m: number, addMin: number) => {
    const total = h * 60 + m + addMin;
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

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

  const formatMinutesToTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

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
                <div style={{ width: TIME_COLUMN_WIDTH }} className="flex-shrink-0 p-4 flex flex-col items-center justify-center font-black text-slate-400 text-[10px] uppercase tracking-[0.2em] border-r border-slate-200 bg-slate-50 sticky left-0 z-[80]">
                  <div className="flex items-center space-x-1"><span>Reloj</span><ScheduleLegend /></div>
                  <Clock size={12} className="mt-1 opacity-50" />
                </div>
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
                  {visibleTimeSlots.map((slot, idx) => {
                    const endLabel = visibleTimeSlots[idx + 1]?.label || addMinutesToLabel(slot.hour, slot.minute, 15);
                    return (
                      <div key={`${slot.hour}-${slot.minute}`} className={`flex items-stretch justify-center divide-x divide-slate-200 border-slate-200 ${visibleTimeSlots[idx + 1]?.isMainHour ? 'border-b border-b-slate-300' : 'border-b border-dotted border-b-slate-200'}`} style={{ height: `${SLOT_HEIGHT}rem` }}>
                        <span className={`flex-1 flex items-center justify-center font-black tracking-tighter ${slot.isMainHour ? 'text-slate-900 text-[13px]' : 'text-slate-400 text-[9px]'}`}>{slot.label}</span>
                        <span className={`flex-1 flex items-center justify-center font-bold tracking-tighter ${slot.isMainHour ? 'text-slate-400 text-[11px]' : 'text-slate-300 text-[8px]'}`}>{endLabel}</span>
                      </div>
                    );
                  })}
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
                          const rawDayTasks = schedules.filter(s => isScheduleActiveOnDate(s, day.date, day.key));

                          // --- Lógica de Split para Horas Extras ---
                          let dayTasks: (ProcessedSchedule & { isExtra?: boolean })[] = [];

                          const checkExtra = isSimulationMode && extraHoursConfig && !holiday &&
                            (!extraHoursConfig.startDate || new Date(day.date) >= new Date(extraHoursConfig.startDate)) &&
                            (!extraHoursConfig.endDate || new Date(day.date) <= new Date(extraHoursConfig.endDate));

                          if (checkExtra) {
                            const dayShifts = extraHoursConfig!.shifts[day.key];
                            rawDayTasks.forEach(task => {
                              const taskStart = timeToMinutes(task.startTime);
                              const taskEnd = timeToMinutes(task.endTime);
                              let fragments: { start: number; end: number; extra: boolean }[] = [];

                              // We merge morning and afternoon shifts if they overlap or are contiguous (though usually they aren't)
                              // For simplicity, let's treat them separately
                              const extraWindows: { start: number; end: number }[] = [];
                              if (dayShifts?.morning?.start && dayShifts?.morning?.end) {
                                extraWindows.push({ start: timeToMinutes(dayShifts.morning.start), end: timeToMinutes(dayShifts.morning.end) });
                              }
                              if (dayShifts?.afternoon?.start && dayShifts?.afternoon?.end) {
                                extraWindows.push({ start: timeToMinutes(dayShifts.afternoon.start), end: timeToMinutes(dayShifts.afternoon.end) });
                              }

                              // Find split points
                              let splitPoints = new Set<number>([taskStart, taskEnd]);
                              extraWindows.forEach(win => {
                                if (win.start > taskStart && win.start < taskEnd) splitPoints.add(win.start);
                                if (win.end > taskStart && win.end < taskEnd) splitPoints.add(win.end);
                              });

                              const sortedPoints = Array.from(splitPoints).sort((a, b) => a - b);
                              for (let i = 0; i < sortedPoints.length - 1; i++) {
                                const s = sortedPoints[i];
                                const e = sortedPoints[i + 1];
                                const mid = (s + e) / 2;
                                const isExtra = extraWindows.some(win => mid >= win.start && mid <= win.end);
                                fragments.push({ start: s, end: e, extra: isExtra });
                              }

                              fragments.forEach(frag => {
                                dayTasks.push({
                                  ...task,
                                  startTime: formatMinutesToTime(frag.start),
                                  endTime: formatMinutesToTime(frag.end),
                                  isExtra: frag.extra
                                });
                              });
                            });
                          } else {
                            dayTasks = rawDayTasks;
                          }

                          const overlappingIds = new Set<string>();

                          if (!(isSimulationMode && simulationConfig?.ignoreAudit)) {
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
                          }

                          return dayTasks.map((sched, idx) => (
                            <ScheduleCard
                              key={`${sched.id}-${day.key}-${idx}`}
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
                              isExtra={sched.isExtra}
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
              aria-label="Semana anterior"
            >
              <ChevronLeft size={24} className="group-hover:-translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={() => onNavigateWeek(1)}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-[110] p-3 bg-white border-2 border-slate-200 rounded-full shadow-2xl text-slate-700 opacity-40 hover:opacity-100 hover:scale-110 active:scale-95 transition-all group"
              title="Siguiente Semana"
              aria-label="Siguiente semana"
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
