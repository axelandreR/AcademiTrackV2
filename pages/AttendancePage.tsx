
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, FileText, Download, CheckCircle, Clock,
    Search, Calendar, DownloadCloud, AlertCircle, MapPin,
    ShieldCheck, AlertTriangle, RefreshCw, X
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { Instructor, ProcessedSchedule } from '../types';
import {
    getAttendancePeriodRange,
    processAttendanceJourneys,
    AttendanceSheetData
} from '../services/attendanceService';
import { generateAttendanceExcel } from '../services/attendanceExporter';
import ConfirmDialog from '../components/ConfirmDialog';
import JSZip from 'jszip';

const AttendancePage: React.FC = () => {
    const navigate = useNavigate();
    const {
        instructors, allSchedules, isLoading,
        // Auditoría en vivo compartida (calculada una sola vez en DataProvider — ver
        // context/DataContext.tsx::liveAuditByInstructor — y reutilizada aquí y en
        // ProgressPanel.tsx sin recalcularse al navegar entre esas dos pantallas).
        liveAuditByInstructor,
        getAttendanceTracking, saveAttendanceTracking,
        syncInstructorIdInSchedules
    } = useData();

    // Estados de filtro y periodo
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [searchTerm, setSearchTerm] = useState('');

    // Estado de seguimiento (Nube)
    const [generatedSheets, setGeneratedSheets] = useState<Set<string>>(new Set());
    const [viewingAudit, setViewingAudit] = useState<Instructor | null>(null);
    // Progreso de la descarga masiva (X de Y fichas), para que no parezca que la app se colgó.
    const [massiveProgress, setMassiveProgress] = useState<{ done: number; total: number } | null>(null);
    const [pendingSync, setPendingSync] = useState<Instructor | null>(null);
    const [pendingMassiveCount, setPendingMassiveCount] = useState<number | null>(null);

    useEffect(() => {
        const fetchTracking = async () => {
            const tracking = await getAttendanceTracking(selectedMonth, selectedYear);
            setGeneratedSheets(tracking);
        };
        fetchTracking();
    }, [selectedMonth, selectedYear, getAttendanceTracking]);

    const recordGeneratedStatus = async (instructorId: string) => {
        // 1. Guardar en Nube
        await saveAttendanceTracking(instructorId, selectedMonth, selectedYear);

        // 2. Actualizar estado local para feedback inmediato
        setGeneratedSheets(prev => {
            const next = new Set(prev);
            next.add(instructorId);
            return next;
        });
    };

    // 1. Filtrar instructores TP (Criterio relidado para que aparezcan aunque no tengan carga aún)
    const tpInstructorsWithPresencial = useMemo(() => {
        const { startDate, endDate } = getAttendancePeriodRange(selectedMonth, selectedYear);

        return instructors.filter(inst => {
            // 1. Solo TP
            if (inst.type !== 'TP') return false;

            // 2. Omitir placeholders (como en ProgressPanel)
            if (inst.name.toUpperCase().startsWith('INST.')) return false;

            // Si tiene búsqueda, filtramos por nombre/id
            const matchesSearch = inst.name.toLowerCase().includes(searchTerm.toLowerCase()) || inst.id.includes(searchTerm);
            if (!matchesSearch) return false;

            return true;
        }).map(inst => {
            // Antes este chequeo solo comparaba el AÑO del horario contra selectedYear (sin
            // mirar mes, ni el rango real de la ficha, ni si el día de semana cae dentro de
            // esa ventana) — un instructor podía verse "con carga" y habilitado aquí, pero al
            // descargar processAttendanceJourneys (que sí escanea día por día el rango real)
            // no encontraba ninguna jornada y tiraba "no tiene carga presencial". Ahora se usa
            // la MISMA función que genera la ficha, para que nunca se desincronicen.
            const hasPresencial = processAttendanceJourneys(inst, allSchedules, startDate, endDate).journeys.length > 0;

            return { ...inst, hasPresencial };
        });
    }, [instructors, allSchedules, selectedMonth, selectedYear, searchTerm]);

    const SENATI_LOGO_URL = 'https://afzgvqkiwlfqbidausyi.supabase.co/storage/v1/object/public/assets/LOGO_SENATI.png';

    // Ej. ABAD_JIMENEZ_CRISTY_DARWING_1560476_FA
    const buildAttendanceFileName = (instructor: Instructor) =>
        `${instructor.name.replace(/\s+/g, '_')}_${instructor.id}_FA.xlsx`;

    const handleDownloadIndividual = async (instructor: Instructor) => {
        const { startDate, endDate } = getAttendancePeriodRange(selectedMonth, selectedYear);
        const data = processAttendanceJourneys(instructor, allSchedules, startDate, endDate);

        if (data.journeys.length === 0) {
            alert("No hay jornadas presenciales en este periodo para este instructor.");
            return;
        }

        try {
            const blob = await generateAttendanceExcel(data, SENATI_LOGO_URL);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = buildAttendanceFileName(instructor);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            await recordGeneratedStatus(instructor.id);
        } catch (error) {
            console.error("Excel generation error", error);
            alert("Error al generar el archivo Excel.");
        }
    };

    const handleSync = (e: React.MouseEvent, instructor: Instructor) => {
        e.stopPropagation();
        setPendingSync(instructor);
    };

    const handleDownloadMassive = () => {
        const readyInstructors = tpInstructorsWithPresencial.filter(inst => liveAuditByInstructor.get(inst.id)?.isAuditOk);

        if (readyInstructors.length === 0) {
            alert("No hay instructores con estado de auditoría 'OK' para descarga masiva.");
            return;
        }
        setPendingMassiveCount(readyInstructors.length);
    };

    const confirmDownloadMassive = async () => {
        setPendingMassiveCount(null);
        const readyInstructors = tpInstructorsWithPresencial.filter(inst => liveAuditByInstructor.get(inst.id)?.isAuditOk);
        if (readyInstructors.length === 0) return;

        const zip = new JSZip();
        const { startDate, endDate } = getAttendancePeriodRange(selectedMonth, selectedYear);

        setMassiveProgress({ done: 0, total: readyInstructors.length });
        try {
            for (const inst of readyInstructors) {
                const data = processAttendanceJourneys(inst, allSchedules, startDate, endDate);
                if (data.journeys.length > 0) {
                    const blob = await generateAttendanceExcel(data, SENATI_LOGO_URL);
                    const fileName = buildAttendanceFileName(inst);
                    zip.file(fileName, blob);
                    await recordGeneratedStatus(inst.id);
                }
                setMassiveProgress(prev => prev ? { ...prev, done: prev.done + 1 } : prev);
            }

            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `FICHAS_MASIVAS_${selectedMonth}_${selectedYear}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } finally {
            setMassiveProgress(null);
        }
    };

    const readyToDownloadCount = useMemo(() => {
        return tpInstructorsWithPresencial.filter(inst => liveAuditByInstructor.get(inst.id)?.isAuditOk).length;
    }, [tpInstructorsWithPresencial, liveAuditByInstructor]);

    const months = [
        { v: 1, n: 'Enero' }, { v: 2, n: 'Febrero' }, { v: 3, n: 'Marzo' },
        { v: 4, n: 'Abril' }, { v: 5, n: 'Mayo' }, { v: 6, n: 'Junio' },
        { v: 7, n: 'Julio' }, { v: 8, n: 'Agosto' }, { v: 9, n: 'Septiembre' },
        { v: 10, n: 'Octubre' }, { v: 11, n: 'Noviembre' }, { v: 12, n: 'Diciembre' }
    ];

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col h-screen overflow-hidden">
            <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-[100] shadow-sm">
                <div className="flex items-center space-x-4 sm:space-x-6">
                    <button onClick={() => navigate('/')} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl text-white bg-blue-600 shadow-lg shadow-blue-100">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fichas de Asistencia</h1>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Control Docentes Tiempo Parcial</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full sm:w-auto">
                    <div className="flex items-center bg-slate-100 rounded-2xl p-1">
                        <select
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(Number(e.target.value))}
                            className="bg-transparent border-none text-xs font-black uppercase px-4 py-2 focus:ring-0 cursor-pointer"
                        >
                            {months.map(m => <option key={m.v} value={m.v}>{m.n}</option>)}
                        </select>
                        <div className="w-px h-4 bg-slate-200 mx-1"></div>
                        <input
                            type="number"
                            value={selectedYear}
                            onChange={e => setSelectedYear(Number(e.target.value))}
                            className="bg-transparent border-none text-xs font-black w-20 px-3 py-2 focus:ring-0"
                        />
                    </div>

                    <div className="relative flex-1 sm:flex-none min-w-[160px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar docente..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-2xl text-sm font-bold w-full sm:w-64 focus:ring-2 focus:ring-blue-400 transition-all"
                        />
                    </div>

                    <button
                        onClick={handleDownloadMassive}
                        disabled={readyToDownloadCount === 0 || massiveProgress !== null}
                        className="flex items-center justify-center space-x-2 px-6 py-2.5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-slate-200 w-full sm:w-auto"
                    >
                        {massiveProgress ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                <span>Generando {massiveProgress.done} / {massiveProgress.total}</span>
                            </>
                        ) : (
                            <>
                                <DownloadCloud size={16} />
                                <span>Descarga Masiva ({readyToDownloadCount})</span>
                            </>
                        )}
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-hidden p-8 flex flex-col">
                {/* Info Card - Period Range */}
                <div className="mb-6 bg-white p-4 rounded-3xl border border-blue-50 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                            <Calendar size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Corte de Planilla</p>
                            <p className="text-sm font-bold text-slate-900">
                                {getAttendancePeriodRange(selectedMonth, selectedYear).startDate.toLocaleDateString('es-PE')}
                                <span className="mx-2 text-slate-400">→</span>
                                {getAttendancePeriodRange(selectedMonth, selectedYear).endDate.toLocaleDateString('es-PE')}
                            </p>
                        </div>
                    </div>
                    <div className="flex space-x-8">
                        <div className="text-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Docentes TP Presencial</p>
                            <p className="text-lg font-black text-slate-900">{tpInstructorsWithPresencial.length}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fichas Generadas</p>
                            <p className="text-lg font-black text-green-600">{generatedSheets.size}</p>
                        </div>
                    </div>
                </div>

                {/* Tabla de Seguimiento */}
                <div className="flex-1 bg-white rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                                <tr>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Instructor</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tipo</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Estado Ficha</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Auditoría</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Última Descarga</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {tpInstructorsWithPresencial.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-20 text-center">
                                            <div className="flex flex-col items-center">
                                                <AlertCircle size={48} className="text-slate-200 mb-4" />
                                                <p className="text-slate-400 font-bold">No se encontraron docentes con carga presencial para este periodo.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    tpInstructorsWithPresencial.map(inst => {
                                        const isGenerated = generatedSheets.has(inst.id);
                                        const liveAudit = liveAuditByInstructor.get(inst.id);
                                        return (
                                            <tr key={inst.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center space-x-3">
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500">
                                                            {inst.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-slate-900 leading-none mb-1">{inst.name}</p>
                                                            <div className="flex items-center space-x-2">
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">ID: {inst.id}</p>
                                                                {!inst.hasPresencial && (
                                                                    <span className="text-[8px] font-black text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 uppercase tracking-tighter">
                                                                        Sin Carga Presencial
                                                                    </span>
                                                                )}
                                                                {(!inst.hasPresencial || !liveAudit?.hasData) && (
                                                                    <button
                                                                        onClick={(e) => handleSync(e, inst)}
                                                                        title="Sincronizar carga por Nombre/ID"
                                                                        className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded-full transition-colors ml-1"
                                                                    >
                                                                        <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-center">
                                                    <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-100">
                                                        {inst.type}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-5 text-center">
                                                    {isGenerated ? (
                                                        <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-100">
                                                            <CheckCircle size={10} />
                                                            <span>Generada</span>
                                                        </div>
                                                    ) : (
                                                        <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-slate-100 text-slate-400 rounded-full text-[10px] font-black uppercase tracking-widest">
                                                            <Clock size={10} />
                                                            <span>Pendiente</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-8 py-5 text-center">
                                                    {liveAudit?.isAuditOk ? (
                                                        <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                                                            <ShieldCheck size={10} />
                                                            <span>Óptimo</span>
                                                        </div>
                                                    ) : (liveAudit?.hasData && !liveAudit.isAuditOk) ? (
                                                        <div
                                                            onClick={() => setViewingAudit(inst)}
                                                            className="inline-flex items-center space-x-1.5 px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-rose-100 cursor-pointer hover:bg-rose-100 transition-colors"
                                                        >
                                                            <AlertTriangle size={10} />
                                                            <span>Observado</span>
                                                        </div>
                                                    ) : (
                                                        <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-slate-100 text-slate-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200">
                                                            <Clock size={10} />
                                                            <span>Pendiente</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-8 py-5">
                                                    <p className="text-xs font-bold text-slate-500">
                                                        {isGenerated ? 'Descargado en esta sesión' : '-'}
                                                    </p>
                                                </td>
                                                <td className="px-8 py-5 text-right">
                                                    <button
                                                        onClick={() => handleDownloadIndividual(inst)}
                                                        disabled={!inst.hasPresencial}
                                                        className="inline-flex items-center space-x-2 px-4 py-2 hover:bg-blue-600 hover:text-white text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-blue-100 hover:border-blue-600 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-blue-600 disabled:border-slate-100"
                                                    >
                                                        <Download size={14} />
                                                        <span>Descargar Ficha</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Modal de Detalle de Auditoría */}
            {viewingAudit && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[32px] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-rose-50/30">
                            <div className="flex items-center space-x-4">
                                <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shadow-inner">
                                    <AlertTriangle size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 leading-tight">Observaciones de Auditoría</h3>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{viewingAudit.name}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setViewingAudit(null)}
                                className="w-10 h-10 rounded-xl hover:bg-white flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all shadow-sm active:scale-95"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-8 max-h-[60vh] overflow-y-auto">
                            {(() => {
                                const issues = liveAuditByInstructor.get(viewingAudit.id)?.issues || [];
                                if (issues.length === 0) {
                                    return <p className="text-sm font-bold text-slate-400 text-center py-8 italic">No se encontraron detalles específicos del error.</p>;
                                }
                                return (
                                    <div className="space-y-6">
                                        {issues.map((issue, idx: number) => (
                                            <div key={idx} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 hover:border-rose-100 transition-colors group">
                                                <div className="flex items-center space-x-2 mb-3">
                                                    <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Semana del {issue.week}</p>
                                                </div>
                                                <ul className="space-y-2">
                                                    {issue.reasons.map((reason: string, rIdx: number) => (
                                                        <li key={rIdx} className="flex items-start space-x-3">
                                                            <div className="mt-1.5 w-1 h-1 rounded-full bg-rose-400 shrink-0" />
                                                            <p className="text-xs font-bold text-slate-700 leading-relaxed">{reason}</p>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => setViewingAudit(null)}
                                className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={pendingSync !== null}
                title="Sincronizar carga"
                message={`Se buscarán las clases de ${pendingSync?.name || 'este instructor'} por coincidencia de nombre y se les asignará su ID oficial.`}
                confirmLabel="Sincronizar"
                onCancel={() => setPendingSync(null)}
                onConfirm={() => {
                    const inst = pendingSync;
                    setPendingSync(null);
                    if (inst) syncInstructorIdInSchedules(inst);
                }}
            />

            <ConfirmDialog
                isOpen={pendingMassiveCount !== null}
                title="Descarga masiva"
                message={`Se generarán ${pendingMassiveCount ?? 0} fichas de asistencia (solo las de instructores con auditoría OK) y se descargarán en un archivo ZIP.`}
                confirmLabel="Descargar"
                onCancel={() => setPendingMassiveCount(null)}
                onConfirm={confirmDownloadMassive}
            />
        </div>
    );
};

export default AttendancePage;
