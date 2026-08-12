import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { Scenario } from '../types';
import { supabase } from '../supabaseClient';
import { Play, Trash2, Calendar, FileText } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { ACTIVE_PERIODO } from '../constants';

/** El escenario no guarda su periodo aparte — se toma del primer horario que contiene. */
const derivePeriodo = (scenario: Scenario): string => scenario.data?.schedules?.[0]?.periodo || 'Sin periodo';

const SimulationsList: React.FC = () => {
    const { loadScenario, notify, isSimulationMode } = useData();
    const [scenarios, setScenarios] = useState<Scenario[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [_, setSearchParams] = useSearchParams();
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [pendingLoadId, setPendingLoadId] = useState<string | null>(null);
    // Por defecto solo el periodo activo, para no amontonar borradores viejos de
    // periodos ya cerrados (ej. 202610) junto con los del periodo en curso.
    const [periodoFilter, setPeriodoFilter] = useState<string>(ACTIVE_PERIODO);

    const fetchScenarios = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('scenarios')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setScenarios(data || []);
        } catch (e) {
            console.error('Error fetching scenarios:', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchScenarios();
    }, []);

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setPendingDeleteId(id);
    };

    const confirmDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        if (!id) return;
        try {
            const { error } = await supabase.from('scenarios').delete().eq('id', id);
            if (error) throw error;
            setScenarios(prev => prev.filter(s => s.id !== id));
        } catch (e: any) {
            notify('Error al eliminar: ' + e.message, 'error');
        }
    };

    const doLoad = async (id: string) => {
        const metadata = await loadScenario(id);
        if (metadata?.view && metadata?.filter) {
            setSearchParams({ view: metadata.view, filter: metadata.filter });
        } else if (metadata?.instructorName) {
            setSearchParams({ view: 'Instructor', filter: metadata.instructorName });
        } else {
            // Default behavior for old simulations or if saved without context
            setSearchParams({ view: 'Bloque' });
        }
    };

    const handleLoad = (id: string) => {
        // Si ya hay una simulación en curso, cargar otro escenario la sobrescribe sin
        // avisar — confirmamos primero para no perder cambios sin guardar.
        if (isSimulationMode) {
            setPendingLoadId(id);
            return;
        }
        doLoad(id);
    };

    const confirmLoad = async () => {
        const id = pendingLoadId;
        setPendingLoadId(null);
        if (id) await doLoad(id);
    };

    const periodos = useMemo(
        () => Array.from(new Set<string>(scenarios.map(derivePeriodo))).sort((a, b) => b.localeCompare(a)),
        [scenarios]
    );
    const filteredScenarios = useMemo(
        () => periodoFilter === 'all' ? scenarios : scenarios.filter(s => derivePeriodo(s) === periodoFilter),
        [scenarios, periodoFilter]
    );

    return (
        <div className="h-full bg-slate-50 p-4 lg:p-8 overflow-y-auto">
            <div className="max-w-5xl mx-auto">
                <h2 className="text-lg lg:text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">Simulaciones Guardadas</h2>
                <p className="text-sm text-slate-500 mb-4 font-medium">Gestiona y carga tus escenarios de prueba previamente guardados.</p>

                {!isLoading && scenarios.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mb-6 lg:mb-8">
                        <button
                            onClick={() => setPeriodoFilter('all')}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${periodoFilter === 'all' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}
                        >
                            Todos los periodos
                        </button>
                        {periodos.map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriodoFilter(p)}
                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${periodoFilter === p ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                )}

                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="bg-white rounded-2xl shadow-sm p-6 animate-pulse h-48"></div>
                        ))}
                    </div>
                ) : scenarios.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-slate-100">
                        <div className="bg-amber-50 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
                            <FileText size={40} className="text-amber-500" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-700">No hay simulaciones guardadas</h3>
                        <p className="text-slate-400 mt-2">Guarda un escenario desde el "Modo de Prueba" para verlo aquí.</p>
                    </div>
                ) : filteredScenarios.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-slate-100">
                        <div className="bg-amber-50 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
                            <FileText size={40} className="text-amber-500" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-700">Sin simulaciones en este periodo</h3>
                        <p className="text-slate-400 mt-2">Prueba con "Todos los periodos" para ver el resto de borradores guardados.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
                        {filteredScenarios.map(scenario => (
                            <div
                                key={scenario.id}
                                className="group bg-white rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-slate-100 overflow-hidden cursor-pointer"
                                onClick={() => handleLoad(scenario.id)}
                            >
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                            <FileText size={24} />
                                        </div>
                                        <button
                                            onClick={(e) => handleDelete(scenario.id, e)}
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            title="Eliminar Simulación"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>

                                    <h3 className="font-bold text-slate-800 text-lg mb-2 line-clamp-1 group-hover:text-indigo-600 transition-colors">{scenario.name}</h3>

                                    {scenario.data?.metadata?.instructorName && (
                                        <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded mb-2 w-fit uppercase">
                                            {scenario.data.metadata.instructorName}
                                        </div>
                                    )}

                                    <p className="text-sm text-slate-400 line-clamp-2 mb-4 h-10">{scenario.description || 'Sin descripción'}</p>

                                    <div className="flex items-center text-xs font-bold text-slate-400 bg-slate-50 rounded-lg px-3 py-2 w-fit">
                                        <Calendar size={14} className="mr-2" />
                                        {new Date(scenario.created_at).toLocaleDateString('es-ES', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                </div>

                                <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between group-hover:bg-indigo-50 transition-colors">
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-wider group-hover:text-indigo-600">Cargar Escenario</span>
                                    <div className="bg-white p-1.5 rounded-lg shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all text-slate-400">
                                        <Play size={16} className="ml-0.5" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <ConfirmDialog
                isOpen={pendingDeleteId !== null}
                title="Eliminar simulación"
                message="Se eliminará este escenario guardado de forma permanente. No afecta la programación real."
                confirmLabel="Eliminar"
                variant="danger"
                onCancel={() => setPendingDeleteId(null)}
                onConfirm={confirmDelete}
            />

            <ConfirmDialog
                isOpen={pendingLoadId !== null}
                title="Cargar escenario"
                message="Ya tienes una simulación en curso. Cargar este escenario reemplazará esos cambios sin guardarlos."
                confirmLabel="Cargar de todas formas"
                variant="danger"
                onCancel={() => setPendingLoadId(null)}
                onConfirm={confirmLoad}
            />
        </div>
    );
};

export default SimulationsList;
