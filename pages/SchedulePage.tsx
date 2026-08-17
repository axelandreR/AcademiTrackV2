import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    PanelLeft, LayoutDashboard, Building2, UserRound, ChevronUp, ChevronDown
} from 'lucide-react';

import ScheduleGrid from '../components/ScheduleGrid';
import RecordModal from '../components/RecordModal';
import ExportModal from '../components/ExportModal';
import { useData } from '../context/DataContext';
import { ProcessedSchedule, ViewType, AppMode, ScheduleCategory, ModalityType, ExportConfig } from '../types';
import { isAcademicMetaLoad, isContractualLoad, normalizeNameKey, belongsToInstructor, buildInstructorScheduleIndex, getInstructorSchedules, resolveInstructorByName } from '../services/businessRules';
import { DAYS_OF_WEEK, SEMESTER_START_DATE, SEMESTER_END_DATE, CUT_OFF_DATE, ACTIVE_PERIODO } from '../constants';
import { buildInstructorEmailSummary } from '../services/instructorEmailSummary';
import InstructorEmailModal from '../components/InstructorEmailModal';
import SkeletonGrid from '../components/SkeletonGrid';
import CommandPalette, { SearchItem } from '../components/CommandPalette';
import ConfirmDialog from '../components/ConfirmDialog';

import { useScheduleNavigation } from '../hooks/useScheduleNavigation';
import { useScheduleCalculations } from '../hooks/useScheduleCalculations';
import { useScheduleActions } from '../hooks/useScheduleActions';
import { timeToMinutes, getStartOfWeek } from '../utils/timeUtils';

import NavigationSidebar from '../components/NavigationSidebar';
import ScheduleHeader from '../components/ScheduleHeader';
import ScheduleToolbar from '../components/ScheduleToolbar';
import AuditAlert from '../components/AuditAlert';
import SimulationBar from '../components/SimulationBar';
import SimulationsList from '../components/SimulationsList';

interface SidebarItem {
    label: string;
    id?: string; // ID del instructor (solo viewType Instructor); ausente para Bloque/Aula
}

interface GroupedOption {
    groupName: string;
    items: SidebarItem[];
}

