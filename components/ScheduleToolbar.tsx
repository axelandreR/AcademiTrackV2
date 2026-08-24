
import React from 'react';
import {
    Calendar as CalendarIcon, ChevronRight as ChevronRightIcon,
    Table as TableIcon, LayoutDashboard, Edit3, FileDown,
    Check, X, AlertTriangle, ChevronDown, ChevronUp,
    Building2, UserRound, TrendingUp, Mail, Clock
} from 'lucide-react';
import WeekPicker from './WeekPicker';
import { ViewType, AppMode, Instructor } from '../types';
import ImportModal from './ImportModal';

interface ScheduleToolbarProps {
    viewType: ViewType;
    selectedFilter: string;
    appMode: AppMode;
    setAppMode: (mode: AppMode) => void; // Retained from original
    contentMode: 'grid' | 'table'; // Retained from original
    setContentMode: (mode: 'grid' | 'table') => void; // Retained from original
    currentWeekStart: Date; // Retained from original
    setCurrentWeekStart: (date: Date) => void; // Retained from original
    navigateWeek: (direction: number) => void; // Retained from original
    semesterWeeks: { start: Date; label: string }[]; // Retained from original
    isWeekPickerOpen: boolean; // Retained from original
    setIsWeekPickerOpen: (isOpen: boolean) => void; // Retained from original
    weekPickerRef: React.RefObject<HTMLDivElement>; // Retained from original
    setIsExportModalOpen: (isOpen: boolean) => void; // Retained from original
    handleExportAdminTasks: () => void; // Retained from original
    onOpenEmailSummary?: () => void;
    showAuditPanel: boolean;
    setShowAuditPanel: (show: boolean) => void;
    currentWeekDeficit: boolean;
    activeAuditFilter: 'none' | 'deficit' | 'perfect';
    setActiveAuditFilter: (filter: 'none' | 'deficit' | 'perfect') => void;
    isInfoAccordionExpanded: boolean;
    setIsInfoAccordionExpanded: (expanded: boolean) => void;
    isSimulationMode?: boolean;
    startSimulation?: (filter?: string) => void;
    currentInstructor?: Instructor;
    toggleInstructorAuditExemption?: (instructorId: string, value: boolean) => Promise<void>;
}

