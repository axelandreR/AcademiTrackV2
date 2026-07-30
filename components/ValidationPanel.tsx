import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { ProcessedSchedule, InstitutionalReference } from '../types';
import { Upload, FileWarning, CheckCircle, SearchCode, Database, Activity, AlertTriangle, ArrowRight, X, ChevronDown, Filter, LayoutGrid } from 'lucide-react';
import { parseInstitutionalReport } from '../services/excelParser';
import ConfirmDialog from './ConfirmDialog';

interface ValidationPanelProps {
    onBack: () => void;
}

interface ValidationResult {
    id: string; // ID único para la fila de resultado
    nrc: string;
    courseName: string;
    instructorName: string;
    status: 'ok' | 'discrepancy' | 'missing_in_app' | 'missing_in_sys';
    details: string[]; // Lista de detalles/errores
    appData?: ProcessedSchedule;
    sysData?: InstitutionalReference;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({ onBack }) => {
    const { schedules, institutionalReferences, uploadInstitutionalReference, saveScheduleCloud, instructors } = useData();
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedCareer, setSelectedCareer] = useState<string>('TODAS');
    const [selectedBlock, setSelectedBlock] = useState<string>('TODOS'); // Nuevo filtro Bloque
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'ERROR' | 'OK' | 'MISSING_APP' | 'EXTRA_APP'>('ALL');
    const [selectedValidation, setSelectedValidation] = useState<ValidationResult | null>(null);

    // Lista de placeholders conocidos para detectar "Oportunidad de Actualización"
    const PLACEHOLDER_IDS = ['4CCJP', '4CCDC', 'INST.CIERRE', '0', '1', 'TEMP', 'POR ASIGNAR', 'A0000000'];
    const isPlaceholder = (id: string) => {
        const clean = id.toUpperCase().trim();
        return PLACEHOLDER_IDS.includes(clean) || clean.includes('JP') || clean.includes('AUX') || clean.includes('POR ASIGNAR');
    };

    // 1. Obtener lista de carreras disponibles en la App (para filtro)
    const [showColumnWarning, setShowColumnWarning] = useState<string[]>([]);
    // Confirmación pendiente genérica: las 3 acciones de reparación de este panel
    // (integrar curso, actualizar instructor, sobrescribir programación) la reutilizan
    // en vez de usar el confirm() nativo del navegador.
    const [pendingConfirm, setPendingConfirm] = useState<{
        title: string;
        message: string;
        confirmLabel: string;
        action: () => void | Promise<void>;
    } | null>(null);

    // 1. Obtener lista de carreras y BLOQUES disponibles (Unión App + Sistema)
    const { availableCareers, availableBlocks } = useMemo(() => {
        const careers = new Set(schedules.map(s => s.career).filter(Boolean));
        const blocks = new Set(schedules.map(s => s.block).filter(Boolean));

        // Agregar del sistema y chequear columnas faltantes
        let sysHasCareer = false;
        let sysHasBlock = false;

        institutionalReferences.forEach(ref => {
            if (ref.carrera) { careers.add(ref.carrera); sysHasCareer = true; }
            if (ref.bloque) { blocks.add(ref.bloque); sysHasBlock = true; }
        });

        return {
            availableCareers: ['TODAS', ...Array.from(careers).sort()],
            availableBlocks: ['TODOS', ...Array.from(blocks).sort()]
        };
    }, [schedules, institutionalReferences]);

    // Diagnóstico de Columnas (useEffect separado para evitar loop en render)
    React.useEffect(() => {
        if (institutionalReferences.length > 0) {
            let sysHasCareer = false;
            let sysHasBlock = false;
            institutionalReferences.forEach(ref => {
                if (ref.carrera) sysHasCareer = true;
                if (ref.bloque) sysHasBlock = true;
            });

            const warnings = [];
            if (!sysHasCareer) warnings.push("CARRERA");
            if (!sysHasBlock) warnings.push("BLOQUE");

            setShowColumnWarning(warnings);
        } else {
            setShowColumnWarning([]);
        }
    }, [institutionalReferences]);