const SchedulePage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const {
        allSchedules, data, administrativeTasks, rooms, instructors, holidays,
        saveScheduleCloud, deleteScheduleCloud, saveRoomCloud,
        instructorsByNameMap, instructorsMap, roomsMap, settings, loadSchedulesForFilter, globalSchedulesSummary,
        startSimulation, isSimulationMode
    } = useData();

    // Estados locales de la vista
    const [appMode, setAppMode] = useState<AppMode>('schedule');
    const [viewType, setViewType] = useState<ViewType>('Bloque');
    const [sidebarSearchTerm, setSidebarSearchTerm] = useState('');
    const { currentWeekStart, semesterWeeks, navigateWeek, setCurrentWeekStart } = useScheduleNavigation(allSchedules, settings);
    const { checkInstructorDiscrepancy } = useScheduleCalculations(currentWeekStart);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    // Borrado de una tarea de la grilla: se confirma con ConfirmDialog antes de tocar la nube.
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    // Sincronizar URL con estado
    const selectedFilter = searchParams.get('filter') || '';
    // ID del instructor seleccionado (solo relevante en viewType Instructor). Es el
    // identificador "real" — el nombre en selectedFilter queda solo para mostrar en
    // pantalla (título, breadcrumb, buscador), nunca para decidir de quién se trata.
    const selectedInstructorId = viewType === 'Instructor' ? (searchParams.get('id') || '') : '';


    const {
        handleExport,
        handleExportAdminTasks,
        handleAddAdministrativeTask,
        handleIndividualizeTask
    } = useScheduleActions(
        currentWeekStart,
        selectedFilter,
        viewType,
        setIsExportModalOpen,
        checkInstructorDiscrepancy,
        selectedInstructorId
    );

    const [isWeekPickerOpen, setIsWeekPickerOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<ProcessedSchedule | null>(null);
    const [isSidebarVisible, setIsSidebarVisible] = useState(true);
    const [currentWeekDeficit, setCurrentWeekDeficit] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [contentMode, setContentMode] = useState<'grid' | 'table'>('grid');
    const [showAuditPanel, setShowAuditPanel] = useState(false);
    const [isInfoAccordionExpanded, setIsInfoAccordionExpanded] = useState(false);
    const [isPaletteOpen, setIsPaletteOpen] = useState(false);
    const [activeAuditFilter, setActiveAuditFilter] = useState<'none' | 'deficit' | 'perfect'>('none');

    const weekPickerRef = useRef<HTMLDivElement>(null);

    // Al entrar SIN parámetros en la URL (ej. volviendo desde Avance de Horarios o el menú),
    // restaura la última selección para no obligar a re-navegar el árbol de la sidebar.
    // Una URL con parámetros (link profundo) siempre manda sobre lo guardado.
    useEffect(() => {
        if (searchParams.get('view') || searchParams.get('filter')) return;
        try {
            const saved = sessionStorage.getItem('schedulePageSelection');
            if (!saved) return;
            const { view, filter, id } = JSON.parse(saved) as { view?: string; filter?: string; id?: string };
            if (!view && !filter) return;
            setSearchParams(prev => {
                if (view) prev.set('view', view);
                if (filter) prev.set('filter', filter);
                if (id) prev.set('id', id);
                return prev;
            }, { replace: true });
        } catch { /* selección guardada corrupta: se ignora */ }
    }, []);

    // Persistir la selección actual (view/filter/id) para la restauración de arriba.
    useEffect(() => {
        const view = searchParams.get('view');
        const filter = searchParams.get('filter');
        if (!view && !filter) return;
        try {
            sessionStorage.setItem('schedulePageSelection', JSON.stringify({ view, filter, id: searchParams.get('id') }));
        } catch { /* sessionStorage lleno o bloqueado: no es crítico */ }
    }, [searchParams]);

    useEffect(() => {
        const view = searchParams.get('view') as ViewType;
        if (view && ['Bloque', 'Aula', 'Instructor'].includes(view)) {
            setViewType(view);
        }
        const mode = searchParams.get('mode');
        if (mode === 'editor') setAppMode('editor');
    }, [searchParams.get('view'), searchParams.get('mode')]);

    useEffect(() => {
        const filter = searchParams.get('filter');
        if (filter && viewType) {
            loadSchedulesForFilter(viewType, filter);
        }
    }, [searchParams.get('filter'), viewType, loadSchedulesForFilter]);

    // Salto directo a la semana de un conflicto (ej. desde "Corregir en Horario" en el
    // Reporte Global, que ya traía el ?date= en la URL pero nadie lo leía — te dejaba en
    // el instructor/aula correcto pero en la semana actual, obligando a buscar a mano la
    // semana del conflicto). Formato esperado: YYYY-MM-DD (ver Conflict.actualDate).
    useEffect(() => {
        const dateParam = searchParams.get('date');
        if (!dateParam) return;
        const parts = dateParam.split('-').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) return;
        const [year, month, day] = parts;
        const parsedDate = new Date(year, month - 1, day);
        if (isNaN(parsedDate.getTime())) return;
        setCurrentWeekStart(getStartOfWeek(parsedDate));
    }, [searchParams.get('date')]);

    // Force expansion of sidebar groups based on URL filter
    useEffect(() => {
        if (!selectedFilter) return;

        if (viewType === 'Instructor') {
            const meta = selectedInstructorId ? instructorsMap[selectedInstructorId] : resolveInstructorByName(selectedFilter, instructorsByNameMap, instructors);
            if (meta) {
                const groupName = meta.type === 'TC' ? 'TIEMPO COMPLETO (TC)' : 'TIEMPO PARCIAL (TP)';
                setExpandedGroups(prev => {
                    const newSet = new Set(prev);
                    newSet.add(groupName);
                    return newSet;
                });
            }
        } else if (viewType === 'Aula') {
            const room = roomsMap[selectedFilter];
            if (room) {
                setExpandedGroups(prev => {
                    const newSet = new Set(prev);
                    newSet.add(room.type);
                    return newSet;
                });
            }
        } else if (viewType === 'Bloque') {
            // Find schedule to get career
            // This relies on data being loaded. If lazy loaded, we might not have it yet.
            // But usually summary is available globally.
            const sched = globalSchedulesSummary.find(s => s.block === selectedFilter) || allSchedules.find(s => s.block === selectedFilter);
            if (sched) {
                setExpandedGroups(prev => {
                    const newSet = new Set(prev);
                    newSet.add(sched.career);
                    return newSet;
                });
            }
        }
    }, [selectedFilter, selectedInstructorId, viewType, instructorsMap, instructorsByNameMap, instructors, roomsMap, globalSchedulesSummary, allSchedules]);

    const setSelectedFilter = (filter: string, instructorId?: string) => {
        setSearchParams(prev => {
            prev.set('filter', filter);
            if (instructorId) prev.set('id', instructorId);
            else prev.delete('id');
            return prev;
        });
    };

    useEffect(() => {
        if (isSimulationMode) {
            setShowAuditPanel(false);
            setActiveAuditFilter('none');
        }
    }, [isSimulationMode]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isModalOpen) setIsModalOpen(false);
                else if (isPaletteOpen) setIsPaletteOpen(false);
                else if (isExportModalOpen) setIsExportModalOpen(false);
                else if (isWeekPickerOpen) setIsWeekPickerOpen(false);
                else if (sidebarSearchTerm) setSidebarSearchTerm('');
            }
            if (e.key === 'ArrowLeft') navigateWeek(-1);
            if (e.key === 'ArrowRight') navigateWeek(1);
            if (e.altKey) {
                if (e.key.toLowerCase() === 't') setContentMode(prev => prev === 'grid' ? 'table' : 'grid');
                if (e.key.toLowerCase() === 'e' && viewType === 'Instructor' && selectedFilter) {
                    setAppMode(prev => prev === 'schedule' ? 'editor' : 'schedule');
                }
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setIsPaletteOpen(true);
            }
        };

        const handleClickOutside = (event: MouseEvent) => {
            if (weekPickerRef.current && !weekPickerRef.current.contains(event.target as Node)) {
                setIsWeekPickerOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isModalOpen, isExportModalOpen, isWeekPickerOpen, sidebarSearchTerm, viewType, selectedFilter, navigateWeek, setIsWeekPickerOpen, setContentMode, setAppMode, setIsModalOpen, setIsPaletteOpen, setIsExportModalOpen]);

    // Use summary if available, otherwise current view (fallback)
    const sourceData = useMemo(() =>
        globalSchedulesSummary.length > 0 ? globalSchedulesSummary : allSchedules,
        [globalSchedulesSummary, allSchedules]
    );

    // Índice O(n) instructorId -> horarios, para no repetir un scan O(instructores × horarios)
    // por cada instructor al armar la lista lateral (con ~260 instructores × ~3400 horarios
    // ese scan tomaba cientos de ms en cada tecla escrita en el buscador).
    const instructorScheduleIndex = useMemo(() => buildInstructorScheduleIndex<ProcessedSchedule>(sourceData), [sourceData]);

    // Estructura "cruda" de la lista lateral, SIN aplicar el término de búsqueda — así
    // escribir en el buscador no repite el trabajo pesado de agrupar/emparejar, solo filtra
    // sobre listas ya armadas (ver el memo de abajo).
    const rawSidebarGroups = useMemo(() => {
        const groups: GroupedOption[] = [];

        if (viewType === 'Bloque') {
            const careerMap = new Map<string, Set<string>>();
            sourceData.filter(s => !s.isAdministrative).forEach(s => {
                // Only consider blocks that have actual value
                if (s.block) {
                    if (!careerMap.has(s.career)) careerMap.set(s.career, new Set());
                    careerMap.get(s.career)!.add(s.block);
                }
            });
            careerMap.forEach((blocks: Set<string>, career: string) => {
                groups.push({ groupName: career, items: [...blocks].sort().map(label => ({ label })) });
            });
        } else if (viewType === 'Aula') {
            const typeMap = new Map<string, Set<string>>();

            // Get active room keys from summary
            const activeRoomKeys = new Set<string>();
            sourceData.forEach(s => {
                if (s.building && s.room) {
                    activeRoomKeys.add(`${s.building} - ${s.room}`);
                }
            });

            // Iterate ROOMS metadata, but only include those that are active
            rooms.forEach(r => {
                // Filter: Must be active (present in schedules) OR user explicitly wants all?
                // User said: "before... those who did not have any load assigned did not appear".
                if (!activeRoomKeys.has(r.roomKey)) return;

                const type = r.type || 'SIN TIPO';
                if (!typeMap.has(type)) typeMap.set(type, new Set());
                typeMap.get(type)!.add(r.roomKey);
            });

            typeMap.forEach((roomsInType: Set<string>, type: string) => {
                groups.push({ groupName: type, items: [...roomsInType].sort().map(label => ({ label })) });
            });
        } else {
            // name -> id, para que la lista lateral lleve el ID del instructor y la
            // selección deje de depender de que el nombre coincida palabra por palabra.
            const tcMap = new Map<string, string>();
            const tpMap = new Map<string, string>();

            // Iterate INSTRUCTORS metadata: ¿tiene algún horario? (por ID, con fallback a
            // nombre solo para bloques legados sin ID — ver belongsToInstructor/índice). Antes
            // esto comparaba el nombre completo del catálogo contra el texto crudo del Excel
            // (ej. "MENDIETA ALARCON LUIS OSCAR" vs "MENDIETA ALARCON, LUIS"), que casi nunca
            // coincide exacto y hacía que instructores TC reales cayeran al bloque de abajo
            // y se listaran como TP por defecto.
            // "Reclamamos" cada horario que matchea a un instructor real, para que su texto
            // crudo (ej. "MENDIETA ALARCON LUIS" sin "OSCAR") no vuelva a aparecer como si
            // fuera un docente distinto y desconocido en el bloque de abajo.
            const claimedSchedules = new Set<ProcessedSchedule>();
            instructors.forEach(meta => {
                const matching = getInstructorSchedules<ProcessedSchedule>(meta, instructorScheduleIndex);
                if (matching.length === 0) return;
                matching.forEach(s => claimedSchedules.add(s));

                if (activeAuditFilter !== 'none') {
                    // Check discrepancy using summary data (which useScheduleCalculations now supports)
                    const hasDisc = checkInstructorDiscrepancy(meta.name, meta.id);
                    if (activeAuditFilter === 'deficit' && !hasDisc) return;
                    if (activeAuditFilter === 'perfect' && hasDisc) return;
                }

                if (meta.type === 'TC') tcMap.set(meta.name, meta.id); else tpMap.set(meta.name, meta.id);
            });

            // Instructores verdaderamente desconocidos: aparecen en horarios que ningún
            // instructor del catálogo reclamó (ni por ID ni por nombre fuzzy) — sin ID.
            sourceData.forEach(s => {
                if (claimedSchedules.has(s)) return;
                if (!s.instructor || s.instructor === 'Sin asignar') return;
                if (activeAuditFilter === 'none') tpMap.set(s.instructor, '');
            });

            const toSortedItems = (m: Map<string, string>) => Array.from(m.entries())
                .map(([label, id]) => ({ label, id: id || undefined }))
                .sort((a, b) => a.label.localeCompare(b.label));

            if (tcMap.size > 0) groups.push({ groupName: 'TIEMPO COMPLETO (TC)', items: toSortedItems(tcMap) });
            if (tpMap.size > 0) groups.push({ groupName: 'TIEMPO PARCIAL (TP)', items: toSortedItems(tpMap) });
        }
        return viewType === 'Instructor' ? groups : groups.sort((a, b) => a.groupName.localeCompare(b.groupName));
    }, [sourceData, viewType, rooms, instructors, activeAuditFilter, checkInstructorDiscrepancy, instructorScheduleIndex]);

    // Filtro de texto: barato, solo recorre las listas ya agrupadas — esto es lo único que
    // debe repetirse en cada tecla escrita en el buscador.
    const groupedSidebarOptions = useMemo(() => {
        const term = sidebarSearchTerm.toLowerCase();
        if (!term) return rawSidebarGroups;
        return rawSidebarGroups
            .map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(term)) }))
            .filter(g => g.items.length > 0);
    }, [rawSidebarGroups, sidebarSearchTerm]);

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





    const handleNavigate = (type: ViewType, filter: string, instructorId?: string) => {
        // Redirigir a la misma página pero cambiando los parámetros
        // Esto permite que el historial del navegador funcione correctamente
        setSearchParams(prev => {
            const next = new URLSearchParams();
            next.set('view', type);
            next.set('filter', filter);
            if (type === 'Instructor' && instructorId) next.set('id', instructorId);
            return next;
        });
        // Auto-expandir grupos relacionados
        if (type === 'Bloque') { const schedule = allSchedules.find(s => s.block === filter); if (schedule) setExpandedGroups(new Set([schedule.career])); }
        else if (type === 'Aula') { const room = roomsMap[filter]; if (room) setExpandedGroups(new Set([room.type])); }
        else if (type === 'Instructor') {
            const meta = instructorId ? instructorsMap[instructorId] : resolveInstructorByName(filter, instructorsByNameMap, instructors);
            if (meta) setExpandedGroups(new Set([meta.type === 'TC' ? 'TIEMPO COMPLETO (TC)' : 'TIEMPO PARCIAL (TP)']));
        }
        setIsSidebarVisible(true);
    };

    const filteredData = useMemo(() => {
        if (!selectedFilter) return [];
        // Para Instructor: el ID (cuando viene) manda — lookup exacto O(1) contra
        // instructorsMap. Solo cae a resolver por nombre (con su respaldo fuzzy) cuando no
        // hay ID disponible en la selección actual. Antes esto SIEMPRE resolvía por nombre,
        // aunque selectedFilter fuera el nombre canónico del catálogo — si el texto crudo
        // del horario en el Excel no coincidía palabra por palabra, la grilla quedaba vacía.
        const selectedInstructor = viewType === 'Instructor'
            ? (selectedInstructorId ? instructorsMap[selectedInstructorId] : resolveInstructorByName(selectedFilter, instructorsByNameMap, instructors))
            : undefined;
        return allSchedules.filter(s => {
            if (s.isAdministrative && viewType !== 'Instructor') return false;
            if (viewType === 'Bloque') return s.block === selectedFilter;
            if (viewType === 'Aula') return `${s.building} - ${s.room}` === selectedFilter;
            if (viewType === 'Instructor') return selectedInstructor ? belongsToInstructor(selectedInstructor, s) : s.instructor === selectedFilter;
            return false;
        });
    }, [allSchedules, viewType, selectedFilter, selectedInstructorId, instructorsMap, instructorsByNameMap, instructors]);

    // Resumen para correo: tabla de asignaciones + variaciones del patrón de días a lo
    // largo del periodo (ver services/scheduleVariations.ts). Ejecución perezosa: solo se
    // calcula si el modal está abierto.
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const resolvedEmailInstructor = useMemo(() => {
        if (viewType !== 'Instructor' || !selectedFilter) return undefined;
        return selectedInstructorId ? instructorsMap[selectedInstructorId] : resolveInstructorByName(selectedFilter, instructorsByNameMap, instructors);
    }, [viewType, selectedFilter, selectedInstructorId, instructorsMap, instructorsByNameMap, instructors]);
    const instructorEmailSummary = useMemo(() => {
        if (!isEmailModalOpen || !resolvedEmailInstructor) return null;
        return buildInstructorEmailSummary(resolvedEmailInstructor, filteredData, ACTIVE_PERIODO, SEMESTER_START_DATE, SEMESTER_END_DATE);
    }, [isEmailModalOpen, resolvedEmailInstructor, filteredData]);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col h-screen overflow-hidden">
            <ScheduleHeader
                navigate={navigate}
                currentWeekStart={currentWeekStart}
                semesterWeeks={semesterWeeks}
                selectedFilter={selectedFilter}
                setSelectedFilter={setSelectedFilter}
                viewType={viewType}
                filteredData={filteredData}
                setSidebarSearchTerm={setSidebarSearchTerm}
            />

            <div className="flex flex-1 overflow-hidden min-h-0 relative">
                <NavigationSidebar
                    isSidebarVisible={isSidebarVisible}
                    setIsSidebarVisible={setIsSidebarVisible}
                    viewType={viewType}
                    changeViewType={changeViewType}
                    sidebarSearchTerm={sidebarSearchTerm}
                    setSidebarSearchTerm={setSidebarSearchTerm}
                    groupedSidebarOptions={groupedSidebarOptions}
                    expandedGroups={expandedGroups}
                    toggleGroup={toggleGroup}
                    selectedFilter={selectedFilter}
                    setSelectedFilter={setSelectedFilter}
                    onStartSimulation={startSimulation}
                    isSimulationMode={isSimulationMode}
                    appMode={appMode}
                />

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
                        <ScheduleToolbar
                            viewType={viewType}
                            selectedFilter={selectedFilter}
                            appMode={appMode}
                            setAppMode={setAppMode}
                            contentMode={contentMode}
                            setContentMode={setContentMode}
                            currentWeekStart={currentWeekStart}
                            setCurrentWeekStart={setCurrentWeekStart}
                            navigateWeek={navigateWeek}
                            semesterWeeks={semesterWeeks}
                            isWeekPickerOpen={isWeekPickerOpen}
                            setIsWeekPickerOpen={setIsWeekPickerOpen}
                            weekPickerRef={weekPickerRef}
                            setIsExportModalOpen={setIsExportModalOpen}
                            handleExportAdminTasks={handleExportAdminTasks}
                            onOpenEmailSummary={() => setIsEmailModalOpen(true)}
                            showAuditPanel={showAuditPanel}
                            setShowAuditPanel={setShowAuditPanel}
                            currentWeekDeficit={currentWeekDeficit}
                            activeAuditFilter={activeAuditFilter}
                            setActiveAuditFilter={setActiveAuditFilter}
                            isInfoAccordionExpanded={isInfoAccordionExpanded}
                            setIsInfoAccordionExpanded={setIsInfoAccordionExpanded}
                            isSimulationMode={isSimulationMode}
                            startSimulation={startSimulation}
                        />

                        <SimulationBar />

                        <div className="flex-1 min-h-0 relative">
                            {/* Conditional Rendering based on ViewType */}
                            {viewType === 'Simulacion' ? (
                                <SimulationsList />
                            ) : !selectedFilter ? (
                                <SkeletonGrid />
                            ) : (
                                <ScheduleGrid
                                    schedules={filteredData}
                                    weekStartDate={currentWeekStart}
                                    onEditRecord={(r) => { setEditingRecord(r); setIsModalOpen(true); }}
                                    onDeleteRecord={(id) => setPendingDeleteId(id)}
                                    onIndividualizeTask={handleIndividualizeTask}
                                    onAddAdministrativeTask={handleAddAdministrativeTask}
                                    onNavigate={handleNavigate}
                                    onNavigateWeek={navigateWeek}
                                    onJumpToWeek={(date) => setCurrentWeekStart(getStartOfWeek(date))}
                                    viewType={viewType}
                                    appMode={appMode}
                                    instructorsData={instructors}
                                    selectedFilterName={selectedFilter}
                                    selectedInstructorId={selectedInstructorId}
                                    holidays={holidays}
                                    onDeficitStatusChange={setCurrentWeekDeficit}
                                    contentMode={contentMode}
                                />
                            )}
                        </div>
                    </div>
                </main>
            </div >

            <AuditAlert show={showAuditPanel} deficit={currentWeekDeficit} onClose={() => setShowAuditPanel(false)} />

            <InstructorEmailModal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                summary={instructorEmailSummary}
            />

            <RecordModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingRecord(null); }}
                onSave={(r) => {
                    // Auto-registrar el ambiente si Edificio+Aula no está en el catálogo
                    // (el selector permite escribir uno nuevo, no solo elegir uno existente).
                    if (r.building && r.room) {
                        const roomKey = `${r.building} - ${r.room}`;
                        if (!roomsMap[roomKey]) {
                            saveRoomCloud({
                                roomKey,
                                building: r.building,
                                room: r.room,
                                career: r.career || '',
                                description: '',
                                type: 'AULA',
                                capacity: 0
                            });
                        }
                    }
                    saveScheduleCloud(r);
                    setIsModalOpen(false);
                }}
                initialData={editingRecord}
                allSchedules={allSchedules}
                rooms={rooms}
            />

            <CommandPalette
                isOpen={isPaletteOpen}
                onClose={() => setIsPaletteOpen(false)}
                allSchedules={allSchedules}
                instructors={instructors}
                rooms={rooms}
                onSelect={(item) => {
                    if (item.type === 'audit') {
                        setActiveAuditFilter(item.auditStatus as any);
                        setViewType('Instructor');
                        setSidebarSearchTerm('');
                        setExpandedGroups(new Set(['TIEMPO COMPLETO (TC)', 'TIEMPO PARCIAL (TP)']));
                    } else {
                        if (item.viewType) setViewType(item.viewType);
                        if (item.filterValue) setSelectedFilter(item.filterValue, item.instructorId);
                        setActiveAuditFilter('none');
                    }
                    setIsPaletteOpen(false);
                }}
            />

            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                data={allSchedules}
                currentViewType={viewType}
                currentSelectedItem={selectedFilter}
                onExport={handleExport}
            />

            <ConfirmDialog
                isOpen={pendingDeleteId !== null}
                title="Eliminar tarea"
                message="Se eliminará esta tarea del horario de forma permanente. Esta acción no se puede deshacer."
                confirmLabel="Eliminar"
                variant="danger"
                onCancel={() => setPendingDeleteId(null)}
                onConfirm={() => {
                    // deleteScheduleCloud ya actualiza el estado local (real o de simulación,
                    // según corresponda) SOLO si el borrado en la nube tiene éxito.
                    if (pendingDeleteId) deleteScheduleCloud(pendingDeleteId);
                    setPendingDeleteId(null);
                }}
            />
        </div >
    );
};

export default SchedulePage;
