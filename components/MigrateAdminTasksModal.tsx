import React, { useEffect, useState } from 'react';
import { X, ClipboardList, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Instructor, ProcessedSchedule, Scenario } from '../types';
import { findInstructorScenarios } from '../services/scenarioLookup';

interface MigrateAdminTasksModalProps {
    isOpen: boolean;
    onClose: () => void;
    instructor: Instructor;
}

/**
 * Migra SOLO las tareas administrativas (isAdministrative=true) de una simulación
 * guardada de este instructor hacia su horario real — sin pasar por "Aplicar
 * Simulación" (que sincroniza TODO, académico incluido, y borra de la BD real
 * cualquier fila que no esté en la simulación). Esta migración es agregar/actualizar
 * únicamente (mismo ID -> se actualiza, ID nuevo -> se crea): nunca borra una tarea
 * administrativa real que no esté en el escenario elegido. Evita tener que rehacer a
 * mano en la grilla real las tareas administrativas ya armadas en una simulación.
 */
const MigrateAdminTasksModal: React.FC<MigrateAdminTasksModalProps> = ({ isOpen, onClose, instructor }) => {
    const { saveScheduleCloud, notify } = useData();
    const [isLoading, setIsLoading] = useState(true);
    const [scenarios, setScenarios] = useState<Scenario[]>([]);
    const [migratingId, setMigratingId] = useState<string | null>(null);
    const [migratedId, setMigratedId] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setIsLoading(true);
        setMigratedId(null);
        // Los Respaldo Auto SÍ cuentan aquí (a diferencia de la importación de tramos de
        // HE): son una foto real del horario (académico + administrativo) justo antes de
        // aplicar una simulación, así que pueden traer tareas administrativas genuinas.
        findInstructorScenarios(instructor, { excludeAutoBackup: false })
            .then(setScenarios)
            .catch(e => {
                console.error('Error buscando simulaciones del instructor:', e);
                notify('Error al buscar simulaciones del instructor: ' + e.message, 'error');
                setScenarios([]);
            })
            .finally(() => setIsLoading(false));
    }, [isOpen, instructor, notify]);

    if (!isOpen) return null;

    const adminTasksOf = (scenario: Scenario) => (scenario.data?.schedules || []).filter(s => s.isAdministrative);

    // scenario.data viene de una columna jsonb: startDate/endDate llegan como texto (JSON
    // no tiene tipo Date), no como instancias de Date. saveScheduleCloud -> mapSchedToDB
    // llama date.getTime() sobre esos campos (ver formatDateToDB) y truena si son texto —
    // mismo revivido que ya hace loadScenario al cargar un escenario en Simulación.
    const reviveDates = (tasks: ProcessedSchedule[]): ProcessedSchedule[] =>
        tasks.map(t => ({ ...t, startDate: new Date(t.startDate), endDate: new Date(t.endDate) }));

    const handleMigrate = async (scenario: Scenario) => {
        const adminTasks = adminTasksOf(scenario);
        if (adminTasks.length === 0 || migratingId) return;
        setMigratingId(scenario.id);
        try {
            await saveScheduleCloud(reviveDates(adminTasks));
            setMigratedId(scenario.id);
            notify(`${adminTasks.length} tarea(s) administrativa(s) migrada(s) a la grilla real.`, 'success');
        } catch (e: any) {
            notify('Error al migrar tareas administrativas: ' + e.message, 'error');
        } finally {
            setMigratingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in duration-200 flex flex-col max-h-[85vh]">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600">
                            <ClipboardList size={20} />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Migrar Tareas Administrativas</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{instructor.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="p-2 hover:bg-white rounded-xl transition-all">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-3">
                    <p className="text-xs text-slate-500 font-medium leading-relaxed mb-2">
                        Sube a la grilla real las tareas administrativas de la simulación elegida (se crean o actualizan por ID). No borra ninguna tarea administrativa real que no esté en esa simulación, y no toca los cursos/clases.
                    </p>

                    {isLoading && (
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 py-6 justify-center">
                            <div className="animate-spin h-4 w-4 border-2 border-slate-300 border-t-transparent rounded-full" />
                            <span>Buscando simulaciones de este instructor…</span>
                        </div>
                    )}

                    {!isLoading && scenarios.length === 0 && (
                        <p className="text-center text-slate-400 text-sm font-bold py-10">No se encontraron simulaciones guardadas para este instructor.</p>
                    )}

                    {!isLoading && scenarios.map(scenario => {
                        const adminTasks = adminTasksOf(scenario);
                        const isMigrating = migratingId === scenario.id;
                        const isMigrated = migratedId === scenario.id;
                        return (
                            <div key={scenario.id} className="flex items-center justify-between gap-3 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        {scenario.data?.metadata?.isAutoBackup && <ShieldCheck size={12} className="text-amber-500 shrink-0" />}
                                        <span className="text-xs font-bold text-slate-700 truncate">{scenario.name}</span>
                                    </div>
                                    <span className="text-[10px] font-semibold text-slate-400">
                                        {new Date(scenario.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        {' · '}{adminTasks.length} tarea{adminTasks.length === 1 ? '' : 's'} administrativa{adminTasks.length === 1 ? '' : 's'}
                                    </span>
                                </div>
                                {isMigrated ? (
                                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 shrink-0">
                                        <CheckCircle2 size={14} /> Migrado
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => handleMigrate(scenario)}
                                        disabled={adminTasks.length === 0 || isMigrating}
                                        className="px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shrink-0 bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                                    >
                                        {isMigrating && <div className="animate-spin h-3 w-3 border-2 border-white/40 border-t-white rounded-full" />}
                                        <span>Migrar</span>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="p-6 pt-4 border-t border-slate-100 flex justify-end shrink-0">
                    <button onClick={onClose} className="px-6 py-2.5 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-slate-700 transition-colors">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MigrateAdminTasksModal;
