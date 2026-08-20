import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Play, Save, X, CheckCheck, AlertTriangle, Clock, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';
import ExtraHoursModal from './ExtraHoursModal';
import ConfirmDialog from './ConfirmDialog';
import SaveScenarioModal from './SaveScenarioModal';
import WeeklyHEExportModal from './WeeklyHEExportModal';
import { generateWeeklyHEExcel, generateFullPeriodHEExcel } from '../services/excelExporter';
import { resolveInstructorByName, belongsToInstructor } from '../services/businessRules';

const SimulationBar: React.FC = () => {
    const {
        isSimulationMode, endSimulation, applySimulation, saveScenario, updateScenario,
        currentScenarioId, currentScenarioName, extraHoursConfig, setExtraHoursConfig, holidays,
        simulationConfig, allSchedules, instructors, instructorsByNameMap, notify
    } = useData();
    const [isApplying, setIsApplying] = useState(false);
    const [isExtraHoursModalOpen, setIsExtraHoursModalOpen] = useState(false);
    const [isApplyConfirmOpen, setIsApplyConfirmOpen] = useState(false);
    const [isSaveScenarioOpen, setIsSaveScenarioOpen] = useState(false);
    const [isWeeklyExportOpen, setIsWeeklyExportOpen] = useState(false);
    const [isFullPeriodExporting, setIsFullPeriodExporting] = useState(false);
    const [isBannerExpanded, setIsBannerExpanded] = useState(false);
    const [searchParams] = useSearchParams();

    const instructorObj = useMemo(() => {
        const instructorName = simulationConfig?.instructorFilter || '';
        return instructorName ? resolveInstructorByName(instructorName, instructorsByNameMap, instructors) : undefined;
    }, [simulationConfig?.instructorFilter, instructorsByNameMap, instructors]);

    // Horario completo del instructor dentro de la simulación (allSchedules ya incluye
    // los cambios simulados) — usado por el panel de validación de 46h del modal de HE.
    const instructorSchedules = useMemo(() => {
        if (!instructorObj) return [];
        return allSchedules.filter(s => belongsToInstructor(instructorObj, s));
    }, [instructorObj, allSchedules]);

    if (!isSimulationMode) return null;

    const handleApply = () => setIsApplyConfirmOpen(true);

    const confirmApply = async () => {
        setIsApplyConfirmOpen(false);
        setIsApplying(true);
        await applySimulation();
        setIsApplying(false);
    };

    const handleSave = () => setIsSaveScenarioOpen(true);

    const currentMetadata = () => {
        const currentView = searchParams.get('view') || 'Bloque';
        const currentFilter = searchParams.get('filter') || '';
        return {
            view: currentView,
            filter: currentFilter,
            instructorName: currentView === 'Instructor' ? currentFilter : undefined
        };
    };

    const confirmSaveNew = async (name: string) => {
        await saveScenario(name, '', currentMetadata());
    };

    const confirmUpdate = async () => {
        if (!currentScenarioId) return;
        await updateScenario(currentScenarioId, currentMetadata());
    };

    const handleWeeklyExport = async (weekStart: Date) => {
        const instructorName = simulationConfig?.instructorFilter || '';
        const instructorType = instructorObj?.type || 'TP';
        try {
            const blob = await generateWeeklyHEExcel({ instructorName, instructorType, weekStart, allSchedules, extraHoursConfig, holidays });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Programacion_Semanal_HE_${instructorName.replace(/\s+/g, '_') || 'simulacion'}_${weekStart.toISOString().slice(0, 10)}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
            notify('Reporte semanal exportado correctamente.', 'success');
        } catch (e: any) {
            notify('Error al generar el reporte semanal: ' + e.message, 'error');
        }
    };

    // Mismo cuadro (Jornada Normal / Horas Extra, Turno x Día) que "Exportar Semana", pero
    // repetido para cada semana con horario cargado en la simulación, en un solo archivo.
    const handleFullPeriodExport = async () => {
        const instructorName = simulationConfig?.instructorFilter || '';
        const instructorType = instructorObj?.type || 'TP';
        setIsFullPeriodExporting(true);
        try {
            const blob = await generateFullPeriodHEExcel({ instructorName, instructorType, allSchedules: instructorSchedules, extraHoursConfig, holidays });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Programacion_Completa_HE_${instructorName.replace(/\s+/g, '_') || 'simulacion'}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
            notify('Reporte del periodo exportado correctamente.', 'success');
        } catch (e: any) {
            notify('Error al generar el reporte del periodo: ' + e.message, 'error');
        } finally {
            setIsFullPeriodExporting(false);
        }
    };

    return (
        <div className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-2xl lg:rounded-3xl shadow-lg shadow-amber-500/20 mb-4 shrink-0 relative z-[80] overflow-hidden">
            {/* Encabezado siempre visible — clic para desplegar/ocultar las acciones. Antes
                mostraba las 5 acciones siempre, que en pantallas angostas o bajas se comían
                espacio; ahora arranca contraído y el tamaño de letra se ajusta por pantalla. */}
            <div
                className="flex items-center justify-between gap-3 px-3 sm:px-4 lg:px-5 py-2.5 sm:py-3 cursor-pointer select-none"
                onClick={() => setIsBannerExpanded(!isBannerExpanded)}
            >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <div className="p-1.5 sm:p-2 bg-white/20 rounded-xl shrink-0">
                        <AlertTriangle size={16} className="text-white sm:w-[18px] sm:h-[18px]" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-black text-[11px] sm:text-sm lg:text-base uppercase tracking-widest leading-none truncate">Modo de Prueba (Simulación)</h3>
                        <p className="text-[8px] sm:text-[10px] font-bold text-amber-100 mt-1 leading-snug hidden sm:block">Los cambios NO se guardan hasta que decidas "Aplicar".</p>
                    </div>
                </div>
                <div className="p-1.5 sm:p-2 text-white/80 shrink-0">
                    {isBannerExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
            </div>

            {isBannerExpanded && (
            <div className="flex items-center flex-wrap gap-2 shrink-0 px-3 sm:px-4 lg:px-5 pb-3 lg:pb-3.5 border-t border-white/15 pt-3">
                <button
                    onClick={() => setIsExtraHoursModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl font-bold uppercase text-[10px] tracking-wide transition-all shrink-0"
                    title="Configurar Horas Extras"
                >
                    <Clock size={14} />
                    <span>Configurar HE</span>
                </button>

                <button
                    onClick={handleSave}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl font-bold uppercase text-[10px] tracking-wide transition-all shrink-0"
                    title="Guardar Escenario"
                >
                    <Save size={14} />
                    <span>Guardar Escenario</span>
                </button>

                {simulationConfig?.instructorFilter && (
                    <button
                        onClick={() => setIsWeeklyExportOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl font-bold uppercase text-[10px] tracking-wide transition-all shrink-0"
                        title="Exportar Semana (Horas Extras)"
                    >
                        <FileSpreadsheet size={14} />
                        <span>Exportar Semana</span>
                    </button>
                )}

                {simulationConfig?.instructorFilter && (
                    <button
                        onClick={handleFullPeriodExport}
                        disabled={isFullPeriodExporting}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl font-bold uppercase text-[10px] tracking-wide transition-all shrink-0 disabled:opacity-60"
                        title="Exportar Todo el Periodo (Jornada Normal + Horas Extra, semana por semana)"
                    >
                        {isFullPeriodExporting ? (
                            <div className="animate-spin h-3.5 w-3.5 border-2 border-white rounded-full border-t-transparent"></div>
                        ) : (
                            <FileSpreadsheet size={14} />
                        )}
                        <span>Exportar Periodo</span>
                    </button>
                )}

                <button
                    onClick={endSimulation}
                    className="flex items-center gap-1.5 px-3 py-2 bg-black/20 hover:bg-black/30 text-white rounded-xl font-bold uppercase text-[10px] tracking-wide transition-all shrink-0"
                    title="Descartar y Salir"
                >
                    <X size={14} />
                    <span>Descartar y Salir</span>
                </button>

                <button
                    onClick={handleApply}
                    disabled={isApplying}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white text-amber-600 hover:bg-amber-50 rounded-xl font-black uppercase text-[10px] tracking-wide shadow-md transition-all active:scale-95 disabled:opacity-60 shrink-0"
                    title="Aplicar Cambios Reales"
                >
                    {isApplying ? (
                        <div className="animate-spin h-3.5 w-3.5 border-2 border-amber-600 rounded-full border-t-transparent"></div>
                    ) : (
                        <CheckCheck size={14} />
                    )}
                    <span>{isApplying ? 'Aplicando...' : 'Aplicar Cambios Reales'}</span>
                </button>
            </div>
            )}

            {/* Portaleados a document.body: este banner es `relative z-[80]`, lo que atrapa
                cualquier hijo `fixed` dentro de su propio contexto de apilamiento — quedaban
                por debajo del pie de Auditoría (`z-[100]`) sin importar el z-index que se les
                pusiera. Un portal los saca de ese contexto por completo. */}
            {createPortal(
                <ExtraHoursModal
                    isOpen={isExtraHoursModalOpen}
                    onClose={() => setIsExtraHoursModalOpen(false)}
                    config={extraHoursConfig}
                    onSave={(config) => setExtraHoursConfig(config)}
                    holidays={holidays}
                    instructorName={simulationConfig?.instructorFilter}
                    instructorSchedules={instructorSchedules}
                />,
                document.body
            )}

            {createPortal(
                <ConfirmDialog
                    isOpen={isApplyConfirmOpen}
                    title="Aplicar simulación"
                    message="Se escribirán los cambios de la simulación en la base de datos real. Esta acción es irreversible."
                    confirmLabel="Aplicar cambios"
                    variant="danger"
                    onCancel={() => setIsApplyConfirmOpen(false)}
                    onConfirm={confirmApply}
                />,
                document.body
            )}

            {createPortal(
                <SaveScenarioModal
                    isOpen={isSaveScenarioOpen}
                    onClose={() => setIsSaveScenarioOpen(false)}
                    onSaveNew={confirmSaveNew}
                    onUpdateExisting={currentScenarioId ? confirmUpdate : undefined}
                    currentScenarioName={currentScenarioName}
                />,
                document.body
            )}

            {createPortal(
                <WeeklyHEExportModal
                    isOpen={isWeeklyExportOpen}
                    onClose={() => setIsWeeklyExportOpen(false)}
                    onExport={handleWeeklyExport}
                />,
                document.body
            )}
        </div>
    );
};

export default SimulationBar;