    // 2. Lógica de Validación (Core)
    const validationResults = useMemo(() => {
        if (institutionalReferences.length === 0) return [];

        const results: ValidationResult[] = [];
        const sysRefs = institutionalReferences; // Alias
        const appScheds = schedules.filter(s => !s.isAdministrative); // Solo académicos

        // Helper: Normalizar Strings
        const norm = (s: string) => String(s || '').trim().toUpperCase();
        const cleanId = (id: string | number) => String(id || '').trim().toUpperCase().replace(/^A/i, '').replace(/^0+/, '');
        // Helper: Extraer Carrera/Bloque de App si no viene en Sistema
        const getCareer = (sys: InstitutionalReference) => sys.carrera || 'SIN CLASIFICAR';
        const getBlock = (sys: InstitutionalReference) => sys.bloque || 'SIN BLOQUE';

        // Helper: Validar Fechas por SEMANA (Lunes de la semana)
        const getWeekMonday = (d: Date | string) => {
            // Normalización de Semanas (Lunes)
            // FIX: Usar métodos UTC para evitar que diferencias horarias (GMT-5) retornen un día equivocado
            const date = new Date(d);
            const day = date.getUTCDay();
            const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1); // Ajuste al Lunes
            date.setUTCDate(diff);
            return date.toISOString().split('T')[0]; // YYYY-MM-DD del Lunes
        };

        const isTimeMatch = (t1: string, t2: string) => {
            if (!t1 || !t2) return false;
            const toMin = (t: string) => {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + m;
            }
            return Math.abs(toMin(t1) - toMin(t2)) <= 2; // Tolerancia 2 min
        };

        // A. Barrido Sistema -> App (Detectar Faltantes y Discrepancias)
        // Agrupamos refs del sistema por NRC + Día + Hora Inicio para ser unívocos
        sysRefs.forEach(sys => {
            const sysNrc = cleanId(sys.nrc);
            const sysDay = norm(sys.dia);

            // Buscar candidatos en App
            const appMatches = appScheds.filter(app =>
                cleanId(app.nrc) === sysNrc &&
                app.days.includes(sysDay) &&
                isTimeMatch(app.startTime, sys.hora_inicio)
            );

            if (appMatches.length === 0) {
                results.push({
                    id: `mis-sys-${sys.nrc}-${sys.dia}-${sys.hora_inicio}`,
                    nrc: sys.nrc,
                    courseName: sys.curso_nombre,
                    instructorName: sys.instructor_nombre,
                    status: 'missing_in_app',
                    details: [`Programado en Sistema (${sys.dia} ${sys.hora_inicio}) pero NO en App.`],
                    sysData: sys
                });
            } else {
                const sysStartMonday = getWeekMonday(sys.fecha_inicio);
                const sysEndMonday = getWeekMonday(sys.fecha_fin);

                // --- NUEVO ENFOQUE: MATRIZ DE SATISFACCIÓN ---
                const perfectMatch = appMatches.find(cand => {
                    const cStart = getWeekMonday(cand.startDate);
                    const cEnd = getWeekMonday(cand.endDate);
                    const datesOk = (cStart <= sysStartMonday && cEnd >= sysEndMonday);
                    const roomOk = (cleanId(sys.edificio) === cleanId(cand.building) && cleanId(sys.salon) === cleanId(cand.room));
                    const instOk = (cleanId(sys.instructor_id) === cleanId(cand.instructorId));
                    return datesOk && roomOk && instOk;
                });

                if (perfectMatch) {
                    results.push({
                        id: `res-ok-${sys.nrc}-${sys.dia}-${sys.hora_inicio}-${perfectMatch.id}`,
                        nrc: sys.nrc,
                        courseName: sys.curso_nombre,
                        instructorName: sys.instructor_nombre,
                        status: 'ok',
                        details: [],
                        appData: perfectMatch,
                        sysData: sys
                    });
                } else {
                    let bestCandidate = appMatches[0];
                    const contencion = appMatches.find(c => getWeekMonday(c.startDate) <= sysStartMonday && getWeekMonday(c.endDate) >= sysEndMonday);
                    const solapamiento = appMatches.find(c => getWeekMonday(c.startDate) <= sysEndMonday && getWeekMonday(c.endDate) >= sysStartMonday);
                    if (contencion) bestCandidate = contencion;
                    else if (solapamiento) bestCandidate = solapamiento;

                    const d: string[] = [];
                    const dStart = getWeekMonday(bestCandidate.startDate);
                    const dEnd = getWeekMonday(bestCandidate.endDate);
                    if (dStart > sysStartMonday) d.push(`Inicio Tardío: Sistema ${sysStartMonday}, App ${dStart}`);
                    if (dEnd < sysEndMonday) d.push(`Fin Prematuro: Sistema ${sysEndMonday}, App ${dEnd}`);
                    if (cleanId(sys.instructor_id) !== cleanId(bestCandidate.instructorId)) {
                        if (isPlaceholder(bestCandidate.instructorId) && !isPlaceholder(sys.instructor_id)) d.push("ACTUALIZACIÓN: App tiene placeholder.");
                        else d.push(`Instructor: Sistema (${sys.instructor_nombre}) vs App (${bestCandidate.instructor})`);
                    }
                    const sRoom = norm(sys.edificio) + '-' + norm(sys.salon);
                    const aRoom = norm(bestCandidate.building) + '-' + norm(bestCandidate.room);
                    if (sRoom !== aRoom) d.push(`Aula: Sistema (${sRoom}) vs App (${aRoom})`);

                    results.push({
                        id: `res-disc-${sys.nrc}-${sys.dia}-${sys.hora_inicio}-${bestCandidate.id}`,
                        nrc: sys.nrc,
                        courseName: sys.curso_nombre,
                        instructorName: sys.instructor_nombre,
                        status: 'discrepancy',
                        details: d,
                        appData: bestCandidate,
                        sysData: sys
                    });
                }
            }
        });

        // B. Barrido App -> Sistema (Detectar Extras en App no autorizados)
        appScheds.forEach(app => {
            if (!app.nrc || app.nrc === '-' || app.nrc === '0') return; // Ignorar administrativos puros

            app.days.forEach(day => {
                const appNrc = cleanId(app.nrc);
                const appDay = norm(day);

                const existsInSys = sysRefs.some(sys =>
                    cleanId(sys.nrc) === appNrc &&
                    norm(sys.dia) === appDay &&
                    isTimeMatch(sys.hora_inicio, app.startTime)
                );

                if (!existsInSys) {
                    // Verificamos si ya agregamos este error (para no duplicar por bloque)
                    const uniqueId = `extra-app-${app.nrc}-${day}-${app.startTime}`;
                    if (!results.find(r => r.id === uniqueId)) {
                        results.push({
                            id: uniqueId,
                            nrc: app.nrc,
                            courseName: app.courseName,
                            instructorName: app.instructor,
                            status: 'missing_in_sys',
                            details: [`Sesión App (${day} ${app.startTime}) NO existe en Sistema.`],
                            appData: app
                        });
                    }
                }
            });
        });

        return results;
    }, [schedules, institutionalReferences]);


    // 3. Filtrado Visual (Debugged)
    const filteredResults = useMemo(() => {
        return validationResults.filter(r => {
            // Buscador
            const matchesSearch = searchTerm === '' ||
                r.nrc.toUpperCase().includes(searchTerm.toUpperCase()) ||
                (r.courseName && r.courseName.toUpperCase().includes(searchTerm.toUpperCase())) ||
                (r.instructorName && r.instructorName.toUpperCase().includes(searchTerm.toUpperCase()));

            // Carrera
            let matchesCareer = true;
            if (selectedCareer !== 'TODAS') {
                const appC = r.appData?.career ? r.appData.career.toUpperCase().trim() : '';
                const sysC = r.sysData?.carrera ? r.sysData.carrera.toUpperCase().trim() : '';
                const target = selectedCareer.toUpperCase().trim();
                matchesCareer = appC === target || sysC === target;
            }

            // Bloque
            let matchesBlock = true;
            if (selectedBlock !== 'TODOS') {
                const appB = r.appData?.block ? r.appData.block.toUpperCase().trim() : '';
                const sysB = r.sysData?.bloque ? r.sysData.bloque.toUpperCase().trim() : '';
                const target = selectedBlock.toUpperCase().trim();
                matchesBlock = appB === target || sysB === target;
            }

            // Estado (If-Else explícito para evitar switch weirdness)
            let matchesStatus = true;
            if (filterStatus === 'ERROR') {
                matchesStatus = r.status === 'discrepancy';
            } else if (filterStatus === 'OK') {
                matchesStatus = r.status === 'ok';
            } else if (filterStatus === 'MISSING_APP') {
                matchesStatus = r.status === 'missing_in_app';
            } else if (filterStatus === 'EXTRA_APP') {
                matchesStatus = r.status === 'missing_in_sys';
            }
            // else ALL -> true

            return matchesSearch && matchesCareer && matchesBlock && matchesStatus;
        });
    }, [validationResults, searchTerm, selectedCareer, selectedBlock, filterStatus]);

    // Calcula stats basados en la selección de Carrera/Bloque (CONTEXTUALES)
    // Esto ayuda a que el usuario vea "Ok, en esta carrera tengo 5 errores", en vez del global.
    const stats = useMemo(() => {
        // Filtrar solo por contexto (Carrera/Bloque/Search) sin aplicar filtro de estado
        const contextResults = validationResults.filter(r => {
            // Carrera
            let matchesCareer = true;
            if (selectedCareer !== 'TODAS') {
                const appC = r.appData?.career ? r.appData.career.toUpperCase().trim() : '';
                const sysC = r.sysData?.carrera ? r.sysData.carrera.toUpperCase().trim() : '';
                const target = selectedCareer.toUpperCase().trim();
                matchesCareer = appC === target || sysC === target;
            }
            // Bloque
            let matchesBlock = true;
            if (selectedBlock !== 'TODOS') {
                const appB = r.appData?.block ? r.appData.block.toUpperCase().trim() : '';
                const sysB = r.sysData?.bloque ? r.sysData.bloque.toUpperCase().trim() : '';
                const target = selectedBlock.toUpperCase().trim();
                matchesBlock = appB === target || sysB === target;
            }
            return matchesCareer && matchesBlock;
        });

        return {
            total: contextResults.length,
            ok: contextResults.filter(r => r.status === 'ok').length,
            error: contextResults.filter(r => r.status === 'discrepancy').length,
            missingApp: contextResults.filter(r => r.status === 'missing_in_app').length,
            extraApp: contextResults.filter(r => r.status === 'missing_in_sys').length
        };
    }, [validationResults, selectedCareer, selectedBlock]);

    // --- ACCIONES DE REPARACIÓN ---
    const handleIntegrateMissing = (res: ValidationResult) => {
        if (!res.sysData) return;
        setPendingConfirm({
            title: 'Integrar curso',
            message: `Se integrará el curso ${res.nrc} (${res.courseName}) a la programación de la App.`,
            confirmLabel: 'Integrar',
            action: () => doIntegrateMissing(res)
        });
    };

    const doIntegrateMissing = async (res: ValidationResult) => {
        if (!res.sysData) return;
        try {
            const sys = res.sysData;
            // Crear objeto ProcessedSchedule desde sysData
            const newSchedule: ProcessedSchedule = {
                id: `integ-${Date.now()}-${sys.nrc}`,
                courseCode: 'SIN CODIGO',
                courseName: sys.curso_nombre,
                activity: sys.tipo,
                meetingType: 'PRES', // Default
                block: sys.bloque || 'SIN BLOQUE',
                instructor: sys.instructor_nombre,
                instructorId: sys.instructor_id,
                room: sys.salon,
                building: sys.edificio,
                days: [sys.dia], // Ojo: sysData viene desglozado por día, idealmente agruparíamos pero por ahora creamos bloque por día
                startTime: sys.hora_inicio,
                endTime: sys.hora_fin,
                startDate: new Date(sys.fecha_inicio + 'T00:00:00'),
                endDate: new Date(sys.fecha_fin + 'T00:00:00'),
                career: sys.carrera || 'SIN CARRERA',
                nrc: sys.nrc,
                color: 'slate', // Color default
                weeklyHours: 0, // Calcular después
                aforo: 0,
                periodo: '2026-1',
                semestre: '',
                isAdministrative: false
            };

            await saveScheduleCloud(newSchedule);
            alert("Curso integrado exitosamente.");
        } catch (e) {
            alert("Error al integrar curso.");
        }
    };

    const handleUpdateInstructor = (res: ValidationResult) => {
        if (!res.appData || !res.sysData) return;
        setPendingConfirm({
            title: 'Actualizar instructor',
            message: `Se cambiará el instructor de este bloque de "${res.appData.instructor}" a "${res.sysData.instructor_nombre}".`,
            confirmLabel: 'Actualizar',
            action: () => doUpdateInstructor(res)
        });
    };

    const doUpdateInstructor = async (res: ValidationResult) => {
        if (!res.appData || !res.sysData) return;
        const newInstName = res.sysData.instructor_nombre;
        const newInstId = res.sysData.instructor_id;

        try {
            const updated = { ...res.appData, instructor: newInstName, instructorId: newInstId };
            await saveScheduleCloud(updated);
            alert("Instructor actualizado.");
        } catch (e) {
            alert("Error al actualizar instructor.");
        }
    };

    // NUEVO: Función para Sobrescribir Data de App con Data de Sistema (Fechas, Sala, Día)
    const handleApplyDifference = (res: ValidationResult) => {
        if (!res.appData || !res.sysData) return;
        const sys = res.sysData;
        const fInicio = new Date(sys.fecha_inicio);
        const fFin = new Date(sys.fecha_fin);

        if (isNaN(fInicio.getTime()) || isNaN(fFin.getTime())) {
            alert("Error: Las fechas del sistema no son válidas.");
            return;
        }

        setPendingConfirm({
            title: 'Sobrescribir programación',
            message: `Se sobrescribirá la programación de la App con la del Sistema. Sala: ${sys.edificio}-${sys.salon}. Fechas: ${fInicio.toISOString().split('T')[0]} al ${fFin.toISOString().split('T')[0]}. Día: ${sys.dia}.`,
            confirmLabel: 'Sobrescribir',
            action: () => doApplyDifference(res)
        });
    };

    const doApplyDifference = async (res: ValidationResult) => {
        try {
            if (!res.appData || !res.sysData) return;

            const sys = res.sysData;
            const fInicio = new Date(sys.fecha_inicio);
            const fFin = new Date(sys.fecha_fin);

            // Construir objeto actualizado
            const updated = {
                ...res.appData,
                building: sys.edificio,
                room: sys.salon,
                startDate: fInicio,
                endDate: fFin,
                days: [sys.dia] // Forzamos el día del sistema
            };

            await saveScheduleCloud(updated);
            alert("Programación actualizada con éxito. Recarga la validación para verificar.");
            setSelectedValidation(null); // Cerrar modal

        } catch (e: any) {
            console.error("Error en handleApplyDifference:", e);
            alert(`Error al aplicar cambios: ${e.message || e}`);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsProcessing(true);
        try {
            const data = await parseInstitutionalReport(file);
            uploadInstitutionalReference(data);
        } catch (err) {
            alert("Error al procesar el archivo del sistema.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col animate-in fade-in duration-500">
            {/* Header Diferenciado */}
            <header className="bg-slate-900 text-white px-8 py-6 flex items-center justify-between sticky top-0 z-[50] shadow-md">
                <div className="flex items-center space-x-6">
                    <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg transition-colors"><X size={24} /></button>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight flex items-center gap-3">
                            <ShieldCheckIcon />
                            Validación Institucional
                        </h1>
                        <p className="text-xs text-slate-400 font-medium tracking-wide mt-1">COMPARADOR DE PROGRAMACIÓN: APP VS SISTEMA (ERP)</p>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    {institutionalReferences.length > 0 && (
                        <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
                            <button onClick={() => setFilterStatus('ALL')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${filterStatus === 'ALL' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}>Todos</button>
                            <button onClick={() => setFilterStatus('OK')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${filterStatus === 'OK' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>OK ({stats.ok})</button>
                            <button onClick={() => setFilterStatus('ERROR')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${filterStatus === 'ERROR' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'}`}>Dif ({stats.error})</button>
                            <button onClick={() => setFilterStatus('MISSING_APP')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${filterStatus === 'MISSING_APP' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'}`}>Falta App ({stats.missingApp})</button>
                            <button onClick={() => setFilterStatus('EXTRA_APP')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${filterStatus === 'EXTRA_APP' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'}`}>Extra App ({stats.extraApp})</button>
                        </div>
                    )}

                    <div className="relative group">
                        <button className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg shadow-indigo-900/50">
                            <Upload size={16} />
                            <span>{institutionalReferences.length > 0 ? 'Actualizar Data Sistema' : 'Cargar Data Sistema'}</span>
                        </button>
                        <input type="file" onChange={handleFileUpload} accept=".xlsx,.xls" className="absolute inset-0 opacity-0 cursor-pointer" />
                    </div>
                </div>
            </header>

            {institutionalReferences.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                    <div className="w-32 h-32 bg-slate-200 rounded-full flex items-center justify-center text-slate-400 mb-6">
                        <Database size={64} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 mb-2">Esperando Data del Sistema</h2>
                    <p className="max-w-md text-slate-500 mb-8">Para iniciar la validación, sube el reporte Excel exportado del sistema institucional (Banner/ERP). El sistema comparará automáticamente usando el estándar de "Semana Calendario".</p>
                </div>
            ) : (
                <div className="flex flex-1 overflow-hidden relative">
                    {/* Alerta de Columnas Faltantes */}
                    {showColumnWarning.length > 0 && (
                        <div className="absolute top-0 left-0 right-0 bg-amber-100 border-b border-amber-300 text-amber-900 px-6 py-3 z-[60] flex items-center justify-between shadow-md">
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="text-amber-600" />
                                <div>
                                    <p className="font-bold text-sm">Advertencia de Estructura de Archivo</p>
                                    <p className="text-xs">
                                        No se detectaron las columnas: <strong>{showColumnWarning.join(', ')}</strong> en tu Excel.
                                        Los filtros pueden no funcionar correctamente. Asegúrate de que los encabezados sean exactos (ej: 'BLOQUE', 'CARRERA').
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setShowColumnWarning([])} className="p-1 hover:bg-amber-200 rounded"><X size={16} /></button>
                        </div>
                    )}
                    {/* Sidebar Filtros */}
                    <aside className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col gap-6 overflow-y-auto">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Filtrar por Carrera</label>
                            <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                                {availableCareers.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setSelectedCareer(c)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all truncate ${selectedCareer === c ? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-500' : 'text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Filtrar por Bloque</label>
                            <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                                {availableBlocks.map(b => (
                                    <button
                                        key={b}
                                        onClick={() => setSelectedBlock(b)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all truncate ${selectedBlock === b ? 'bg-purple-50 text-purple-700 border-l-4 border-purple-500' : 'text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        {b}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </aside>

                    {/* Contenido Principal */}
                    <main className="flex-1 p-8 overflow-y-auto bg-slate-100/50">
                        {/* Header de Resultados y Buscador */}
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                                Resultados de Validación
                                {filteredResults.length > 0 && <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px]">{filteredResults.length} registros</span>}
                            </h3>
                            <div className="flex items-center gap-2">
                                {(selectedCareer !== 'TODAS' || selectedBlock !== 'TODOS' || searchTerm !== '' || filterStatus !== 'ALL') && (
                                    <button
                                        onClick={() => {
                                            setSelectedCareer('TODAS');
                                            setSelectedBlock('TODOS');
                                            setSearchTerm('');
                                            setFilterStatus('ALL');
                                        }}
                                        className="text-xs font-bold text-slate-400 hover:text-rose-500 mr-2 transition-colors"
                                    >
                                        Limpiar Filtros
                                    </button>
                                )}
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Buscar NRC, Curso o Docente..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10 pr-4 py-2 rounded-xl border-none shadow-sm text-sm font-medium w-64 focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <SearchCode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                </div>
                            </div>
                        </div>

                        {/* LISTA DE RESULTADOS O MENSAJE VACÍO */}
                        {(selectedCareer === 'TODAS' && selectedBlock === 'TODOS' && searchTerm === '' && filterStatus === 'ALL') ? (
                            <div className="flex flex-col items-center justify-center p-12 text-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                                <Filter size={48} className="text-slate-300 mb-4" />
                                <h4 className="text-lg font-bold text-slate-600">Comienza a Filtrar</h4>
                                <p className="text-slate-400 text-sm max-w-xs mx-auto mt-2">
                                    Selecciona una carrera, un bloque o usa el buscador para ver los resultados de la validación.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredResults.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400 font-medium">
                                        No se encontraron resultados con los filtros actuales.
                                    </div>
                                ) : (
                                    filteredResults.slice(0, 100).map((res, idx) => (
                                        <div
                                            key={`${res.id}-${idx}`} // Clave compuesta para forzar re-render si IDs se repiten
                                            onClick={() => setSelectedValidation(res)}
                                            className={`group bg-white rounded-2xl p-5 shadow-sm border border-transparent hover:shadow-md transition-all cursor-pointer relative overflow-hidden`}
                                        >
                                            {/* Borde Izquierdo Colorizado (Estilo Inline para asegurar prioridad) */}
                                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${res.status === 'ok' ? 'bg-emerald-500' :
                                                res.status === 'discrepancy' ? 'bg-amber-500' :
                                                    res.status === 'missing_in_app' ? 'bg-rose-500' : 'bg-blue-500'
                                                }`} />

                                            <div className="flex items-start justify-between pl-3">
                                                <div className="flex items-start gap-4">
                                                    <div className={`mt-1 p-2 rounded-lg ${res.status === 'ok' ? 'bg-emerald-50 text-emerald-600' :
                                                        res.status === 'discrepancy' ? 'bg-amber-50 text-amber-600' :
                                                            res.status === 'missing_in_app' ? 'bg-rose-50 text-rose-600' :
                                                                'bg-blue-50 text-blue-600'
                                                        }`}>
                                                        {res.status === 'ok' ? <CheckCircle size={20} /> :
                                                            res.status === 'discrepancy' ? <AlertTriangle size={20} /> :
                                                                res.status === 'missing_in_app' ? <Database size={20} /> :
                                                                    <Activity size={20} />}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-slate-800 text-lg">{res.nrc}</span>
                                                            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{res.courseName}</span>
                                                        </div>
                                                        <p className="text-xs font-semibold text-slate-500 mt-1">{res.instructorName || 'Sin Instructor'}</p>

                                                        {/* Meta Info Rápida */}
                                                        <div className="flex items-center gap-2 mt-2">
                                                            {(res.appData?.days || res.sysData?.dia) && (
                                                                <span className="text-[9px] font-black bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                                                    {res.appData?.days ? res.appData.days.join(', ') : res.sysData?.dia}
                                                                </span>
                                                            )}
                                                            {(res.appData?.block || res.sysData?.bloque) && (
                                                                <span className="text-[9px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                                                                    {res.appData?.block || res.sysData?.bloque}
                                                                </span>
                                                            )}
                                                            {(res.appData?.career || res.sysData?.carrera) && (
                                                                <span className="text-[9px] font-black bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded truncate max-w-[150px]">
                                                                    {res.appData?.career || res.sysData?.carrera}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Detalles breves */}
                                                        <div className="mt-3 space-y-1">
                                                            {res.status === 'ok' && <p className="text-[11px] font-bold text-emerald-600">Validación Exitosa (Coincidencia Semanal)</p>}
                                                            {res.status !== 'ok' && res.details.slice(0, 2).map((err, i) => (
                                                                <p key={i} className="text-[11px] font-medium text-rose-600 flex items-center gap-1.5">
                                                                    <span className="w-1 h-1 rounded-full bg-rose-500" />
                                                                    {err}
                                                                </p>
                                                            ))}
                                                            {res.details.length > 2 && <p className="text-[10px] text-slate-400 pl-2">+{res.details.length - 2} observaciones más...</p>}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100">
                                                        <ArrowRight size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                                {filteredResults.length > 100 && (
                                    <div className="text-center py-4 text-slate-400 text-xs font-bold uppercase tracking-widest">
                                        Mostrando primeros 100 de {filteredResults.length} resultados... usa los filtros para ver más.
                                    </div>
                                )}
                            </div>
                        )}
                    </main>
                </div>
            )}

            {/* Modal Detalle */}
            {selectedValidation && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h3 className="font-bold text-slate-800">Detalle de Validación</h3>
                            <button onClick={() => setSelectedValidation(null)} className="p-2 hover:bg-slate-200 rounded-full"><X size={20} /></button>
                        </div>

                        <div className="p-8 overflow-y-auto">
                            <div className="flex items-center justify-center mb-8">
                                <div className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${selectedValidation.status === 'ok' ? 'bg-emerald-100 text-emerald-700' :
                                    'bg-rose-100 text-rose-700'
                                    }`}>
                                    {selectedValidation.status === 'ok' ? 'VALIDADO CORRECTAMENTE' : 'NO PASÓ VALIDACIÓN'}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8 mb-8">
                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Dato Aplicación</p>
                                    {selectedValidation.appData ? (
                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs space-y-1">
                                            <p><strong>NRC:</strong> {selectedValidation.appData.nrc}</p>
                                            <p><strong>Inicio:</strong> {selectedValidation.appData.startDate.toISOString().split('T')[0]}</p>
                                            <p><strong>Fin:</strong> {selectedValidation.appData.endDate.toISOString().split('T')[0]}</p>
                                            <p><strong>Aula:</strong> {selectedValidation.appData.building}-{selectedValidation.appData.room}</p>
                                            <p><strong>Día:</strong> {selectedValidation.appData.days.join(', ')}</p>
                                        </div>
                                    ) : <p className="text-xs text-slate-400">Datos no disponibles</p>}
                                </div>
                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Dato Sistema</p>
                                    {selectedValidation.sysData ? (
                                        <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 text-xs space-y-1">
                                            <p><strong>NRC:</strong> {selectedValidation.sysData.nrc}</p>
                                            <p><strong>Inicio:</strong> {new Date(selectedValidation.sysData.fecha_inicio).toISOString().split('T')[0]}</p>
                                            <p><strong>Fin:</strong> {new Date(selectedValidation.sysData.fecha_fin).toISOString().split('T')[0]}</p>
                                            <p><strong>Aula:</strong> {selectedValidation.sysData.edificio}-{selectedValidation.sysData.salon}</p>
                                            <p><strong>Día:</strong> {selectedValidation.sysData.dia}</p>
                                        </div>
                                    ) : <p className="text-xs text-slate-400">Datos no disponibles</p>}
                                </div>
                            </div>

                            {selectedValidation.status === 'discrepancy' && selectedValidation.sysData && (
                                <div className="mb-8 flex justify-end">
                                    <button
                                        onClick={() => handleApplyDifference(selectedValidation)}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-6 rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
                                    >
                                        <Upload size={16} />
                                        Sobrescribir con Data del Sistema
                                    </button>
                                </div>
                            )}

                            <div className="space-y-2">
                                <h4 className="font-bold text-slate-900 text-sm">Bitácora de Coincidencias</h4>
                                {selectedValidation.details.map((d, i) => (
                                    <div key={i} className="flex gap-3 p-3 bg-slate-50 rounded-xl text-xs font-medium text-slate-700">
                                        <div className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedValidation.status === 'ok' ? 'bg-emerald-400' : 'bg-rose-400'
                                            }`} />
                                        {d}
                                    </div>
                                ))}
                            </div>

                            {/* Acciones de Reparación */}
                            {selectedValidation.status === 'missing_in_app' && (
                                <div className="mt-6 pt-6 border-t border-slate-100">
                                    <button
                                        onClick={() => handleIntegrateMissing(selectedValidation)}
                                        className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
                                    >
                                        <Database size={18} />
                                        <span>Integrar Curso a la App</span>
                                    </button>
                                </div>
                            )}

                            {selectedValidation.status === 'discrepancy' && selectedValidation.details.some(d => d.includes('ACTUALIZACIÓN')) && (
                                <div className="mt-6 pt-6 border-t border-slate-100">
                                    <button
                                        onClick={() => handleUpdateInstructor(selectedValidation)}
                                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                                    >
                                        <Activity size={18} />
                                        <span>Confirmar Actualización de Instructor</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={pendingConfirm !== null}
                title={pendingConfirm?.title || ''}
                message={pendingConfirm?.message || ''}
                confirmLabel={pendingConfirm?.confirmLabel}
                onCancel={() => setPendingConfirm(null)}
                onConfirm={() => {
                    const action = pendingConfirm?.action;
                    setPendingConfirm(null);
                    action?.();
                }}
            />
        </div>
    );
};

const ShieldCheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></svg>
);

export default ValidationPanel;
