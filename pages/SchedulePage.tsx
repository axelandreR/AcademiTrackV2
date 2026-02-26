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
import { isAcademicMetaLoad, isContractualLoad } from '../services/businessRules';
import { DAYS_OF_WEEK, SEMESTER_START_DATE, SEMESTER_END_DATE, CUT_OFF_DATE } from '../constants';
import SkeletonGrid from '../components/SkeletonGrid';
import CommandPalette, { SearchItem } from '../components/CommandPalette';

import { useScheduleNavigation } from '../hooks/useScheduleNavigation';
import { useScheduleCalculations } from '../hooks/useScheduleCalculations';
import { useScheduleActions } from '../hooks/useScheduleActions';
import { timeToMinutes } from '../utils/timeUtils';

import NavigationSidebar from '../components/NavigationSidebar';
import ScheduleHeader from '../components/ScheduleHeader';
import ScheduleToolbar from '../components/ScheduleToolbar';
import AuditAlert from '../components/AuditAlert';
import SimulationBar from '../components/SimulationBar';
import SimulationsList from '../components/SimulationsList';

interface GroupedOption {
    groupName: string;
    items: string[];
}

const SchedulePage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const {
        allSchedules, data, administrativeTasks, rooms, instructors, holidays,
        setSchedules, setAdministrativeTasks, saveScheduleCloud, deleteScheduleCloud,
        instructorsByNameMap, roomsMap, settings, loadSchedulesForFilter, globalSchedulesSummary,
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
    // Sincronizar URL con estado
    const selectedFilter = searchParams.get('filter') || '';


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
        checkInstructorDiscrepancy
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

    // Force expansion of sidebar groups based on URL filter
    useEffect(() => {
        if (!selectedFilter) return;

        if (viewType === 'Instructor') {
            const meta = instructorsByNameMap[selectedFilter.toLowerCase()];
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
    }, [selectedFilter, viewType, instructorsByNameMap, roomsMap, globalSchedulesSummary, allSchedules]);

    const setSelectedFilter = (filter: string) => {
        setSearchParams(prev => {
            prev.set('filter', filter);
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

    const groupedSidebarOptions = useMemo(() => {
        const groups: GroupedOption[] = [];
        const term = sidebarSearchTerm.toLowerCase();

        // Use summary if available, otherwise current view (fallback)
        const sourceData = globalSchedulesSummary.length > 0 ? globalSchedulesSummary : allSchedules;

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
                const filtered = [...blocks].filter(b => b.toLowerCase().includes(term)).sort();
                if (filtered.length > 0) groups.push({ groupName: career, items: filtered });
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
                const filtered = [...roomsInType].filter(r => r.toLowerCase().includes(term)).sort();
                if (filtered.length > 0) groups.push({ groupName: type, items: filtered });
            });
        } else {
            const tcSet = new Set<string>();
            const tpSet = new Set<string>();

            // Get active instructor names from summary
            const activeInstructors = new Set<string>();
            sourceData.forEach(s => {
                if (s.instructor) activeInstructors.add(s.instructor);
            });

            // Iterate INSTRUCTORS metadata, only include active
            instructors.forEach(meta => {
                if (!activeInstructors.has(meta.name)) return;

                if (activeAuditFilter !== 'none') {
                    // Check discrepancy using summary data (which useScheduleCalculations now supports)
                    const hasDisc = checkInstructorDiscrepancy(meta.name);
                    if (activeAuditFilter === 'deficit' && !hasDisc) return;
                    if (activeAuditFilter === 'perfect' && hasDisc) return;
                }

                if (meta.type === 'TC') tcSet.add(meta.name); else tpSet.add(meta.name);
            });

            // Handle instructors in data but not in metadata
            activeInstructors.forEach(name => {
                // If it's already in tcSet or tpSet, skip
                if (tcSet.has(name) || tpSet.has(name)) return;

                if (!instructorsByNameMap[name.toLowerCase()] && name !== 'Sin asignar') {
                    if (activeAuditFilter === 'none') tpSet.add(name);
                }
            });

            const filteredTc = [...tcSet].filter(i => i.toLowerCase().includes(term)).sort();
            const filteredTp = [...tpSet].filter(i => i.toLowerCase().includes(term)).sort();

            if (filteredTc.length > 0) groups.push({ groupName: 'TIEMPO COMPLETO (TC)', items: filteredTc });
            if (filteredTp.length > 0) groups.push({ groupName: 'TIEMPO PARCIAL (TP)', items: filteredTp });
        }
        return viewType === 'Instructor' ? groups : groups.sort((a, b) => a.groupName.localeCompare(b.groupName));
    }, [globalSchedulesSummary, allSchedules, viewType, sidebarSearchTerm, rooms, instructors, activeAuditFilter, checkInstructorDiscrepancy, instructorsByNameMap]);

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





    const handleNavigate = (type: ViewType, filter: string) => {
        // Redirigir a la misma página pero cambiando los parámetros
        // Esto permite que el historial del navegador funcione correctamente
        setSearchParams({ view: type, filter });
        // Auto-expandir grupos relacionados
        if (type === 'Bloque') { const schedule = allSchedules.find(s => s.block === filter); if (schedule) setExpandedGroups(new Set([schedule.career])); }
        else if (type === 'Aula') { const room = roomsMap[filter]; if (room) setExpandedGroups(new Set([room.type])); }
        else if (type === 'Instructor') { const meta = instructorsByNameMap[filter.toLowerCase()]; if (meta) setExpandedGroups(new Set([meta.type === 'TC' ? 'TIEMPO COMPLETO (TC)' : 'TIEMPO PARCIAL (TP)'])); }
        setIsSidebarVisible(true);
    };

    const filteredData = useMemo(() => {
        if (!selectedFilter) return [];
        return allSchedules.filter(s => {
            if (s.isAdministrative && viewType !== 'Instructor') return false;
            if (viewType === 'Bloque') return s.block === selectedFilter;
            if (viewType === 'Aula') return `${s.building} - ${s.room}` === selectedFilter;
            if (viewType === 'Instructor') return s.instructor === selectedFilter;
            return false;
        });
    }, [allSchedules, viewType, selectedFilter]);

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
                            )}
                        </div>
                    </div>
                </main>
            </div >

            <AuditAlert show={showAuditPanel} deficit={currentWeekDeficit} onClose={() => setShowAuditPanel(false)} />

            <RecordModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingRecord(null); }}
                onSave={(r) => {
                    saveScheduleCloud(r);
                    setIsModalOpen(false);
                }}
                initialData={editingRecord}
                allSchedules={allSchedules}
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
                        if (item.filterValue) setSelectedFilter(item.filterValue);
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
        </div >
    );
};

export default SchedulePage;
