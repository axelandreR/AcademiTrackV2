import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Filter, Search, ChevronRight as ChevronRightIcon,
    LayoutDashboard, Edit3, FileDown, ArrowRight, TrendingUp,
    PanelLeftClose, PanelLeft, ChevronDown, ChevronUp,
    BookOpen, Building2, UserRound, Eye, Table as TableIcon,
    AlertTriangle, Calendar as CalendarIcon, Check, X
} from 'lucide-react';
import JSZip from 'jszip';

import ScheduleGrid from '../components/ScheduleGrid';
import RecordModal from '../components/RecordModal';
import ExportModal from '../components/ExportModal';
import { useData } from '../context/DataContext';
import { ProcessedSchedule, ViewType, AppMode, ScheduleCategory, ModalityType, ExportConfig } from '../types';
import { generateScheduleExcel } from '../services/excelExporter';
import { DAYS_OF_WEEK, SEMESTER_START_DATE, SEMESTER_END_DATE, CUT_OFF_DATE } from '../constants';

const getStartOfWeek = (date: Date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
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

const SchedulePage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { allSchedules, data, administrativeTasks, rooms, instructors, holidays, setSchedules, setAdministrativeTasks, saveScheduleCloud, deleteScheduleCloud } = useData();

    // Estados locales de la vista
    const [appMode, setAppMode] = useState<AppMode>('schedule');
    const [viewType, setViewType] = useState<ViewType>('Bloque');
    const [sidebarSearchTerm, setSidebarSearchTerm] = useState('');
    const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
        const today = new Date();
        // Si hoy es antes del inicio del semestre (16/02/2026), saltamos a esa fecha.
        if (today < SEMESTER_START_DATE) return getStartOfWeek(SEMESTER_START_DATE);
        return getStartOfWeek(today);
    });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isWeekPickerOpen, setIsWeekPickerOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<ProcessedSchedule | null>(null);
    const [isSidebarVisible, setIsSidebarVisible] = useState(true);
    const [currentWeekDeficit, setCurrentWeekDeficit] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [contentMode, setContentMode] = useState<'grid' | 'table'>('grid');
    const [showAuditPanel, setShowAuditPanel] = useState(false);
    const [isInfoAccordionExpanded, setIsInfoAccordionExpanded] = useState(false);

    const lastTaskCreationRef = useRef<number>(0);
    const weekPickerRef = useRef<HTMLDivElement>(null);

    // Sincronizar URL con estado
    const selectedFilter = searchParams.get('filter') || '';

    useEffect(() => {
        const view = searchParams.get('view') as ViewType;
        if (view && ['Bloque', 'Aula', 'Instructor'].includes(view)) {
            setViewType(view);
        }
        const mode = searchParams.get('mode');
        if (mode === 'editor') setAppMode('editor');
    }, [searchParams]);

    const setSelectedFilter = (filter: string) => {
        setSearchParams(prev => {
            prev.set('filter', filter);
            return prev;
        });
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (weekPickerRef.current && !weekPickerRef.current.contains(event.target as Node)) {
                setIsWeekPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- Lógica de Semanas ---
    const semesterWeeks = useMemo(() => {
        if (allSchedules.length === 0) return [];

        // Si no hay horarios cargados aún, devolver array vacío
        const starts = allSchedules.map(s => s.startDate.getTime());
        const ends = allSchedules.map(s => s.endDate.getTime());

        if (starts.length === 0) return [];

        const globalMin = new Date(Math.min(...starts));
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
    }, [allSchedules]);

    // Inicializar semana actual si hay datos
    useEffect(() => {
        if (allSchedules.length > 0 && semesterWeeks.length > 0) {
            // Si la fecha actual no se ha seteado o es default, buscar la primera fecha válida
            // Opcional: Podríamos mantener la fecha actual si ya se seleccionó una
        }
    }, [allSchedules, semesterWeeks]);

    const navigateWeek = (weeks: number) => {
        setCurrentWeekStart(prev => { const next = new Date(prev); next.setDate(prev.getDate() + (weeks * 7)); return next; });
    };

    // --- Filtros Sidebar ---
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
            const tcSet = new Set<string>();
            const tpSet = new Set<string>();
            const activeInstructorNames = new Set<string>(allSchedules.map(s => s.instructor));

            // Clasificar instructores conocidos
            instructors.forEach(meta => {
                if (activeInstructorNames.has(meta.name)) {
                    if (meta.type === 'TC') tcSet.add(meta.name); else tpSet.add(meta.name);
                }
            });

            // Agregar instructores que tienen carga pero no están en la lista de meta (Default TP)
            activeInstructorNames.forEach(name => {
                if (!tcSet.has(name) && !tpSet.has(name) && name !== 'Sin asignar') {
                    tpSet.add(name);
                }
            });

            const filteredTc = [...tcSet].filter(i => i.toLowerCase().includes(term)).sort();
            const filteredTp = [...tpSet].filter(i => i.toLowerCase().includes(term)).sort();

            if (filteredTc.length > 0) groups.push({ groupName: 'TIEMPO COMPLETO (TC)', items: filteredTc });
            if (filteredTp.length > 0) groups.push({ groupName: 'TIEMPO PARCIAL (TP)', items: filteredTp });
        }
        return viewType === 'Instructor' ? groups : groups.sort((a, b) => a.groupName.localeCompare(b.groupName));
    }, [allSchedules, viewType, sidebarSearchTerm, rooms, instructors]);

    const toggleGroup = (groupName: string) => { const newExpanded = new Set(expandedGroups); if (newExpanded.has(groupName)) newExpanded.delete(groupName); else newExpanded.add(groupName); setExpandedGroups(newExpanded); };

    const changeViewType = (newType: ViewType) => {
        setViewType(newType);
        setSidebarSearchTerm('');
        setSearchParams(prev => {
            prev.set('view', newType);
            prev.delete('filter');
            return prev;
        });

        // Auto-expander primer grupo
        const firstGroup = groupedSidebarOptions.find(g => g.items.length > 0);
        if (firstGroup) {
            setExpandedGroups(new Set([firstGroup.groupName]));
        }
    };

    const checkInstructorDiscrepancy = (instructorName: string): boolean => {
        const inst = instructors.find(i => i.name === instructorName);
        if (!inst) return false;

        const weekStart = new Date(currentWeekStart);
        if (weekStart > SEMESTER_END_DATE) return false;

        // Regla: Si hay feriado en la semana, se suspende la auditoría (coincide con ScheduleGrid)
        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(weekStart); currentDate.setDate(weekStart.getDate() + i);
            if (holidays.find(h =>
                h.date.getDate() === currentDate.getDate() &&
                h.date.getMonth() === currentDate.getMonth() &&
                h.date.getFullYear() === currentDate.getFullYear()
            )) return false;
        }

        const isTC = inst.type === 'TC';
        const academicSchedulesInFile = allSchedules.filter(s => s.instructor === instructorName && !s.isAdministrative);
        const instSchedules = allSchedules.filter(s => s.instructor === instructorName);
        let metaCarga = 0;
        let cargaReal = 0;
        let totalSemana = 0;

        // Carga Meta (Archivo) - Calculada una sola vez para la semana (evita duplicidad y rescata horas flotantes)
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
        const activeAcademicTasks = academicSchedulesInFile.filter(s => s.startDate <= weekEnd && s.endDate >= weekStart);
        metaCarga = activeAcademicTasks.reduce((sum, s) => sum + s.weeklyHours, 0);

        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(weekStart); currentDate.setDate(weekStart.getDate() + i);
            if (currentDate > SEMESTER_END_DATE) continue;

            const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][currentDate.getDay()];

            // Carga Real (Clases + Administrativas elegibles)
            instSchedules.filter(s => s.days.includes(dayName) && currentDate >= s.startDate && currentDate <= s.endDate).forEach(s => {
                const dur = (timeToMinutes(s.endTime) - timeToMinutes(s.startTime)) / 60;

                // REGLA: Excluimos refrigerio del total contractual 46h
                if (s.category !== 'refrigerio') {
                    totalSemana += dur;
                }

                if (!s.isAdministrative) {
                    cargaReal += dur;
                } else {
                    const isAuto = s.meetingType === 'VAEE' || (s.activity && s.activity.toUpperCase().includes('AUTOESTUDIO')) || s.category === 'asincrona';
                    if (isAuto || s.category === 'asincrona' || s.category === 'preparacion' || s.category === 'coordinador') cargaReal += dur;
                }
            });
        }

        const academicDiscrepancy = Math.abs(cargaReal - metaCarga) > 0.01;

        if (isTC) {
            // Regla de Oro para TC: Cumplir la meta de 46h. La discrepancia académica es opcional.
            return Math.abs(totalSemana - 46) > 0.01;
        } else {
            // Para TP: Sigue siendo primordial que la carga académica coincida.
            return academicDiscrepancy;
        }
    };

    const handleExport = async (config: ExportConfig) => {
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

        // Usamos la fecha de corte centralizada
        const baseStartDate = new Date(currentWeekStart);
        baseStartDate.setHours(0, 0, 0, 0);

        let finalEndDate: Date;
        if (baseStartDate <= CUT_OFF_DATE) {
            finalEndDate = new Date(CUT_OFF_DATE);
        } else {
            finalEndDate = new Date(baseStartDate);
            finalEndDate.setDate(baseStartDate.getDate() + 6);
            if (finalEndDate > SEMESTER_END_DATE) {
                finalEndDate = new Date(SEMESTER_END_DATE);
            }
        }
        finalEndDate.setHours(23, 59, 59, 999);

        // --- Escáner de Colisiones Futuras (Blindaje contra solapamientos) ---
        // Verificamos semana a semana si ya existe algo en este slot para este docente.
        // Si hay colisión, recortamos el finalEndDate para que se detenga antes de chocar.
        let scanner = new Date(baseStartDate);
        scanner.setDate(scanner.getDate() + 7); // Empezamos a verificar desde la siguiente semana

        while (scanner <= finalEndDate) {
            const collision = allSchedules.find(s => {
                if (s.instructor !== selectedFilter || !s.days.includes(day)) return false;
                const sStart = timeToMinutes(s.startTime);
                const sEnd = timeToMinutes(s.endTime);
                const hasTimeOverlap = (startMin < sEnd && endMin > sStart);
                if (!hasTimeOverlap) return false;

                // Verificar si la fecha del escáner cae dentro del rango de la tarea s
                const scanTime = scanner.getTime();
                return scanTime >= s.startDate.getTime() && scanTime <= s.endDate.getTime();
            });

            if (collision) {
                // Si hay choque, el bloque nuevo termina el domingo de la semana ANTERIOR
                const newLimit = new Date(scanner);
                const daysToBack = scanner.getDay() === 0 ? 7 : scanner.getDay();
                newLimit.setDate(scanner.getDate() - daysToBack);
                finalEndDate = new Date(newLimit);
                finalEndDate.setHours(23, 59, 59, 999);
                break;
            }
            scanner.setDate(scanner.getDate() + 7);
        }

        const newTask: ProcessedSchedule = {
            id: `admin-${Date.now()}-${Math.floor(Math.random() * 1000)}`, courseCode: 'ADMIN', courseName: category === 'refrigerio' ? 'REFRIGERIO' : (category === 'preparacion' ? 'PREPARACIÓN DE CLASE' : (category === 'asincrona' ? 'ASÍNCRONA' : category.toUpperCase().replace('_', ' '))),
            activity: category === 'asincrona' ? 'AUTOESTUDIO' : category.toUpperCase(), meetingType: category === 'asincrona' ? 'VAEE' : 'ADMIN', block: 'ADMIN', instructor: selectedFilter, instructorId: instructor?.id || '', room: effectiveModality === 'virtual' ? 'VIRTUAL' : 'POR DEFINIR', building: effectiveModality === 'virtual' ? 'REMOTO' : 'CAMPUS', days: [day], startTime, endTime, startDate: baseStartDate, endDate: finalEndDate, career: instructor?.specialty || 'GENERAL', nrc: '0000', color: 'bg-slate-100', weeklyHours: duration / 60, aforo: 0, periodo: allSchedules[0]?.periodo || '202510', semestre: 'N/A', category, isAdministrative: true, modality: effectiveModality
        };
        // Sincronizar con la nube (El contexto se encarga de actualizar el estado local)
        saveScheduleCloud(newTask);
    };

    const handleIndividualizeTask = (taskId: string, targetDate: Date) => {
        // Try finding in administrative tasks first
        const adminTaskIndex = administrativeTasks.findIndex(t => t.id === taskId);

        if (adminTaskIndex !== -1) {
            const task = administrativeTasks[adminTaskIndex];
            const targetTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
            const startTime = new Date(task.startDate.getFullYear(), task.startDate.getMonth(), task.startDate.getDate()).getTime();
            const endTime = new Date(task.endDate.getFullYear(), task.endDate.getMonth(), task.endDate.getDate()).getTime();

            if (startTime === endTime) return;

            const splitTasks: ProcessedSchedule[] = [];
            if (startTime < targetTime) {
                const pastEndDate = new Date(targetTime); pastEndDate.setDate(pastEndDate.getDate() - 1);
                splitTasks.push({ ...task, id: `past-${Date.now()}-${Math.random()}`, endDate: pastEndDate });
            }
            splitTasks.push({ ...task, id: `indiv-${Date.now()}-${Math.random()}`, startDate: new Date(targetTime), endDate: new Date(targetTime) });
            if (endTime > targetTime) {
                const futureStartDate = new Date(targetTime); futureStartDate.setDate(futureStartDate.getDate() + 1);
                splitTasks.push({ ...task, id: `future-${Date.now()}-${Math.random()}`, startDate: futureStartDate });
            }

            deleteScheduleCloud(taskId);
            saveScheduleCloud(splitTasks);
            return;
        }

        // Try finding in academic tasks (ONLY for 'REV Y CALIF CUADERNOS INFORME')
        const acadTaskIndex = filteredData.findIndex(t => t.id === taskId);
        if (acadTaskIndex !== -1) {
            const task = filteredData[acadTaskIndex];
            if (task.courseName !== 'REV Y CALIF CUADERNOS INFORME') return;

            const targetTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
            const startTime = new Date(task.startDate.getFullYear(), task.startDate.getMonth(), task.startDate.getDate()).getTime();
            const endTime = new Date(task.endDate.getFullYear(), task.endDate.getMonth(), task.endDate.getDate()).getTime();

            if (startTime === endTime) return;

            const splitTasks: ProcessedSchedule[] = [];
            if (startTime < targetTime) {
                const pastEndDate = new Date(targetTime); pastEndDate.setDate(pastEndDate.getDate() - 1);
                splitTasks.push({ ...task, id: `past-${Date.now()}-${Math.random()}`, endDate: pastEndDate });
            }
            splitTasks.push({ ...task, id: `indiv-${Date.now()}-${Math.random()}`, startDate: new Date(targetTime), endDate: new Date(targetTime) });
            if (endTime > targetTime) {
                const futureStartDate = new Date(targetTime); futureStartDate.setDate(futureStartDate.getDate() + 1);
                splitTasks.push({ ...task, id: `future-${Date.now()}-${Math.random()}`, startDate: futureStartDate });
            }

            deleteScheduleCloud(taskId);
            saveScheduleCloud(splitTasks);
        }
    };


    const handleNavigate = (type: ViewType, filter: string) => {
        // Redirigir a la misma página pero cambiando los parámetros
        // Esto permite que el historial del navegador funcione correctamente
        setSearchParams({ view: type, filter });
        // Auto-expandir grupos relacionados
        if (type === 'Bloque') { const schedule = allSchedules.find(s => s.block === filter); if (schedule) setExpandedGroups(new Set([schedule.career])); }
        else if (type === 'Aula') { const room = rooms.find(r => r.roomKey === filter); if (room) setExpandedGroups(new Set([room.type])); }
        else if (type === 'Instructor') { const meta = instructors.find(i => i.name === filter); if (meta) setExpandedGroups(new Set([meta.type === 'TC' ? 'TIEMPO COMPLETO (TC)' : 'TIEMPO PARCIAL (TP)'])); }
        setIsSidebarVisible(true);
    };

    const filteredData = useMemo(() => {
        if (!selectedFilter) return [];
        return allSchedules.filter(s => {
            if (viewType === 'Bloque') return s.block === selectedFilter;
            if (viewType === 'Aula') return `${s.building} - ${s.room}` === selectedFilter;
            if (viewType === 'Instructor') return s.instructor === selectedFilter;
            return false;
        });
    }, [allSchedules, viewType, selectedFilter]);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col h-screen overflow-hidden">
            <header className="bg-white border-b border-slate-200 px-8 py-3 lg:py-4 flex flex-col lg:flex-row lg:items-center justify-between sticky top-0 z-[100] shadow-sm shrink-0">
                <div className="flex items-center justify-between w-full lg:w-auto">
                    <div className="flex items-center space-x-6">
                        <button
                            onClick={() => navigate('/progress')}
                            className="flex items-center space-x-2 px-4 py-2 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all border border-slate-100 font-bold text-xs uppercase tracking-widest shadow-sm"
                        >
                            <TrendingUp size={16} />
                            <span className="hidden sm:inline">Avance Horarios</span>
                        </button>
                        <div className="flex items-center space-x-4 lg:space-x-8">
                            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/')}>
                                <div className="p-2 lg:p-2.5 bg-slate-900 rounded-xl lg:rounded-2xl text-white shadow-lg shrink-0"><CalendarIcon size={20} /></div>
                                <div>
                                    <h1 className="text-base lg:text-lg font-black text-slate-900 leading-none">AcademiTrack</h1>
                                    <p className="text-[9px] lg:text-[10px] text-slate-400 mt-1 uppercase tracking-[0.2em] font-black hidden md:block">{appMode === 'editor' ? 'Editor Docente' : 'Visualizador'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden min-h-0 relative">
                <aside className={`${isSidebarVisible ? 'w-full md:w-[260px] min-[1501px]:w-[320px]' : 'w-0 overflow-hidden'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 h-full z-40 shadow-lg shrink-0`}>
                    <div className="p-4 lg:p-5 border-b border-slate-100 shrink-0 bg-slate-50/30">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center hidden min-[1030px]:flex"><Filter size={12} className="mr-2" />Categorización</h2>
                            <button onClick={() => setIsSidebarVisible(false)} className="p-1.5 text-slate-400 hover:text-slate-800 transition-colors">
                                <PanelLeftClose size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-3 min-[1030px]:grid-cols-1 gap-2">
                            <button onClick={() => changeViewType('Bloque')} title="Bloques" className={`flex items-center justify-center min-[1030px]:justify-start px-3 py-3 min-[1030px]:px-4 rounded-xl transition-all ${viewType === 'Bloque' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-100'}`}>
                                <LayoutDashboard size={20} className="min-[1030px]:mr-3" />
                                <span className="font-black text-[11px] uppercase tracking-widest hidden min-[1030px]:inline">Bloques</span>
                            </button>
                            <button onClick={() => changeViewType('Aula')} title="Ambientes" className={`flex items-center justify-center min-[1030px]:justify-start px-3 py-3 min-[1030px]:px-4 rounded-xl transition-all ${viewType === 'Aula' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-100'}`}>
                                <Building2 size={20} className="min-[1030px]:mr-3" />
                                <span className="font-black text-[11px] uppercase tracking-widest hidden min-[1030px]:inline">Ambientes</span>
                            </button>
                            <button onClick={() => changeViewType('Instructor')} title="Docentes" className={`flex items-center justify-center min-[1030px]:justify-start px-3 py-3 min-[1030px]:px-4 rounded-xl transition-all ${viewType === 'Instructor' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-100'}`}>
                                <UserRound size={20} className="min-[1030px]:mr-3" />
                                <span className="font-black text-[11px] uppercase tracking-widest hidden min-[1030px]:inline">Docentes</span>
                            </button>
                        </div>
                    </div>

                    <div className="p-5 flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="relative mb-4"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder={`Buscar ${viewType}...`} value={sidebarSearchTerm} onChange={(e) => setSidebarSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-100 border-none rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all" /></div>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">{groupedSidebarOptions.map((group) => (<div key={group.groupName} className="mb-2"><button onClick={() => toggleGroup(group.groupName)} className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors mb-1 shadow-sm"><div className="flex items-center space-x-2">{viewType === 'Bloque' ? <BookOpen size={14} className="text-blue-500" /> : viewType === 'Aula' ? <Building2 size={14} className="text-orange-500" /> : <UserRound size={14} className="text-indigo-500" />}<span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[180px]">{group.groupName}</span></div>{expandedGroups.has(group.groupName) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>{expandedGroups.has(group.groupName) && (<div className="pl-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">{group.items.map(item => (<button key={item} onClick={() => setSelectedFilter(item)} className={`w-full text-left px-4 py-2.5 rounded-lg text-[10px] font-black transition-all flex items-center justify-between border ${selectedFilter === item ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'text-slate-600 hover:bg-slate-100 border-transparent'}`}><span className="truncate">{item}</span><ChevronRightIcon size={12} /></button>))}</div>)}</div>))}</div>
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
                                        {viewType === 'Bloque' ? <LayoutDashboard size={20} className="text-blue-600 lg:w-6 lg:h-6" /> : viewType === 'Aula' ? <Building2 size={20} className="text-orange-600 lg:w-6 lg:h-6" /> : <UserRound size={20} className="text-indigo-600 lg:w-6 lg:h-6" />}
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
                        </div>

                        <div className="flex-1 min-h-0 relative">
                            <ScheduleGrid
                                schedules={filteredData}
                                weekStartDate={currentWeekStart}
                                onEditRecord={(r) => { setEditingRecord(r); setIsModalOpen(true); }}
                                onDeleteRecord={(id) => {
                                    deleteScheduleCloud(id);
                                    setSchedules(prev => prev.filter(r => r.id !== id));
                                    setAdministrativeTasks(prev => prev.filter(r => r.id !== id));
                                }}
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
                    <div className="p-2 lg:p-3 bg-white/20 rounded-xl lg:rounded-2xl"><AlertTriangle size={24} /></div>
                    <div>
                        <p className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Carga Académica</p>
                        <h4 className="text-xs lg:text-sm font-black uppercase">¡OBSERVACIÓN DETECTADA!</h4>
                        <p className="text-[9px] lg:text-[10px] font-medium mt-1">Ajuste requerido en carga administrativa.</p>
                    </div>
                    <button onClick={() => setShowAuditPanel(false)} className="ml-2 lg:ml-4 p-1 hover:bg-white/20 rounded-lg"><X size={16} /></button>
                </div>
            )}

            <RecordModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingRecord(null); }} onSave={(r) => {
                saveScheduleCloud(r);
            }} initialData={editingRecord} onNavigate={handleNavigate} />
            <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} data={allSchedules} currentViewType={viewType} currentSelectedItem={selectedFilter} onExport={handleExport} />
        </div>
    );
};

export default SchedulePage;
