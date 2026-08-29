import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BarChart4, LayoutDashboard, Edit3, Users, MapPin, ArrowRight,
    RefreshCw, AlertTriangle, Upload, TrendingUp, CheckCircle2,
    Clock, Calendar, Activity, Database, ShieldCheck, CheckCircle, FileText, Building2
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import FileUploader from '../components/FileUploader';
import { generateProgramacionTemplate } from '../services/templateGenerator';
import { findMissingCatalogReferences, resolveInstructorForRecord } from '../services/businessRules';
import { computeDeltaDiff } from '../services/deltaDiff';
import DeltaReviewPanel from '../components/DeltaReviewPanel';
import { ACTIVE_PERIODO } from '../constants';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { isSuperuser } = useAuth();
    const {
        uploadSchedulesToSupabase, schedules, instructors,
        isLoading, allSchedules, exportedInstructors, rooms,
        saveInstructorCloud, saveRoomCloud, saveScheduleCloud, refreshData,
        careersMap
    } = useData();

    const [isUpdating, setIsUpdating] = React.useState(false);
    const [isDownloadingTemplate, setIsDownloadingTemplate] = React.useState(false);

    const handleDownloadTemplate = async () => {
        setIsDownloadingTemplate(true);
        try {
            const blob = await generateProgramacionTemplate(careersMap);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'AcademiTrack_Plantilla_Programacion.xlsx';
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e: any) {
            console.error('Error generando plantilla:', e);
            alert('Error al generar la plantilla: ' + e.message);
        } finally {
            setIsDownloadingTemplate(false);
        }
    };
    const [showRecoveryModal, setShowRecoveryModal] = React.useState(false);
    const [recoveryType, setRecoveryType] = React.useState<'admin' | 'visual' | null>(null);
    const [isRecovering, setIsRecovering] = React.useState(false);
    const [previewData, setPreviewData] = React.useState<any[]>([]);
    const [showPreview, setShowPreview] = React.useState(false);

    const handleRecoveryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !recoveryType) return;

        setIsRecovering(true);
        try {
            const { parseAdminTasksRecovery, parseScheduleRecovery } = await import('../services/excelParser');
            const recovered = recoveryType === 'admin'
                ? await parseAdminTasksRecovery(file)
                : await parseScheduleRecovery(file);

            if (recovered.length > 0) {
                // VINCULACIÓN INTELIGENTE PARA PREVIEW
                const processed = recovered.map(task => {
                    const official = resolveInstructorForRecord(task, instructors);
                    if (official) {
                        return { ...task, instructor: official.name, instructorId: official.id };
                    }
                    return task;
                });

                // Deduplicar localmente para el preview
                const unique = Array.from(new Map(processed.map(item => [item.id, item])).values());
                setPreviewData(unique);
                setShowPreview(true);
            } else {
                alert('No se detectaron tareas administrativas en este archivo. Verifique el formato seleccionado.');
            }
        } catch (err) {
            console.error(err);
            alert('Error al procesar el archivo. Verifique que sea el formato correcto.');
        } finally {
            setIsRecovering(false);
        }
    };

    const confirmRecovery = async () => {
        if (previewData.length === 0) return;
        setIsRecovering(true);
        try {
            await saveScheduleCloud(previewData);
            await refreshData();
            alert(`¡Éxito! Se han guardado ${previewData.length} tareas en la base de datos.`);
            setShowPreview(false);
            setPreviewData([]);
            setShowRecoveryModal(false);
            setRecoveryType(null);
        } catch (err) {
            alert('Error al guardar datos en la nube.');
        } finally {
            setIsRecovering(false);
        }
    };

    // Estados para el flujo de sincronización del Excel
    const [pendingData, setPendingData] = React.useState<any>(null);
    const [syncMode, setSyncMode] = React.useState<'full' | 'delta' | 'new_period'>('full');
    const [showSelection, setShowSelection] = React.useState(false);
    const [showConfirmation, setShowConfirmation] = React.useState(false);
    const [missingInstructors, setMissingInstructors] = React.useState<any[]>([]);
    const [missingRooms, setMissingRooms] = React.useState<any[]>([]);
    const [showMissingModal, setShowMissingModal] = React.useState(false);
    const [showDeltaReview, setShowDeltaReview] = React.useState(false);
    const [deltaSelectedNrcs, setDeltaSelectedNrcs] = React.useState<Set<string>>(new Set());

    // Estadísticas en tiempo real para el Dashboard
    const liveStats = useMemo(() => {
        const totalSchedules = allSchedules.length;
        const totalInstructors = instructors.length;
        const totalRooms = rooms.length;
        const exportedCount = exportedInstructors.size;
        const coveragePercent = totalInstructors > 0 ? Math.round((exportedCount / totalInstructors) * 100) : 0;

        return {
            totalSchedules,
            totalInstructors,
            totalRooms,
            coveragePercent,
            lastUpdate: new Date().toLocaleDateString()
        };
    }, [allSchedules, instructors, rooms, exportedInstructors]);

    // Periodo(s) detectado(s) en el archivo cargado, para mostrarlo antes de sincronizar
    const filePeriodos = useMemo(() => {
        if (!pendingData) return [];
        return Array.from(new Set(pendingData.schedules.map((s: any) => s.periodo).filter(Boolean)));
    }, [pendingData]);

    // Cálculos de impacto para la sincronización
    const syncStats = useMemo(() => {
        if (!pendingData) return { toDelete: 0, toAdd: 0 };
        if (syncMode === 'full') {
            return {
                toDelete: schedules.length + instructors.length,
                toAdd: pendingData.schedules.length + pendingData.instructors.length
            };
        } else if (syncMode === 'new_period') {
            const periodosDelArchivo = new Set(pendingData.schedules.map((s: any) => s.periodo));
            const matchingExisting = schedules.filter(s => periodosDelArchivo.has(s.periodo) && !s.isAdministrative);
            return {
                toDelete: matchingExisting.length,
                toAdd: pendingData.schedules.length
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

    // Diff por NRC para el modo Delta: compara lo que ya está en BD (para el periodo del
    // archivo) contra lo que trae el archivo, para poder elegir qué NRC aplicar en vez de
    // pisar todos los NRC del archivo a ciegas.
    const deltaDiff = useMemo(() => {
        if (!pendingData || syncMode !== 'delta') return null;
        const periodosDelArchivo = Array.from(new Set(pendingData.schedules.map((s: any) => s.periodo).filter(Boolean))) as string[];
        return computeDeltaDiff(schedules, pendingData.schedules, periodosDelArchivo);
    }, [pendingData, syncMode, schedules]);

    // Preselecciona todos los NRC nuevos/cambiados cada vez que se recalcula el diff
    // (al entrar al panel con un archivo nuevo). Los "sin cambios" ni siquiera se listan.
    React.useEffect(() => {
        if (deltaDiff) {
            setDeltaSelectedNrcs(new Set(deltaDiff.entries.map(e => e.nrc)));
        }
    }, [deltaDiff]);

    const toggleDeltaNrc = (nrc: string) => {
        setDeltaSelectedNrcs(prev => {
            const next = new Set(prev);
            if (next.has(nrc)) next.delete(nrc); else next.add(nrc);
            return next;
        });
    };

    // Payload real a subir: en modo Delta, solo las filas de los NRC que el usuario dejó
    // marcados en el panel de revisión; en los demás modos, el archivo completo.
    const getPayloadToSend = () => {
        if (!pendingData) return pendingData;
        if (syncMode !== 'delta') return pendingData;
        return {
            ...pendingData,
            schedules: pendingData.schedules.filter((s: any) => deltaSelectedNrcs.has(s.nrc)),
        };
    };

    const handleConfirmSync = async () => {
        if (!pendingData) return;
        const payloadToSend = getPayloadToSend();

        // Referencias detectadas DENTRO de Programación (por ID/nombre de instructor y por
        // Edificio+Aula) que no existen todavía en los catálogos actuales. A diferencia del
        // chequeo anterior, esto funciona aunque el archivo no traiga hojas de Instructores/Aula.
        const { missingInstructors: missingInst, missingRooms: missingRm } = findMissingCatalogReferences(
            payloadToSend.schedules, instructors, rooms
        );

        if (missingInst.length > 0 || missingRm.length > 0) {
            setMissingInstructors(missingInst.map(m => ({
                id: m.id || `NEW-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
                name: m.name || 'Sin nombre',
                type: 'TP',
                maxHours: 40,
                specialty: 'Por definir',
                campus: 'Principal',
                status: 'Activo'
            })));
            setMissingRooms(missingRm.map(m => ({
                roomKey: m.roomKey,
                building: m.building,
                room: m.room,
                career: '',
                description: '',
                type: 'AULA',
                capacity: 0
            })));
            setShowMissingModal(true);
            return;
        }

        await uploadSchedulesToSupabase(payloadToSend, syncMode);
        setPendingData(null);
        setShowConfirmation(false);
        setShowDeltaReview(false);
        setIsUpdating(false);
    };

    const handleRegisterAndContinue = async () => {
        for (const inst of missingInstructors) {
            await saveInstructorCloud(inst);
        }
        for (const room of missingRooms) {
            await saveRoomCloud(room);
        }

        setShowMissingModal(false);
        setMissingInstructors([]);
        setMissingRooms([]);
        await uploadSchedulesToSupabase(getPayloadToSend(), syncMode);
        setPendingData(null);
        setShowConfirmation(false);
        setShowDeltaReview(false);
        setIsUpdating(false);
    };

    if (isUpdating) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-10 relative animate-in zoom-in duration-300">
                <button
                    onClick={() => setIsUpdating(false)}
                    className="absolute top-8 left-8 p-3 bg-white shadow-lg rounded-2xl text-slate-400 hover:text-slate-900 font-bold flex items-center space-x-2 transition-all active:scale-95"
                >
                    <ArrowRight size={18} className="rotate-180" />
                    <span className="text-xs uppercase tracking-widest">Volver</span>
                </button>
                <div className="max-w-4xl w-full text-center">
                    <div className="mb-8 p-6 bg-white border border-slate-100 shadow-xl rounded-[32px] flex items-center space-x-6 text-slate-700 mx-auto w-fit animate-pulse">
                        <div className="p-3 bg-amber-50 text-amber-500 rounded-xl"><AlertTriangle size={24} /></div>
                        <div className="text-left">
                            <p className="text-sm font-black uppercase tracking-tight">Modo Actualización</p>
                            <p className="text-xs text-slate-400 font-bold">Cargue un archivo Excel para iniciar la sincronización con la nube.</p>
                        </div>
                    </div>
                    {!pendingData && (
                        <>
                            <FileUploader onDataLoaded={(result) => {
                                setPendingData(result);
                                setShowSelection(true);
                            }} />
                            <button
                                onClick={handleDownloadTemplate}
                                disabled={isDownloadingTemplate}
                                className="mt-6 flex items-center justify-center space-x-2 mx-auto px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-600 hover:shadow-lg transition-all disabled:opacity-50"
                            >
                                <FileText size={16} />
                                <span>{isDownloadingTemplate ? 'Generando...' : 'Descargar Plantilla de Programación'}</span>
                            </button>
                        </>
                    )}
                </div>

                {/* MODAL 1: Seleccionar Modo */}
                {showSelection && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[40px] shadow-2xl max-w-2xl w-full p-10 space-y-8 animate-in zoom-in duration-300">
                            <div className="text-center space-y-2">
                                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><RefreshCw size={32} /></div>
                                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Método de Integración</h3>
                                <p className="text-slate-500 font-medium">Seleccione cómo desea procesar los nuevos datos.</p>
                            </div>

                            <div className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest ${filePeriodos.length === 1 && filePeriodos[0] === ACTIVE_PERIODO
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : 'bg-amber-50 text-amber-700 border border-amber-100'
                                }`}>
                                <Calendar size={16} />
                                <span>
                                    {filePeriodos.length === 0
                                        ? 'El archivo no trae periodo identificado'
                                        : `Periodo en el archivo: ${filePeriodos.join(', ')}`}
                                    {filePeriodos.length === 1 && filePeriodos[0] !== ACTIVE_PERIODO && ` (el periodo activo es ${ACTIVE_PERIODO})`}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <button onClick={() => { setSyncMode('delta'); setShowSelection(false); setShowDeltaReview(true); }} className="p-8 border-2 border-slate-50 bg-slate-50 rounded-[32px] text-left hover:border-blue-500 hover:bg-white hover:shadow-2xl hover:shadow-blue-100 transition-all group">
                                    <div className="font-black text-slate-900 mb-2 group-hover:text-blue-600 uppercase text-sm tracking-tight">Delta (Por NRC)</div>
                                    <p className="text-xs text-slate-500 leading-relaxed">Reemplaza solo los NRC que trae el archivo, sin tocar el resto. Ideal para correcciones puntuales sobre un periodo ya cargado.</p>
                                </button>
                                <button onClick={() => { setSyncMode('new_period'); setShowSelection(false); setShowConfirmation(true); }} className="p-8 border-2 border-emerald-100 bg-emerald-50/50 rounded-[32px] text-left hover:border-emerald-500 hover:bg-white hover:shadow-2xl hover:shadow-emerald-100 transition-all group relative">
                                    <div className="absolute top-4 right-4 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">Recomendado</div>
                                    <div className="font-black text-slate-900 mb-2 group-hover:text-emerald-600 uppercase text-sm tracking-tight">Información Nuevo Periodo</div>
                                    <p className="text-xs text-slate-500 leading-relaxed">Reemplaza TODA la programación académica del periodo que trae el archivo (sin dejar NRC huérfanos), sin tocar instructores, aulas, feriados ni tareas administrativas. Úselo para la primera carga de un semestre nuevo.</p>
                                </button>
                                <button onClick={() => { setSyncMode('full'); setShowSelection(false); setShowConfirmation(true); }} className="p-8 border-2 border-slate-50 bg-slate-50 rounded-[32px] text-left hover:border-amber-500 hover:bg-white hover:shadow-2xl hover:shadow-amber-100 transition-all group">
                                    <div className="font-black text-slate-900 mb-2 group-hover:text-amber-600 uppercase text-sm tracking-tight">Carga Completa</div>
                                    <p className="text-xs text-slate-500 leading-relaxed">Además del periodo, reemplaza instructores, aulas y feriados si el archivo los trae. Úselo solo si también vas a reemplazar esos catálogos.</p>
                                </button>
                            </div>
                            <button onClick={() => { setPendingData(null); setShowSelection(false); }} className="w-full py-4 text-slate-400 font-bold hover:text-rose-500 transition-colors uppercase text-xs tracking-widest">Cancelar</button>
                        </div>
                    </div>
                )}

                {/* MODAL 2: Confirmar Impacto */}
                {showConfirmation && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[40px] shadow-2xl max-w-md w-full p-10 animate-in slide-in-from-bottom-4 duration-300">
                            <div className="text-center mb-8">
                                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><ShieldCheck size={32} /></div>
                                <h3 className="text-2xl font-black text-slate-900">Validar Cambios</h3>
                                <p className="text-slate-500 text-sm mt-2">Esta acción modificará la base de datos global de Supabase.</p>
                            </div>
                            <div className="bg-slate-50 rounded-3xl p-8 space-y-5 mb-8">
                                <div className="flex justify-between items-center"><span className="text-slate-400 text-[10px] font-black uppercase">Remover</span><span className="text-rose-600 font-black text-xl">-{syncStats.toDelete}</span></div>
                                <div className="flex justify-between items-center"><span className="text-slate-400 text-[10px] font-black uppercase">Insertar</span><span className="text-emerald-600 font-black text-xl">+{syncStats.toAdd}</span></div>
                                <div className="pt-4 border-t border-slate-200 text-center">
                                    <div className={`px-4 py-2 rounded-xl inline-block font-black text-[10px] uppercase tracking-widest ${syncMode === 'full' ? 'bg-amber-100 text-amber-700' : syncMode === 'new_period' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                        MODO: {syncMode === 'full' ? 'FULL REPLACEMENT' : syncMode === 'new_period' ? 'NUEVO PERIODO' : 'DELTA (SMART)'}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <button onClick={handleConfirmSync} disabled={isLoading} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 uppercase tracking-widest text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                    {isLoading && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                                    {isLoading ? 'Sincronizando...' : 'Confirmar y Sincronizar'}
                                </button>
                                <button onClick={() => setShowConfirmation(false)} className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors uppercase text-xs tracking-widest">Revisar de nuevo</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* PANEL DELTA: Revisión de cambios detectados por NRC antes de sincronizar */}
                {showDeltaReview && deltaDiff && (
                    <DeltaReviewPanel
                        diff={deltaDiff}
                        selectedNrcs={deltaSelectedNrcs}
                        onToggleNrc={toggleDeltaNrc}
                        onSelectAll={() => setDeltaSelectedNrcs(new Set(deltaDiff.entries.map(e => e.nrc)))}
                        onSelectNone={() => setDeltaSelectedNrcs(new Set())}
                        onConfirm={handleConfirmSync}
                        onCancel={() => { setPendingData(null); setShowDeltaReview(false); }}
                        isLoading={isLoading}
                    />
                )}

                {/* MODAL 3: Registro de Referencias Pendientes (docentes/aulas nuevas detectadas en Programación) */}
                {showMissingModal && (
                    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-6">
                        <div className="bg-white rounded-[40px] shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in duration-300">
                            <div className="p-10 border-b border-slate-100 bg-slate-50/50">
                                <div className="flex items-center space-x-4 mb-2">
                                    <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl"><AlertTriangle size={24} /></div>
                                    <h3 className="text-2xl font-black text-slate-900">Referencias Nuevas Detectadas</h3>
                                </div>
                                <p className="text-slate-500 text-sm font-medium">
                                    El archivo referencia {missingInstructors.length} instructor(es) y {missingRooms.length} aula(s) que no están en la Base de Datos. Complete los datos para registrarlos antes de sincronizar.
                                </p>
                            </div>

                            <div className="p-10 overflow-y-auto space-y-8">
                                {missingInstructors.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center space-x-2 text-slate-400"><Users size={16} /><h4 className="text-[10px] font-black uppercase tracking-widest">Instructores Nuevos</h4></div>
                                        {missingInstructors.map((inst, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                                <div className="space-y-1">
                                                    <p className="font-black text-slate-900">{inst.name}</p>
                                                    <div className="flex items-center space-x-3">
                                                        <input
                                                            placeholder="ID (Opcional)"
                                                            value={inst.id.startsWith('NEW-') ? '' : inst.id}
                                                            onChange={(e) => {
                                                                const copy = [...missingInstructors];
                                                                copy[idx].id = e.target.value || inst.id;
                                                                setMissingInstructors(copy);
                                                            }}
                                                            className="text-[10px] font-bold bg-white px-2 py-1 rounded-md border border-slate-200 w-24"
                                                        />
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{inst.id}</span>
                                                    </div>
                                                </div>
                                                <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200">
                                                    <button
                                                        onClick={() => {
                                                            const copy = [...missingInstructors];
                                                            copy[idx].type = 'TC';
                                                            setMissingInstructors(copy);
                                                        }}
                                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${inst.type === 'TC' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:text-slate-600'}`}
                                                    >TC</button>
                                                    <button
                                                        onClick={() => {
                                                            const copy = [...missingInstructors];
                                                            copy[idx].type = 'TP';
                                                            setMissingInstructors(copy);
                                                        }}
                                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${inst.type === 'TP' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'text-slate-400 hover:text-slate-600'}`}
                                                    >TP</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {missingRooms.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center space-x-2 text-slate-400"><MapPin size={16} /><h4 className="text-[10px] font-black uppercase tracking-widest">Aulas Nuevas</h4></div>
                                        {missingRooms.map((room, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                                <div className="space-y-1">
                                                    <p className="font-black text-slate-900">{room.building} - {room.room}</p>
                                                    <input
                                                        placeholder="Carrera responsable (opcional)"
                                                        value={room.career}
                                                        onChange={(e) => {
                                                            const copy = [...missingRooms];
                                                            copy[idx].career = e.target.value;
                                                            setMissingRooms(copy);
                                                        }}
                                                        className="text-[10px] font-bold bg-white px-2 py-1 rounded-md border border-slate-200 w-56"
                                                    />
                                                </div>
                                                <input
                                                    type="number"
                                                    placeholder="Aforo"
                                                    value={room.capacity}
                                                    onChange={(e) => {
                                                        const copy = [...missingRooms];
                                                        copy[idx].capacity = Number(e.target.value);
                                                        setMissingRooms(copy);
                                                    }}
                                                    className="text-[10px] font-bold bg-white px-2 py-2 rounded-md border border-slate-200 w-20 text-center"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="p-10 border-t border-slate-100 flex items-center space-x-4">
                                <button
                                    onClick={() => setShowMissingModal(false)}
                                    className="px-8 py-4 text-slate-400 font-bold hover:text-slate-600 uppercase text-xs tracking-widest"
                                >Atrás</button>
                                <button
                                    onClick={handleRegisterAndContinue}
                                    disabled={isLoading}
                                    className="flex-1 py-4 bg-slate-900 text-white rounded-3xl font-black hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 uppercase tracking-widest text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isLoading && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                                    {isLoading ? 'Sincronizando...' : 'Registrar y Sincronizar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col animate-in fade-in duration-700 overflow-y-auto custom-scrollbar">
            {/* 1. Header Hero Section */}
            <header className="px-4 sm:px-8 lg:px-20 pt-10 sm:pt-16 pb-10 sm:pb-12 bg-white border-b border-slate-100">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-8">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <div className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-[0.2em]">AcademiTrack v2</div>
                            <div className="flex items-center px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-[10px] font-black uppercase tracking-widest" title="La app solo carga horarios de este periodo">
                                <Calendar size={12} className="mr-1.5" /> Periodo Activo: {ACTIVE_PERIODO}
                            </div>
                            <div className="flex items-center text-slate-400 text-[10px] font-black uppercase tracking-widest"><Clock size={12} className="mr-1" /> Actualizado: {liveStats.lastUpdate}</div>
                        </div>
                        <h1 className="text-3xl sm:text-4xl lg:text-6xl font-black text-slate-900 tracking-tighter leading-none">
                            Panel <span className="text-indigo-600 italic">Operativo</span>
                        </h1>
                        <p className="text-sm sm:text-lg text-slate-500 font-medium max-w-xl">
                            Bienvenido al centro de mando académico. Gestione cargas, audite horarios y optimice la programación docente.
                        </p>
                    </div>

                    {/* Tarjeta de Cobertura */}
                    <div className="bg-indigo-50/50 p-5 sm:p-6 rounded-[28px] sm:rounded-[32px] border border-indigo-100 flex items-center gap-4 sm:gap-6 w-full md:w-auto md:min-w-[280px]">
                        <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center shrink-0">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-indigo-100" />
                                <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={175} strokeDashoffset={175 - (175 * liveStats.coveragePercent) / 100} className="text-indigo-600 transition-all duration-1000" strokeLinecap="round" />
                            </svg>
                            <span className="absolute text-xs font-black text-indigo-700">{liveStats.coveragePercent}%</span>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Docentes Exportados</p>
                            <h4 className="text-xl sm:text-2xl font-black text-indigo-900 truncate">{exportedInstructors.size} <span className="text-sm text-indigo-400 text-normal">/ {liveStats.totalInstructors} Docentes</span></h4>
                        </div>
                    </div>
                </div>
            </header>

            <main className="px-4 sm:px-8 lg:px-20 py-8 sm:py-12 max-w-7xl mx-auto w-full space-y-10 sm:space-y-16">

                {/* 2. Sección de Estadísticas Rápidas */}
                <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
                    <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3 sm:space-x-4">
                        <div className="p-3 sm:p-4 bg-blue-50 text-blue-600 rounded-xl sm:rounded-2xl shrink-0"><Activity size={20} className="sm:hidden" /><Activity size={24} className="hidden sm:block" /></div>
                        <div className="min-w-0"><p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">Sesiones Totales</p><h4 className="text-lg sm:text-xl font-black text-slate-900">{liveStats.totalSchedules}</h4></div>
                    </div>
                    <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3 sm:space-x-4">
                        <div className="p-3 sm:p-4 bg-indigo-50 text-indigo-600 rounded-xl sm:rounded-2xl shrink-0"><Users size={20} className="sm:hidden" /><Users size={24} className="hidden sm:block" /></div>
                        <div className="min-w-0"><p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">Plantilla Docente</p><h4 className="text-lg sm:text-xl font-black text-slate-900">{liveStats.totalInstructors}</h4></div>
                    </div>
                    <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3 sm:space-x-4">
                        <div className="p-3 sm:p-4 bg-emerald-50 text-emerald-600 rounded-xl sm:rounded-2xl shrink-0"><MapPin size={20} className="sm:hidden" /><MapPin size={24} className="hidden sm:block" /></div>
                        <div className="min-w-0"><p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">Aulas Activas</p><h4 className="text-lg sm:text-xl font-black text-slate-900">{liveStats.totalRooms}</h4></div>
                    </div>
                    <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3 sm:space-x-4">
                        <div className="p-3 sm:p-4 bg-amber-50 text-amber-600 rounded-xl sm:rounded-2xl shrink-0"><Database size={20} className="sm:hidden" /><Database size={24} className="hidden sm:block" /></div>
                        <div className="min-w-0"><p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">Modo Servidor</p><h4 className="text-lg sm:text-xl font-black text-slate-900 truncate">Supabase Cloud</h4></div>
                    </div>
                </section>

                {/* 3. Módulos Operativos (Los más importantes) */}
                <section className="space-y-5">
                    <div className="flex items-center space-x-3">
                        <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                        <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Centro de Operaciones</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
                        <button onClick={() => navigate('/schedule?view=Bloque')} className="group bg-white p-6 rounded-[28px] shadow-lg hover:shadow-indigo-200/50 border border-slate-50 text-left transition-all hover:-translate-y-1">
                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-5 group-hover:bg-blue-600 group-hover:text-white transition-all"><LayoutDashboard size={22} /></div>
                            <h3 className="text-lg font-black text-slate-900 mb-2">Visualizador</h3>
                            <p className="text-xs text-slate-400 font-bold leading-relaxed mb-5">Grilla dinámica para monitoreo de bloques y ambientes en tiempo real.</p>
                            <div className="flex items-center space-x-2 text-blue-600 font-black uppercase text-[10px] tracking-widest">Acceder Ahora <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" /></div>
                        </button>

                        <button onClick={() => navigate('/progress')} className="group bg-white p-6 rounded-[28px] shadow-lg hover:shadow-indigo-200/50 border border-slate-50 text-left transition-all hover:-translate-y-1">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-5 group-hover:bg-emerald-600 group-hover:text-white transition-all"><TrendingUp size={22} /></div>
                            <h3 className="text-lg font-black text-slate-900 mb-2">Auditoría Individual</h3>
                            <p className="text-xs text-slate-400 font-bold leading-relaxed mb-5">Revisión profunda, generación de hojas de carga y exportación masiva.</p>
                            <div className="flex items-center space-x-2 text-emerald-600 font-black uppercase text-[10px] tracking-widest">Revisar Avance <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" /></div>
                        </button>

                        <button onClick={() => navigate('/attendance')} className="group bg-white p-6 rounded-[28px] shadow-lg hover:shadow-indigo-200/50 border border-slate-50 text-left transition-all hover:-translate-y-1">
                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-5 group-hover:bg-blue-600 group-hover:text-white transition-all"><FileText size={22} /></div>
                            <h3 className="text-lg font-black text-slate-900 mb-2">Fichas de Asistencia</h3>
                            <p className="text-xs text-slate-400 font-bold leading-relaxed mb-5">Gestión de jornadas TP presenciales y generación de documentos para planilla.</p>
                            <div className="flex items-center space-x-2 text-blue-600 font-black uppercase text-[10px] tracking-widest">Generar Fichas <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" /></div>
                        </button>

                        <button onClick={() => navigate('/reports')} className="group bg-white p-6 rounded-[28px] shadow-lg hover:shadow-indigo-200/50 border border-slate-50 text-left transition-all hover:-translate-y-1">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-600 group-hover:text-white transition-all"><BarChart4 size={22} /></div>
                            <h3 className="text-lg font-black text-slate-900 mb-2">Reporte Global</h3>
                            <p className="text-xs text-slate-400 font-bold leading-relaxed mb-5">Dashboard avanzado de conflictos, excesos de jornada y equilibrio de carga.</p>
                            <div className="flex items-center space-x-2 text-indigo-600 font-black uppercase text-[10px] tracking-widest">Analizar Ciclo <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" /></div>
                        </button>

                        <button onClick={() => navigate('/schedule?view=Instructor&mode=editor')} className="group bg-white p-6 rounded-[28px] shadow-lg hover:shadow-indigo-200/50 border border-slate-50 text-left transition-all hover:-translate-y-1">
                            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-5 group-hover:bg-amber-600 group-hover:text-white transition-all"><Edit3 size={22} /></div>
                            <h3 className="text-lg font-black text-slate-900 mb-2">Editor de Carga</h3>
                            <p className="text-xs text-slate-400 font-bold leading-relaxed mb-5">Inserción de tareas administrativas y personalización de sesiones lógicas.</p>
                            <div className="flex items-center space-x-2 text-amber-600 font-black uppercase text-[10px] tracking-widest">Ejecutar Edición <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" /></div>
                        </button>

                        <button onClick={() => navigate('/occupancy')} className="group bg-white p-6 rounded-[28px] shadow-lg hover:shadow-indigo-200/50 border border-slate-50 text-left transition-all hover:-translate-y-1">
                            <div className="w-12 h-12 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center mb-5 group-hover:bg-cyan-600 group-hover:text-white transition-all"><Building2 size={22} /></div>
                            <h3 className="text-lg font-black text-slate-900 mb-2">Ocupabilidad</h3>
                            <p className="text-xs text-slate-400 font-bold leading-relaxed mb-5">Uso de aulas por frecuencia (semana/fin de semana) y turno, con reportes y gráficas.</p>
                            <div className="flex items-center space-x-2 text-cyan-600 font-black uppercase text-[10px] tracking-widest">Ver Reporte <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" /></div>
                        </button>
                    </div>
                </section>

                {/* 4. Sección de Gestión de Base y Configuración */}
                <section className="bg-slate-900 rounded-[28px] sm:rounded-[40px] p-6 sm:p-10 lg:p-12 text-white relative overflow-hidden shadow-2xl">
                    <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8 lg:gap-12">
                        <div className="space-y-3 sm:space-y-4 max-w-md">
                            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-none">Gestión de la Información</h2>
                            <p className="text-sm sm:text-base text-slate-400 font-medium">Administre las entidades base del sistema o actualice la programación completa vía Excel.</p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4 lg:gap-6 w-full">
                            <button onClick={() => navigate('/instructors')} className="p-4 sm:p-5 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all flex flex-col items-center text-center space-y-2 sm:space-y-3 group border border-slate-700">
                                <Users size={20} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Instructores</span>
                            </button>
                            <button onClick={() => navigate('/rooms')} className="p-4 sm:p-5 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all flex flex-col items-center text-center space-y-2 sm:space-y-3 group border border-slate-700">
                                <MapPin size={20} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Ambientes</span>
                            </button>
                            <button onClick={() => navigate('/archive')} className="p-4 sm:p-5 bg-slate-800 hover:bg-blue-600 rounded-2xl transition-all flex flex-col items-center text-center space-y-2 sm:space-y-3 group border border-slate-700 shadow-xl shadow-blue-900/10">
                                <Database size={20} className="text-blue-400 group-hover:text-white group-hover:scale-110 transition-all" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 group-hover:text-white">Registro Base</span>
                            </button>
                            <button onClick={() => setIsUpdating(true)} className="p-4 sm:p-5 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all flex flex-col items-center text-center space-y-2 sm:space-y-3 group border border-slate-700">
                                <Upload size={20} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Actualizar Excel</span>
                            </button>
                            <button onClick={() => setShowRecoveryModal(true)} className="p-4 sm:p-5 bg-emerald-600 hover:bg-emerald-500 rounded-2xl transition-all flex flex-col items-center text-center space-y-2 sm:space-y-3 group shadow-xl shadow-emerald-900/40 border border-emerald-400">
                                <RefreshCw size={20} className="text-white group-hover:rotate-180 transition-transform duration-500" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-white">Recuperar Tareas</span>
                            </button>
                            {isSuperuser && (
                                <button onClick={() => navigate('/users')} className="p-4 sm:p-5 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all flex flex-col items-center text-center space-y-2 sm:space-y-3 group border border-slate-700">
                                    <ShieldCheck size={20} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Usuarios</span>
                                </button>
                            )}
                        </div>
                    </div>
                    {/* Decoración de fondo */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none" />
                </section>

                {/* Footer simple */}
                <footer className="pt-8 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">
                    <div className="flex items-center space-x-2"><CheckCircle size={16} className="text-emerald-500" /> <span>Cloud Sync Enabled</span></div>
                    <div>AcademiTrack Engine © 2026</div>
                </footer>

                {/* Modal de Recuperación */}
                {showRecoveryModal && (
                    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-6 transition-all">
                        <div className={`bg-white rounded-[40px] shadow-2xl w-full p-8 animate-in zoom-in duration-300 transition-all ${showPreview ? 'max-w-[95vw] h-[90vh] flex flex-col' : 'max-w-xl'}`}>
                            <div className="flex items-center space-x-4 mb-8">
                                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl"><RefreshCw size={24} /></div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900">Recuperar Respaldo</h3>
                                    <p className="text-sm text-slate-500 font-medium">Seleccione el formato del archivo exportado que desea cargar.</p>
                                </div>
                            </div>

                            {!recoveryType ? (
                                <div className="grid grid-cols-1 gap-4">
                                    <button
                                        onClick={() => setRecoveryType('admin')}
                                        className="p-6 border-2 border-slate-100 hover:border-emerald-500 hover:bg-emerald-50/50 rounded-3xl transition-all text-left flex items-center justify-between group"
                                    >
                                        <div>
                                            <span className="block font-black text-slate-900">Formato: Tareas Administrativas</span>
                                            <span className="text-xs text-slate-500">Tabla Excel con columnas TIPO, FECHA, LUN, MAR...</span>
                                        </div>
                                        <ArrowRight size={20} className="text-slate-300 group-hover:text-emerald-500 transition-all" />
                                    </button>
                                    <button
                                        onClick={() => setRecoveryType('visual')}
                                        className="p-6 border-2 border-slate-100 hover:border-indigo-500 hover:bg-indigo-50/50 rounded-3xl transition-all text-left flex items-center justify-between group"
                                    >
                                        <div>
                                            <span className="block font-black text-slate-900">Formato: Horario Visual</span>
                                            <span className="text-xs text-slate-500">Calendario con celdas de colores de instructor.</span>
                                        </div>
                                        <ArrowRight size={20} className="text-slate-300 group-hover:text-indigo-500 transition-all" />
                                    </button>
                                </div>
                            ) : !showPreview ? (
                                <div className="space-y-6">
                                    <div className="p-10 bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center group hover:border-emerald-400 transition-all cursor-pointer relative overflow-hidden">
                                        <div className="p-4 bg-white rounded-2xl shadow-sm mb-4 group-hover:scale-110 transition-transform"><Upload size={32} className="text-emerald-500" /></div>
                                        <p className="text-sm font-black text-slate-900 mb-1">Subir archivo para análisis</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Formatos Excel (.xlsx, .xls)</p>
                                        <input
                                            type="file"
                                            accept=".xlsx, .xls"
                                            onChange={handleRecoveryUpload}
                                            disabled={isRecovering}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <button onClick={() => setRecoveryType(null)} className="text-xs font-black uppercase text-slate-400 hover:text-slate-600 px-4 py-2">Volver</button>
                                        {isRecovering && <div className="flex items-center space-x-2 text-emerald-600 font-bold text-xs"><RefreshCw className="animate-spin" size={14} /> <span>Analizando Excel...</span></div>}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6 max-h-[60vh] flex flex-col">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Se detectaron {previewData.length} tareas</span>
                                        <button onClick={() => setShowPreview(false)} className="text-[10px] font-black uppercase text-slate-400 hover:text-rose-500 transition-colors">Cancelar</button>
                                    </div>

                                    <div className="flex-1 overflow-auto border border-slate-100 rounded-3xl custom-scrollbar-horizontal">
                                        <table className="w-full text-left border-collapse min-w-[1000px]">
                                            <thead className="sticky top-0 bg-slate-50 z-10">
                                                <tr className="border-b border-slate-100">
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">Instructor</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">Tipo</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">Fecha In.</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">Fecha Fin</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 text-center">DOM</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 text-center">LUN</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 text-center">MAR</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 text-center">MIE</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 text-center">JUE</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 text-center">VIE</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 text-center">SAB</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">Inicio</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">Fin</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">Edif</th>
                                                    <th className="px-3 py-4 text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-slate-50">Descripción</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {previewData.map((task, idx) => {
                                                    const isMatched = !!resolveInstructorForRecord(task, instructors);
                                                    const d = task.days || [];
                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                                            <td className="px-3 py-4">
                                                                <div className="flex flex-col max-w-[150px]">
                                                                    <span className={`text-[10px] font-black truncate ${isMatched ? 'text-slate-900' : 'text-rose-600'}`}>{task.instructor}</span>
                                                                    <span className="text-[8px] text-slate-400 font-bold">ID: {task.instructorId}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-4">
                                                                <span className="text-[10px] font-black text-slate-600 bg-slate-100 px-2 py-1 rounded-md">{task.tipoRaw || (task.modality === 'virtual' ? 'REMT' : 'PRES')}</span>
                                                            </td>
                                                            <td className="px-3 py-4 text-[10px] font-bold text-slate-700">
                                                                {task.startDate instanceof Date ? task.startDate.toLocaleDateString() : 'N/A'}
                                                            </td>
                                                            <td className="px-3 py-4 text-[10px] font-bold text-slate-700">
                                                                {task.endDate instanceof Date ? task.endDate.toLocaleDateString() : 'N/A'}
                                                            </td>
                                                            {['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'].map(day => (
                                                                <td key={day} className="px-3 py-4 text-center">
                                                                    {d.includes(day) ? (
                                                                        <div className="w-5 h-5 bg-emerald-50 text-emerald-600 rounded-md flex items-center justify-center mx-auto shadow-sm">
                                                                            <CheckCircle size={12} />
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-slate-200 text-[8px]">—</span>
                                                                    )}
                                                                </td>
                                                            ))}
                                                            <td className="px-3 py-4 text-[10px] font-black text-slate-900">{task.startTime}</td>
                                                            <td className="px-3 py-4 text-[10px] font-black text-slate-900">{task.endTime}</td>
                                                            <td className="px-3 py-4 text-[10px] font-bold text-slate-500">{task.building}</td>
                                                            <td className="px-3 py-4">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] font-black text-indigo-600 uppercase whitespace-nowrap">{task.courseName}</span>
                                                                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Categoría: {task.category}</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    <button
                                        onClick={confirmRecovery}
                                        disabled={isRecovering}
                                        className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-3xl font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-emerald-900/20 transition-all flex items-center justify-center space-x-3 disabled:opacity-50"
                                    >
                                        {isRecovering ? <RefreshCw className="animate-spin" size={18} /> : <><span>Confirmar y Guardar en Nube</span> <CheckCircle2 size={18} /></>}
                                    </button>
                                </div>
                            )}

                            {!isRecovering && !showPreview && (
                                <button
                                    onClick={() => setShowRecoveryModal(false)}
                                    className="mt-8 w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black uppercase text-xs tracking-widest transition-all"
                                >
                                    Cerrar
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default LandingPage;
