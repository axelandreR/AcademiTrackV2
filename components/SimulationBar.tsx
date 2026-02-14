import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Play, Save, X, CheckCheck, AlertTriangle } from 'lucide-react';

const SimulationBar: React.FC = () => {
    const { isSimulationMode, endSimulation, applySimulation, saveScenario } = useData();
    const [isApplying, setIsApplying] = useState(false);
    const [searchParams] = useSearchParams();

    if (!isSimulationMode) return null;

    const handleApply = async () => {
        setIsApplying(true);
        await applySimulation();
        setIsApplying(false);
    };

    const handleSave = async () => {
        const name = prompt("Nombre del Escenario (para uso futuro):");
        if (!name) return;

        const currentView = searchParams.get('view') || 'Bloque';
        const currentFilter = searchParams.get('filter') || '';

        await saveScenario(name, '', {
            view: currentView,
            filter: currentFilter,
            instructorName: currentView === 'Instructor' ? currentFilter : undefined
        });
    };

    return (
        <div className="w-full bg-amber-500 text-white px-6 py-3 shadow-md border-b-4 border-amber-600 flex items-center justify-between z-30 shrink-0">
            <div className="flex items-center space-x-4">
                <div className="p-2 bg-white/20 rounded-full animate-pulse">
                    <AlertTriangle size={24} className="text-white" />
                </div>
                <div>
                    <h3 className="font-black text-lg uppercase tracking-widest leading-none">Modo de Prueba (Simulación)</h3>
                    <p className="text-xs font-bold text-amber-100 mt-1">Los cambios realizados NO se guardan en la base de datos hasta que decidas "Aplicar".</p>
                </div>
            </div>

            <div className="flex items-center space-x-3">
                <button
                    onClick={handleSave}
                    className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg font-bold uppercase text-xs transition-all"
                >
                    <Save size={16} />
                    <span>Guardar Escenario</span>
                </button>

                <button
                    onClick={endSimulation}
                    className="flex items-center space-x-2 px-4 py-2 bg-slate-900/50 hover:bg-slate-900 text-white rounded-lg font-bold uppercase text-xs transition-all"
                >
                    <X size={16} />
                    <span>Descartar y Salir</span>
                </button>

                <button
                    onClick={handleApply}
                    disabled={isApplying}
                    className="flex items-center space-x-2 px-6 py-2 bg-white text-amber-600 hover:bg-amber-50 rounded-lg font-black uppercase text-xs shadow-lg transition-all transform hover:scale-105"
                >
                    {isApplying ? (
                        <div className="animate-spin h-4 w-4 border-2 border-amber-600 rounded-full border-t-transparent"></div>
                    ) : (
                        <CheckCheck size={16} />
                    )}
                    <span>{isApplying ? 'Aplicando...' : 'Aplicar Cambios Reales'}</span>
                </button>
            </div>
        </div>
    );
};

export default SimulationBar;