const ScheduleToolbar: React.FC<ScheduleToolbarProps> = ({
    viewType,
    selectedFilter,
    appMode,
    setAppMode,
    contentMode,
    setContentMode,
    currentWeekStart,
    setCurrentWeekStart,
    navigateWeek,
    semesterWeeks,
    isWeekPickerOpen,
    setIsWeekPickerOpen,
    weekPickerRef,
    setIsExportModalOpen,
    handleExportAdminTasks,
    onOpenEmailSummary,
    showAuditPanel,
    setShowAuditPanel,
    currentWeekDeficit,
    activeAuditFilter,
    setActiveAuditFilter,
    isInfoAccordionExpanded,
    setIsInfoAccordionExpanded,
    isSimulationMode,
    startSimulation,
    currentInstructor,
    toggleInstructorAuditExemption
}) => {
    const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);

    return (
        <div className="flex flex-col mb-4 shrink-0 bg-white p-0 rounded-[24px] lg:rounded-[32px] shadow-sm border border-slate-100 overflow-visible transition-all">
            {/* Encabezado siempre visible: nombre, indicador de simulación y selector de
                semana. El resto (switch grilla/tabla, editor, exportar, iconos extra) vive en
                el bloque colapsable de abajo — se despliega con clic en cualquier tamaño de
                pantalla (antes solo colapsaba por debajo de 1030px; en laptop quedaba siempre
                expandido y se comía espacio de la grilla). */}
            <div className="flex flex-col min-[900px]:flex-row min-[900px]:items-center justify-between gap-3 p-3 lg:p-4">
                <div className="flex items-center space-x-3 lg:space-x-4 min-w-0 flex-1">
                    <div className="p-2 lg:p-3 bg-slate-50 rounded-xl lg:rounded-2xl border border-slate-100 shrink-0">
                        {viewType === 'Bloque' ? <LayoutDashboard size={20} className="text-blue-600 lg:w-6 lg:h-6" /> : viewType === 'Aula' ? <Building2 size={20} className="text-orange-600 lg:w-6 lg:h-6" /> : <UserRound size={20} className="text-indigo-600 lg:w-6 lg:h-6" />}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center flex-wrap gap-2">
                            <h2 className="min-w-0 flex-1 text-xs sm:text-sm md:text-base lg:text-lg min-[1400px]:text-2xl font-black text-slate-900 tracking-tighter uppercase leading-tight whitespace-normal break-words line-clamp-2">
                                {selectedFilter || 'Sin Selección'}
                            </h2>

                            {/* Botón Simular Individual */}
                            {viewType === 'Instructor' && selectedFilter && !isSimulationMode && startSimulation && (
                                <button
                                    onClick={() => startSimulation(selectedFilter)}
                                    className="shrink-0 px-2 sm:px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-lg border border-indigo-200 transition-colors flex items-center shadow-sm"
                                    title="Crear Simulación de Horas Extras (Sin Alertas)"
                                >
                                    Simular
                                </button>
                            )}

                            {/* Exención general de auditoría: instructor con horas extra asignadas
                                en general — no marca discrepancia ni exceso diario, sin marcar
                                curso/tarea por separado. Los choques de horario/aula NO se ven
                                afectados (ver Instructor.hasExtraHoursAssigned). */}
                            {viewType === 'Instructor' && selectedFilter && !isSimulationMode && currentInstructor && toggleInstructorAuditExemption && (
                                <button
                                    onClick={() => toggleInstructorAuditExemption(currentInstructor.id, !currentInstructor.hasExtraHoursAssigned)}
                                    className={`shrink-0 px-2 sm:px-2.5 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-lg border transition-colors flex items-center gap-1 shadow-sm ${currentInstructor.hasExtraHoursAssigned ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'}`}
                                    title={currentInstructor.hasExtraHoursAssigned ? 'Instructor con Horas Extra Asignadas — auditoría normal desactivada. Clic para reactivarla.' : 'Marcar instructor con Horas Extra Asignadas (desactiva la auditoría normal para él; los choques de horario siguen detectándose)'}
                                >
                                    <Clock size={11} />
                                    <span>{currentInstructor.hasExtraHoursAssigned ? 'HE Asignadas' : 'Marcar HE'}</span>
                                </button>
                            )}

                            {/* Botón Importar Carga (Solo en Simulación) */}
                            {viewType === 'Instructor' && isSimulationMode && (
                                <button
                                    onClick={() => setIsImportModalOpen(true)}
                                    className="shrink-0 px-2 sm:px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-lg border border-amber-200 transition-colors flex items-center shadow-sm"
                                    title="Buscar y agregar cursos de otros instructores"
                                >
                                    + Carga Externa
                                </button>
                            )}
                        </div>
                        <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] sm:tracking-[0.2em] mt-0.5">
                            {viewType} • {appMode === 'editor' ? 'Edición Activa' : 'Visualización'}
                            {isSimulationMode && <span className="text-indigo-600 ml-1"> • SIMULACIÓN ACTIVA</span>}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {/* Selector de Semana — visible siempre, incluso con el resto colapsado */}
                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 shadow-inner">
                        <button onClick={() => navigateWeek(-1)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"><ChevronRightIcon size={14} className="rotate-180 sm:w-4 sm:h-4" /></button>
                        <span className="mx-2 sm:mx-3 text-[9px] sm:text-[10px] lg:text-[11px] font-black text-slate-600 uppercase tracking-widest min-w-[110px] sm:min-w-[140px] text-center">{currentWeekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - {new Date(currentWeekStart.getTime() + 6 * 86400000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <button onClick={() => navigateWeek(1)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"><ChevronRightIcon size={14} className="sm:w-4 sm:h-4" /></button>
                        <div className="h-4 w-px bg-slate-300 mx-1" />

                        <WeekPicker
                            isOpen={isWeekPickerOpen}
                            setIsOpen={setIsWeekPickerOpen}
                            currentWeekStart={currentWeekStart}
                            setCurrentWeekStart={setCurrentWeekStart}
                            semesterWeeks={semesterWeeks}
                            pickerRef={weekPickerRef}
                        />
                    </div>

                    {/* Toggle del resto de opciones — funciona en cualquier ancho */}
                    <button
                        onClick={() => setIsInfoAccordionExpanded(!isInfoAccordionExpanded)}
                        className={`p-2 rounded-xl border transition-all shrink-0 ${isInfoAccordionExpanded ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'}`}
                        title={isInfoAccordionExpanded ? 'Ocultar opciones' : 'Más opciones'}
                    >
                        {isInfoAccordionExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                </div>
            </div>

            {/* Controles adicionales — solo visibles al desplegar */}
            {isInfoAccordionExpanded && (
                <div className="flex flex-col min-[900px]:flex-row items-stretch min-[900px]:items-center space-y-3 min-[900px]:space-y-0 min-[900px]:space-x-4 shrink-0 overflow-visible border-t border-slate-100 px-3 lg:px-4 py-3 lg:py-4">

                    {/* Switch Grid/Table */}
                    <div className="flex bg-slate-100 p-1 rounded-xl self-start lg:self-auto" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setContentMode('grid')} className={`p-2 rounded-lg transition-all ${contentMode === 'grid' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><LayoutDashboard size={16} /></button>
                        <button onClick={() => setContentMode('table')} className={`p-2 rounded-lg transition-all ${contentMode === 'table' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><TableIcon size={16} /></button>
                    </div>

                    {viewType === 'Instructor' && selectedFilter && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setAppMode(appMode === 'schedule' ? 'editor' : 'schedule'); }}
                            className={`flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl transition-all border font-bold text-[10px] uppercase tracking-widest ${appMode === 'editor' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'}`}
                        >
                            {appMode === 'editor' ? <Check size={16} /> : <Edit3 size={16} />}
                            <span>{appMode === 'editor' ? 'Finalizar' : 'Editor'}</span>
                        </button>
                    )}

                    <div className="h-8 w-px bg-slate-200 hidden lg:block" />

                    <div className="flex items-center space-x-2 self-start lg:self-auto" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setIsExportModalOpen(true)} className="flex items-center space-x-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg font-bold text-[10px] uppercase tracking-widest">
                            <FileDown size={16} />
                            <span className="hidden xl:inline">Exportar</span>
                        </button>

                        {viewType === 'Instructor' && selectedFilter && (
                            <button onClick={handleExportAdminTasks} className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm" title="Reporte Tareas Administrativas">
                                <TrendingUp size={16} />
                            </button>
                        )}

                        {viewType === 'Instructor' && selectedFilter && onOpenEmailSummary && (
                            <button onClick={onOpenEmailSummary} className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm" title="Resumen para Correo">
                                <Mail size={16} />
                            </button>
                        )}

                        {/* Botón Auditoría - Oculto en Simulación */}
                        {!isSimulationMode && (
                            <button
                                onClick={() => setShowAuditPanel(!showAuditPanel)}
                                className={`relative p-2.5 rounded-xl transition-all border ${showAuditPanel ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-200 text-slate-400 hover:text-orange-500'}`}
                                title="Panel de Auditoría"
                            >
                                <AlertTriangle size={16} />
                                {currentWeekDeficit && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />}
                            </button>
                        )}
                    </div>

                    {/* Panel Flotante Auditoría */}
                    {showAuditPanel && (
                        <div className="absolute top-full right-0 lg:right-8 mt-4 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-[60] animate-in fade-in slide-in-from-top-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auditoría Rápida</span>
                                <button onClick={() => setShowAuditPanel(false)}><X size={14} className="text-slate-400" /></button>
                            </div>
                            <div className="space-y-2">
                                <button onClick={() => setActiveAuditFilter(activeAuditFilter === 'deficit' ? 'none' : 'deficit')} className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${activeAuditFilter === 'deficit' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-white hover:shadow-md'}`}>
                                    <div className="flex items-center space-x-3"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-xs font-bold">Con Déficit de Horas</span></div>
                                    {activeAuditFilter === 'deficit' && <Check size={14} />}
                                </button>
                                <button onClick={() => setActiveAuditFilter(activeAuditFilter === 'perfect' ? 'none' : 'perfect')} className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${activeAuditFilter === 'perfect' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-white hover:shadow-md'}`}>
                                    <div className="flex items-center space-x-3"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-xs font-bold">Carga Completa</span></div>
                                    {activeAuditFilter === 'perfect' && <Check size={14} />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Modal Importación */}
            {viewType === 'Instructor' && (
                <ImportModal
                    isOpen={isImportModalOpen}
                    onClose={() => setIsImportModalOpen(false)}
                    targetInstructor={selectedFilter}
                />
            )}
        </div>
    );
};

export default ScheduleToolbar;
