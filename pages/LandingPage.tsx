import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart4, LayoutDashboard, Edit3, Users, MapPin, ArrowRight, RefreshCw, AlertTriangle, Upload, TrendingUp } from 'lucide-react';
import { useData } from '../context/DataContext';
import FileUploader from '../components/FileUploader';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { uploadSchedulesToSupabase, schedules, instructors, isLoading } = useData();
    const [isUpdating, setIsUpdating] = React.useState(false);

    // Estados para el flujo de sincronización
    const [pendingData, setPendingData] = React.useState<any>(null);
    const [syncMode, setSyncMode] = React.useState<'full' | 'delta'>('full');
    const [showSelection, setShowSelection] = React.useState(false);
    const [showConfirmation, setShowConfirmation] = React.useState(false);

    // Cálculos de impacto
    const stats = React.useMemo(() => {
        if (!pendingData) return { toDelete: 0, toAdd: 0 };

        if (syncMode === 'full') {
            return {
                toDelete: schedules.length + instructors.length, // Simplificado
                toAdd: pendingData.schedules.length + pendingData.instructors.length
            };
        } else {
            const newNrcs = new Set(pendingData.schedules.map((s: any) => s.nrc));
            const matchingExisting = schedules.filter(s => newNrcs.has(s.nrc) && !s.isAdministrative);
            return {
                toDelete: matchingExisting.length,
                toAdd: pendingData.schedules.length
            };
        }
    }, [pendingData, syncMode, schedules, instructors]);

    const handleConfirmSync = async () => {
        if (!pendingData) return;
        await uploadSchedulesToSupabase(pendingData, syncMode);
        setPendingData(null);
        setShowConfirmation(false);
        setIsUpdating(false);
    };

    if (isUpdating) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-10 relative animate-in zoom-in duration-300">
                <button
                    onClick={() => setIsUpdating(false)}
                    className="absolute top-8 left-8 text-slate-400 hover:text-slate-900 font-bold flex items-center space-x-2 transition-colors"
                >
                    <ArrowRight size={18} className="rotate-180" />
                    <span>Volver al Menú</span>
                </button>
                <div className="max-w-4xl w-full text-center">
                    <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center space-x-4 text-amber-700 mx-auto w-fit">
                        <AlertTriangle size={20} />
                        <p className="text-sm font-bold">Atención: Cargue un Excel para iniciar el proceso de actualización.</p>
                    </div>
                    {!pendingData && (
                        <FileUploader onDataLoaded={(result) => {
                            setPendingData(result);
                            setShowSelection(true);
                        }} />
                    )}
                </div>

                {/* MODAL 1: Seleccionar Modo */}
                {showSelection && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[40px] shadow-2xl max-w-2xl w-full p-10 space-y-8 animate-in zoom-in duration-300">
                            <div className="text-center space-y-2">
                                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <RefreshCw size={32} />
                                </div>
                                <h3 className="text-3xl font-black text-slate-900">Método de Actualización</h3>
                                <p className="text-slate-500 font-medium">¿Cómo desea integrar la nueva información?</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button
                                    onClick={() => { setSyncMode('delta'); setShowSelection(false); setShowConfirmation(true); }}
                                    className="p-6 border-2 border-slate-100 rounded-3xl text-left hover:border-blue-500 hover:bg-blue-50 transition-all group"
                                >
                                    <div className="font-black text-slate-900 mb-1 group-hover:text-blue-700">Actualización Delta (NRC)</div>
                                    <p className="text-xs text-slate-500">Solo reemplaza los cursos (NRCs) que vienen en el archivo. Mantiene el resto intacto.</p>
                                </button>
                                <button
                                    onClick={() => { setSyncMode('full'); setShowSelection(false); setShowConfirmation(true); }}
                                    className="p-6 border-2 border-slate-100 rounded-3xl text-left hover:border-amber-500 hover:bg-amber-50 transition-all group"
                                >
                                    <div className="font-black text-slate-900 mb-1 group-hover:text-amber-700">Reemplazo Total</div>
                                    <p className="text-xs text-slate-500">Borra TODA la programación actual y la reemplaza por el contenido del Excel.</p>
                                </button>
                            </div>

                            <button onClick={() => { setPendingData(null); setShowSelection(false); }} className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors uppercase text-xs tracking-widest">
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* MODAL 2: Confirmar Impacto */}
                {showConfirmation && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[40px] shadow-2xl max-w-md w-full p-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <AlertTriangle size={32} />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900">Confirmar Impacto</h3>
                                <p className="text-slate-500 text-sm mt-2">Se realizarán los siguientes cambios en la nube:</p>
                            </div>

                            <div className="bg-slate-50 rounded-3xl p-6 space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500 text-sm font-bold">Registros a eliminar:</span>
                                    <span className="text-red-600 font-black text-lg">-{stats.toDelete}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500 text-sm font-bold">Registros a agregar:</span>
                                    <span className="text-emerald-600 font-black text-lg">+{stats.toAdd}</span>
                                </div>
                                <div className="pt-4 border-t border-slate-200">
                                    <div className="text-[10px] uppercase tracking-widest text-slate-400 font-black mb-1 text-center">Modo de Sync</div>
                                    <div className={`text-center font-black text-sm ${syncMode === 'full' ? 'text-amber-600' : 'text-blue-600'}`}>
                                        {syncMode === 'full' ? 'REEMPLAZO TOTAL' : 'DELTA POR NRC'}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col space-y-3">
                                <button
                                    onClick={handleConfirmSync}
                                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                                >
                                    ¡SÍ, ACTUALIZAR AHORA!
                                </button>
                                <button
                                    onClick={() => setShowConfirmation(false)}
                                    className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors uppercase text-xs tracking-widest"
                                >
                                    Cancelar y revisar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 lg:p-12 animate-in fade-in duration-500 overflow-y-auto">
            <div className="max-w-6xl w-full space-y-12 py-10">
                <div className="text-center space-y-2">
                    <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">Menú de Gestión</h2>
                    <p className="text-slate-500 font-medium">Seleccione el módulo de operación para administrar el semestre</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
                    <button onClick={() => navigate('/progress')} className="group bg-white p-6 lg:p-8 rounded-[40px] shadow-2xl border border-slate-100 text-left hover:border-blue-500 transition-all hover:shadow-blue-200/50">
                        <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl w-fit mb-6 group-hover:bg-blue-600 group-hover:text-white transition-colors"><TrendingUp size={28} /></div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2">Avance Horarios</h3>
                        <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">Seguimiento de auditoría y exportación de docentes.</p>
                        <div className="flex items-center space-x-2 text-blue-600 font-black uppercase text-[10px] tracking-widest"><span>Ingresar</span><ArrowRight size={14} /></div>
                    </button>

                    <button onClick={() => navigate('/reports')} className="group bg-white p-6 lg:p-8 rounded-[40px] shadow-2xl border border-slate-100 text-left hover:border-indigo-500 transition-all hover:shadow-indigo-200/50">
                        <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl w-fit mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-colors"><BarChart4 size={28} /></div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2">Reportes</h3>
                        <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">Auditoría global de carga académica y ocupación semestral.</p>
                        <div className="flex items-center space-x-2 text-indigo-600 font-black uppercase text-[10px] tracking-widest"><span>Ingresar</span><ArrowRight size={14} /></div>
                    </button>

                    <button onClick={() => { navigate('/schedule?view=Bloque'); }} className="group bg-white p-6 lg:p-8 rounded-[40px] shadow-2xl border border-slate-100 text-left hover:border-blue-500 transition-all hover:shadow-blue-200/50">
                        <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl w-fit mb-6 group-hover:bg-blue-600 group-hover:text-white transition-colors"><LayoutDashboard size={28} /></div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2">Visualizador</h3>
                        <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">Grilla horaria interactiva por bloques, ambientes y docentes.</p>
                        <div className="flex items-center space-x-2 text-blue-600 font-black uppercase text-[10px] tracking-widest"><span>Ingresar</span><ArrowRight size={14} /></div>
                    </button>

                    <button onClick={() => { navigate('/schedule?view=Instructor&mode=editor'); }} className="group bg-white p-6 lg:p-8 rounded-[40px] shadow-2xl border border-slate-100 text-left hover:border-emerald-500 transition-all hover:shadow-emerald-200/50">
                        <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl w-fit mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors"><Edit3 size={28} /></div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2">Editor Docente</h3>
                        <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">Asignación de tareas administrativas y preparación de carga.</p>
                        <div className="flex items-center space-x-2 text-emerald-600 font-black uppercase text-[10px] tracking-widest"><span>Ingresar</span><ArrowRight size={14} /></div>
                    </button>

                    <button onClick={() => navigate('/instructors')} className="group bg-white p-6 lg:p-8 rounded-[40px] shadow-2xl border border-slate-100 text-left hover:border-indigo-400 transition-all hover:shadow-indigo-100/50">
                        <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl w-fit mb-6 group-hover:bg-indigo-500 group-hover:text-white transition-colors"><Users size={28} /></div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2">Instructores</h3>
                        <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">Gestión de la base de datos de docentes, tipos y especialidades.</p>
                        <div className="flex items-center space-x-2 text-indigo-500 font-black uppercase text-[10px] tracking-widest"><span>Gestionar</span><ArrowRight size={14} /></div>
                    </button>

                    <button onClick={() => navigate('/rooms')} className="group bg-white p-6 lg:p-8 rounded-[40px] shadow-2xl border border-slate-100 text-left hover:border-orange-400 transition-all hover:shadow-orange-100/50">
                        <div className="p-4 bg-orange-50 text-orange-500 rounded-2xl w-fit mb-6 group-hover:bg-orange-500 group-hover:text-white transition-colors"><MapPin size={28} /></div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2">Ambientes</h3>
                        <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">Administración de aulas, edificios y aforos por carrera.</p>
                        <div className="flex items-center space-x-2 text-orange-500 font-black uppercase text-[10px] tracking-widest"><span>Gestionar</span><ArrowRight size={14} /></div>
                    </button>

                    <button
                        onClick={() => setIsUpdating(true)}
                        className="group bg-slate-900 p-6 lg:p-8 rounded-[40px] shadow-2xl border border-slate-800 text-left hover:bg-blue-600 transition-all hover:shadow-blue-200/50"
                    >
                        <div className="p-4 bg-slate-800 text-slate-400 rounded-2xl w-fit mb-6 group-hover:bg-blue-500 group-hover:text-white transition-colors"><RefreshCw size={28} /></div>
                        <h3 className="text-2xl font-black text-white mb-2">Actualizar Data</h3>
                        <p className="text-slate-400 font-medium text-sm leading-relaxed mb-6">Cargar un nuevo archivo Excel para actualizar la programación semestral.</p>
                        <div className="flex items-center space-x-2 text-blue-400 font-black uppercase text-[10px] tracking-widest group-hover:text-white transition-colors"><span>Cargar Excel</span><Upload size={14} /></div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
