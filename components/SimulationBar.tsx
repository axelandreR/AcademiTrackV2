import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Play, Save, X, CheckCheck, AlertTriangle, Clock } from 'lucide-react';
import ExtraHoursModal from './ExtraHoursModal';
import ConfirmDialog from './ConfirmDialog';
import SaveScenarioModal from './SaveScenarioModal';

const SimulationBar: React.FC = () => {
    const { isSimulationMode, endSimulation, applySimulation, saveScenario, updateScenario, currentScenarioId, currentScenarioName, extraHoursConfig, setExtraHoursConfig, holidays, simulationConfig } = useData();
    const [isApplying, setIsApplying] = useState(false);
    const [isExtraHoursModalOpen, setIsExtraHoursModalOpen] = useState(false);
    const [isApplyConfirmOpen, setIsApplyConfirmOpen] = useState(false);
    const [isSaveScenarioOpen, setIsSaveScenarioOpen] = useState(false);
    const [searchParams] = useSearchParams();

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

    return (
        <div className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-2xl lg:rounded-3xl shadow-lg shadow-amber-500/20 px-4 py-3 lg:px-5 lg:py-3 mb-4 shrink-0 relative z-[80] flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex items-center gap-3 min-w-0 lg:flex-1">
                <div className="p-2 bg-white/20 rounded-xl shrink-0">
                    <AlertTriangle size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                    <h3 className="font-black text-sm lg:text-base uppercase tracking-widest leading-none truncate">Modo de Prueba (Simulación)</h3>
                    <p className="text-[10px] font-bold text-amber-100 mt-1 leading-snug">Los cambios NO se guardan hasta que decidas "Aplicar".</p>
                </div>
            </div>

            <div className="flex items-center flex-wrap gap-2 shrink-0">
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

            <ExtraHoursModal
                isOpen={isExtraHoursModalOpen}
                onClose={() => setIsExtraHoursModalOpen(false)}
                config={extraHoursConfig}
                onSave={(config) => setExtraHoursConfig(config)}
                holidays={holidays}
                instructorName={simulationConfig?.instructorFilter}
            />

            <ConfirmDialog
                isOpen={isApplyConfirmOpen}
                title="Aplicar simulación"
                message="Se escribirán los cambios de la simulación en la base de datos real. Esta acción es irreversible."
                confirmLabel="Aplicar cambios"
                variant="danger"
                onCancel={() => setIsApplyConfirmOpen(false)}
                onConfirm={confirmApply}
            />

            <SaveScenarioModal
                isOpen={isSaveScenarioOpen}
                onClose={() => setIsSaveScenarioOpen(false)}
                onSaveNew={confirmSaveNew}
                onUpdateExisting={currentScenarioId ? confirmUpdate : undefined}
                currentScenarioName={currentScenarioName}
            />
        </div>
    );
};

export default SimulationBar;
