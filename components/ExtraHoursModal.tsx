import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Clock, Save, Info, Download, Plus, Copy, Trash2, CheckCircle2, AlertTriangle, ShieldCheck, History } from 'lucide-react';
import { ExtraHoursConfig, ExtraHoursSegment, ExtraHoursShift, ProcessedSchedule, HolidayData, Instructor, Scenario } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { generateHESummaryExcel } from '../services/excelExporter';
import { createEmptySegment, calculateWeeklyExtraBreakdown, normalizeExtraHoursConfig } from '../services/extraHoursCalculations';
import { findInstructorScenarios } from '../services/scenarioLookup';

export interface HEExemptionRange { start: string; end: string | null }

interface ExtraHoursModalProps {
    isOpen: boolean;
    onClose: () => void;
    config: ExtraHoursConfig | null;
    onSave: (config: ExtraHoursConfig) => void;
    holidays?: HolidayData[];
    instructorName?: string;
    instructorSchedules?: ProcessedSchedule[];
    // Cuando se pasa `instructor` + `onSaveExemption`, el modal agrega arriba de los tramos
    // una sección para activar/editar/quitar la exención de auditoría por rango de fechas
    // (ver Instructor.hasExtraHoursAssigned/Start/End) — un solo control para configurar
    // tanto los tramos detallados de HE como la exención general, sin depender de una
    // Simulación activa (ver components/HEAssignedControl.tsx). Si no se pasan, el modal
    // se comporta exactamente igual que antes (uso actual desde SimulationBar.tsx).
    instructor?: Instructor;
    onSaveExemption?: (range: HEExemptionRange | null) => Promise<void>;
}

const calculateHours = (start?: string, end?: string) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    return diff > 0 ? diff / 60 : 0;
};

const fmtDateShort = (d: string) => {
    if (!d) return null;
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
};

const ExtraHoursModal: React.FC<ExtraHoursModalProps> = ({ isOpen, onClose, config, onSave, holidays = [], instructorName, instructorSchedules = [], instructor, onSaveExemption }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [segments, setSegments] = useState<ExtraHoursSegment[]>([]);
    const [activeSegmentId, setActiveSegmentId] = useState<string>('');

    const showExemptionSection = !!instructor && !!onSaveExemption;
    const [exemptionEnabled, setExemptionEnabled] = useState(false);
    const [exemptionStart, setExemptionStart] = useState('');
    const [exemptionEnd, setExemptionEnd] = useState('');
    const [exemptionNoEnd, setExemptionNoEnd] = useState(false);

    // Simulaciones guardadas (tabla `scenarios`) que pertenecen a este instructor — ver
    // simulationConfig.instructorKey / metadata.instructorName en DataContext.tsx
    // (saveScenario/applySimulation). Se buscan recién cuando el usuario activa la
    // Exención de Auditoría por primera vez en esta apertura del modal (no antes, para no
    // hacer una consulta de más si solo va a configurar tramos a mano) — permite importar
    // los tramos día/turno de una simulación existente en vez de rehacerlos.
    const [scenarioOptions, setScenarioOptions] = useState<Scenario[] | null>(null);
    const [isLoadingScenarios, setIsLoadingScenarios] = useState(false);
    const [showScenarioPicker, setShowScenarioPicker] = useState(false);
    const [importedFromScenario, setImportedFromScenario] = useState<Scenario | null>(null);

    useEffect(() => {
        if (isOpen) {
            const initial = config && config.segments.length > 0 ? config.segments : [createEmptySegment()];
            setSegments(initial);
            setActiveSegmentId(initial[0].id);

            const isExemptionActive = instructor?.hasExtraHoursAssigned === true;
            setExemptionEnabled(isExemptionActive);
            setExemptionStart(instructor?.hasExtraHoursAssignedStart || '');
            setExemptionEnd(instructor?.hasExtraHoursAssignedEnd || '');
            setExemptionNoEnd(isExemptionActive && !instructor?.hasExtraHoursAssignedEnd);

            setScenarioOptions(null);
            setIsLoadingScenarios(false);
            setShowScenarioPicker(false);
            setImportedFromScenario(null);
        }
    }, [config, isOpen, instructor]);

    const handleExemptionToggle = async (checked: boolean) => {
        setExemptionEnabled(checked);
        if (!checked || !showExemptionSection || !instructor || scenarioOptions !== null) return;
        setIsLoadingScenarios(true);
        try {
            // Los "Respaldo Auto" (ver applySimulation en DataContext.tsx) nunca traen
            // extraHoursConfig (se guardan con null a propósito) — no sirven como fuente
            // para importar tramos, así que se excluyen de este picker.
            const matches = await findInstructorScenarios(instructor, { excludeAutoBackup: true });
            setScenarioOptions(matches);
            if (matches.length > 0) setShowScenarioPicker(true);
        } catch (e) {
            console.error('Error buscando simulaciones del instructor:', e);
            setScenarioOptions([]);
        } finally {
            setIsLoadingScenarios(false);
        }
    };

    const handleImportScenario = (scenario: Scenario) => {
        const normalized = normalizeExtraHoursConfig(scenario.data?.extraHoursConfig);
        if (!normalized || normalized.segments.length === 0) {
            // Simulación guardada sin tramos de HE configurados (ej. se creó solo para
            // probar carga académica) — no hay nada que importar de ahí.
            setScenarioOptions(prev => prev ? prev.filter(s => s.id !== scenario.id) : prev);
            return;
        }
        setSegments(normalized.segments);
        setActiveSegmentId(normalized.segments[0].id);
        setImportedFromScenario(scenario);
        setShowScenarioPicker(false);
    };

    const canSaveExemption = !exemptionEnabled || (exemptionStart.length > 0 && (exemptionNoEnd || !exemptionEnd || exemptionEnd >= exemptionStart));

    // Cálculo en vivo con los tramos tal como están editados (sin guardar todavía), para
    // que el usuario vea de inmediato si lo que queda como carga regular sigue sumando 46h.
    // Declarado antes del `if (!isOpen) return null` para no romper el orden de Hooks.
    const weeklyBreakdown = useMemo(() => {
        if (instructorSchedules.length === 0) return [];
        return calculateWeeklyExtraBreakdown(instructorSchedules, { segments }, holidays)
            .filter(w => w.totalHours > 0.01);
    }, [instructorSchedules, segments, holidays]);

    if (!isOpen) return null;

    const activeSegment = segments.find(s => s.id === activeSegmentId) || segments[0];

    const updateActiveSegment = (patch: Partial<ExtraHoursSegment>) => {
        setSegments(prev => prev.map(s => s.id === activeSegmentId ? { ...s, ...patch } : s));
    };

    const handleAddSegment = () => {
        const fresh = createEmptySegment();
        setSegments(prev => [...prev, fresh]);
        setActiveSegmentId(fresh.id);
    };

    const handleDuplicateSegment = (segment: ExtraHoursSegment) => {
        const copy: ExtraHoursSegment = { ...createEmptySegment(), repeatWeekly: segment.repeatWeekly, shifts: JSON.parse(JSON.stringify(segment.shifts)) };
        setSegments(prev => [...prev, copy]);
        setActiveSegmentId(copy.id);
    };

    const handleDeleteSegment = (id: string) => {
        setSegments(prev => {
            const next = prev.filter(s => s.id !== id);
            if (id === activeSegmentId) setActiveSegmentId(next[0]?.id || '');
            return next;
        });
    };

    const handleShiftChange = (dayKey: string, type: 'morning' | 'afternoon', field: 'start' | 'end', value: string) => {
        if (!activeSegment) return;
        const dayShifts = activeSegment.shifts[dayKey] || {};
        const shift = dayShifts[type] || { start: '', end: '' };
        updateActiveSegment({
            shifts: {
                ...activeSegment.shifts,
                [dayKey]: { ...dayShifts, [type]: { ...shift, [field]: value } }
            }
        });
    };

    const getDayTotal = (segment: ExtraHoursSegment, dayKey: string) => {
        const dayShifts = segment.shifts[dayKey];
        if (!dayShifts) return 0;
        return calculateHours(dayShifts.morning?.start, dayShifts.morning?.end) + calculateHours(dayShifts.afternoon?.start, dayShifts.afternoon?.end);
    };

    const segmentTotal = (segment: ExtraHoursSegment) => DAYS_OF_WEEK.reduce((sum, day) => sum + getDayTotal(segment, day.key), 0);

    const handleExportReport = async () => {
        setIsExporting(true);
        try {
            const blob = await generateHESummaryExcel({ segments }, holidays, instructorName);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Reporte_HE_${instructorName?.replace(/\s+/g, '_') || 'simulacion'}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            alert("Error al generar reporte: " + e);
        } finally {
            setIsExporting(false);
        }
    };

    const handleFormSave = async () => {
        if (!canSaveExemption || isSaving) return;
        setIsSaving(true);
        try {
            onSave({ segments });
            if (showExemptionSection) {
                await onSaveExemption!(exemptionEnabled ? { start: exemptionStart, end: exemptionNoEnd ? null : (exemptionEnd || null) } : null);
            }
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    const grandTotal = segments.reduce((sum, s) => sum + segmentTotal(s), 0);

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[95vh]">
                {/* Header */}
                <div className="bg-slate-900 px-8 py-5 flex items-center justify-between shrink-0">
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-amber-500 rounded-2xl text-white shadow-lg shadow-amber-500/20">
                            <Clock size={28} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tight">Horas Extra{instructorName ? ` — ${instructorName}` : ''}</h2>
                            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">{showExemptionSection ? 'Exención de auditoría y tramos detallados' : 'Configuración para el Modo de Prueba'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 lg:p-8 custom-scrollbar bg-white">
                    {/* Exención de auditoría por rango de fechas (ver Instructor.
                        hasExtraHoursAssigned/Start/End) — solo cuando el modal se abre desde
                        Visualización/Edición con un instructor real (no en Simulación). Dentro
                        del rango, el motor de auditoría no marca discrepancia ni exceso de
                        jornada diaria para este instructor; fuera del rango sigue aplicando
                        normal. Es independiente de los tramos de abajo: puede haber exención
                        sin tramos, tramos sin exención, o ambos. */}
                    {showExemptionSection && (
                        <div className="mb-8 border-2 border-amber-100 bg-amber-50/40 rounded-[1.75rem] p-5 lg:p-6">
                            <label className="flex items-center space-x-3 cursor-pointer group w-full mb-4">
                                <input
                                    type="checkbox"
                                    checked={exemptionEnabled}
                                    onChange={(e) => handleExemptionToggle(e.target.checked)}
                                    className="w-5 h-5 rounded-lg border-2 border-slate-300 text-amber-500 focus:ring-amber-500 transition-all cursor-pointer"
                                />
                                <ShieldCheck size={18} className="text-amber-600 shrink-0" />
                                <span className="text-sm font-black text-slate-800 uppercase tracking-tight">Exención de Auditoría (Horas Extra Asignadas)</span>
                            </label>
                            <p className="text-xs text-slate-500 font-medium leading-relaxed mb-4 ml-8">
                                Dentro del rango, no se marca déficit/exceso semanal ni exceso de jornada diaria para este instructor. Fuera del rango se sigue auditando normal. Los choques de horario/aula no se ven afectados.
                            </p>
                            {exemptionEnabled && (
                                <div className="ml-8 space-y-3">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Inicio</label>
                                            <input
                                                type="date"
                                                value={exemptionStart}
                                                onChange={(e) => setExemptionStart(e.target.value)}
                                                className="w-full px-4 py-2 bg-white border-2 border-slate-100 rounded-xl focus:border-amber-500 focus:ring-0 transition-all font-bold text-slate-800 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Fin</label>
                                            <input
                                                type="date"
                                                value={exemptionEnd}
                                                disabled={exemptionNoEnd}
                                                min={exemptionStart || undefined}
                                                onChange={(e) => setExemptionEnd(e.target.value)}
                                                className="w-full px-4 py-2 bg-white border-2 border-slate-100 rounded-xl focus:border-amber-500 focus:ring-0 transition-all font-bold text-slate-800 text-sm disabled:opacity-40"
                                            />
                                        </div>
                                    </div>
                                    <label className="flex items-center space-x-3 cursor-pointer group bg-white p-2.5 px-4 rounded-xl border-2 border-slate-100 hover:border-amber-200 transition-all w-full">
                                        <input
                                            type="checkbox"
                                            checked={exemptionNoEnd}
                                            onChange={(e) => { setExemptionNoEnd(e.target.checked); if (e.target.checked) setExemptionEnd(''); }}
                                            className="w-4 h-4 rounded-md border-2 border-slate-300 text-amber-500 focus:ring-amber-500 transition-all cursor-pointer"
                                        />
                                        <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-colors uppercase tracking-tight">Sin fecha de fin (indefinido)</span>
                                    </label>
                                    {!canSaveExemption && (
                                        <p className="text-[11px] font-bold text-rose-500 ml-1">Falta la Fecha Inicio, o la Fecha Fin es anterior a la Fecha Inicio.</p>
                                    )}

                                    {/* Importar tramos desde una simulación guardada de este mismo
                                        instructor (ver scenarios.data.simulationConfig.instructorKey /
                                        metadata.instructorName) — evita rehacer a mano los tramos que
                                        ya se armaron en "Modo de Prueba". Solo se busca al activar la
                                        exención (ver handleExemptionToggle), no al abrir el modal. */}
                                    {isLoadingScenarios && (
                                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 ml-1">
                                            <div className="animate-spin h-3 w-3 border-2 border-slate-300 border-t-transparent rounded-full" />
                                            <span>Buscando simulaciones guardadas de este instructor…</span>
                                        </div>
                                    )}

                                    {importedFromScenario && !showScenarioPicker && (
                                        <div className="flex items-center justify-between gap-2 bg-emerald-50 border-2 border-emerald-100 rounded-xl px-4 py-2.5">
                                            <span className="text-[11px] font-bold text-emerald-700">
                                                Tramos importados desde "{importedFromScenario.name}" ({new Date(importedFromScenario.created_at).toLocaleDateString('es-PE')})
                                            </span>
                                            {scenarioOptions && scenarioOptions.length > 1 && (
                                                <button type="button" onClick={() => setShowScenarioPicker(true)} className="text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:text-emerald-900 shrink-0">Cambiar</button>
                                            )}
                                        </div>
                                    )}

                                    {!isLoadingScenarios && showScenarioPicker && scenarioOptions && scenarioOptions.length > 0 && (
                                        <div className="border-2 border-indigo-100 bg-indigo-50/40 rounded-2xl p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2 text-[11px] font-black text-indigo-700 uppercase tracking-widest">
                                                    <History size={14} />
                                                    <span>Simulaciones guardadas de este instructor ({scenarioOptions.length})</span>
                                                </div>
                                                <button type="button" onClick={() => setShowScenarioPicker(false)} className="p-1 text-slate-400 hover:text-slate-600">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                                {scenarioOptions.map(scenario => (
                                                    <button
                                                        type="button"
                                                        key={scenario.id}
                                                        onClick={() => handleImportScenario(scenario)}
                                                        className="w-full flex items-center justify-between gap-3 bg-white border-2 border-slate-100 hover:border-indigo-300 rounded-xl px-3 py-2 text-left transition-all"
                                                    >
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex items-center gap-1.5">
                                                                {scenario.data?.metadata?.isAutoBackup && <ShieldCheck size={12} className="text-amber-500 shrink-0" />}
                                                                <span className="text-xs font-bold text-slate-700 truncate">{scenario.name}</span>
                                                            </span>
                                                            <span className="text-[10px] font-semibold text-slate-400">{new Date(scenario.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                        </span>
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 shrink-0">Importar</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {showExemptionSection && (
                        <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Tramos Detallados (opcional — resta horas puntuales de la Meta/46h)</h3>
                    )}

                    {/* Tabs de tramos */}
                    <div className="flex items-center gap-2 mb-6 flex-wrap">
                        {segments.map((seg, idx) => {
                            const isActive = seg.id === activeSegmentId;
                            const range = seg.startDate && seg.endDate ? `${fmtDateShort(seg.startDate)} - ${fmtDateShort(seg.endDate)}` : 'Sin fechas';
                            return (
                                <button
                                    key={seg.id}
                                    onClick={() => setActiveSegmentId(seg.id)}
                                    className={`group flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-wide transition-all border-2 ${isActive ? 'bg-amber-500 border-amber-500 text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-amber-200'}`}
                                >
                                    <span>Tramo {idx + 1}</span>
                                    <span className={`text-[9px] font-semibold normal-case ${isActive ? 'text-amber-50' : 'text-slate-400'}`}>{range}</span>
                                    {segments.length > 1 && (
                                        <span
                                            role="button"
                                            onClick={(e) => { e.stopPropagation(); handleDeleteSegment(seg.id); }}
                                            className={`ml-1 p-0.5 rounded-full ${isActive ? 'hover:bg-white/20' : 'hover:bg-slate-200'}`}
                                        >
                                            <X size={12} />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                        <button
                            onClick={handleAddSegment}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wide border-2 border-dashed border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-600 transition-all"
                            title="Agregar un nuevo tramo con su propio rango de fechas y horario"
                        >
                            <Plus size={14} />
                            <span>Agregar Tramo</span>
                        </button>
                    </div>

                    {activeSegment && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Inicio</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <input
                                            type="date"
                                            value={activeSegment.startDate}
                                            onChange={(e) => updateActiveSegment({ startDate: e.target.value })}
                                            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-amber-500 focus:ring-0 transition-all font-bold text-slate-800"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Fin</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <input
                                            type="date"
                                            value={activeSegment.endDate}
                                            onChange={(e) => updateActiveSegment({ endDate: e.target.value })}
                                            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-amber-500 focus:ring-0 transition-all font-bold text-slate-800"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-end pb-0.5">
                                    <label className="flex items-center space-x-3 cursor-pointer group bg-slate-50 p-2.5 px-5 rounded-xl border-2 border-slate-100 hover:border-amber-200 transition-all w-full">
                                        <input
                                            type="checkbox"
                                            checked={activeSegment.repeatWeekly}
                                            onChange={(e) => updateActiveSegment({ repeatWeekly: e.target.checked })}
                                            className="w-5 h-5 rounded-lg border-2 border-slate-300 text-amber-500 focus:ring-amber-500 transition-all cursor-pointer"
                                        />
                                        <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors uppercase tracking-tight">Repetir semanalmente</span>
                                    </label>
                                </div>
                                <div className="flex items-end pb-0.5">
                                    <button
                                        onClick={() => handleDuplicateSegment(activeSegment)}
                                        className="flex items-center justify-center space-x-2 w-full py-2.5 px-4 bg-slate-50 border-2 border-slate-100 hover:border-amber-200 rounded-xl font-bold text-[11px] uppercase tracking-wide text-slate-600 hover:text-amber-700 transition-all"
                                        title="Crea un nuevo tramo con el mismo horario, para ajustar solo las fechas"
                                    >
                                        <Copy size={14} />
                                        <span>Duplicar Tramo</span>
                                    </button>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-[2rem] p-1 border-2 border-slate-100 overflow-hidden shadow-inner mb-6">
                                <table className="w-full border-separate border-spacing-1">
                                    <thead>
                                        <tr>
                                            <th className="bg-slate-200/50 p-3 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest w-40">TURNO</th>
                                            {DAYS_OF_WEEK.map(day => (
                                                <th key={day.key} className="bg-slate-900 p-3 rounded-xl text-[10px] font-black text-white uppercase tracking-widest min-w-[90px]">
                                                    {day.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* MAÑANA */}
                                        <tr className="bg-amber-50/50">
                                            <td className="p-2 rounded-tl-xl font-black text-amber-700 text-[10px] uppercase tracking-widest text-center">Mañana</td>
                                            {DAYS_OF_WEEK.map(day => (
                                                <td key={`morning-${day.key}`} className="bg-white p-1.5 rounded-xl border border-slate-100">
                                                    <div className="space-y-1">
                                                        <input
                                                            type="time"
                                                            value={activeSegment.shifts[day.key]?.morning?.start || ''}
                                                            onChange={(e) => handleShiftChange(day.key, 'morning', 'start', e.target.value)}
                                                            className="w-full bg-slate-50 border-none rounded-lg text-xs font-bold py-1 focus:ring-1 focus:ring-amber-500 text-slate-800"
                                                        />
                                                        <input
                                                            type="time"
                                                            value={activeSegment.shifts[day.key]?.morning?.end || ''}
                                                            onChange={(e) => handleShiftChange(day.key, 'morning', 'end', e.target.value)}
                                                            className="w-full bg-slate-50 border-none rounded-lg text-xs font-bold py-1 focus:ring-1 focus:ring-amber-500 text-slate-800"
                                                        />
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                        <tr className="bg-amber-50/50">
                                            <td className="pb-2 px-2 rounded-bl-xl font-bold text-[8px] text-amber-700/70 text-right uppercase pr-4 tracking-tight">Subtotal</td>
                                            {DAYS_OF_WEEK.map(day => {
                                                const h = calculateHours(activeSegment.shifts[day.key]?.morning?.start, activeSegment.shifts[day.key]?.morning?.end);
                                                return (
                                                    <td key={`h-m-${day.key}`} className={`text-center font-black text-[11px] pb-1.5 ${h > 0 ? 'text-amber-700' : 'text-slate-300'}`}>
                                                        {h > 0 ? h.toFixed(2) : '—'}
                                                    </td>
                                                );
                                            })}
                                        </tr>

                                        <tr><td colSpan={8} className="h-1.5" /></tr>

                                        {/* TARDE */}
                                        <tr className="bg-slate-100/60">
                                            <td className="p-2 rounded-tl-xl font-black text-slate-500 text-[10px] uppercase tracking-widest text-center">Tarde</td>
                                            {DAYS_OF_WEEK.map(day => (
                                                <td key={`afternoon-${day.key}`} className="bg-white p-1.5 rounded-xl border border-slate-100">
                                                    <div className="space-y-1">
                                                        <input
                                                            type="time"
                                                            value={activeSegment.shifts[day.key]?.afternoon?.start || ''}
                                                            onChange={(e) => handleShiftChange(day.key, 'afternoon', 'start', e.target.value)}
                                                            className="w-full bg-slate-50 border-none rounded-lg text-xs font-bold py-1 focus:ring-1 focus:ring-amber-500 text-slate-800"
                                                        />
                                                        <input
                                                            type="time"
                                                            value={activeSegment.shifts[day.key]?.afternoon?.end || ''}
                                                            onChange={(e) => handleShiftChange(day.key, 'afternoon', 'end', e.target.value)}
                                                            className="w-full bg-slate-50 border-none rounded-lg text-xs font-bold py-1 focus:ring-1 focus:ring-amber-500 text-slate-800"
                                                        />
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                        <tr className="bg-slate-100/60">
                                            <td className="pb-2 px-2 rounded-bl-xl font-bold text-[8px] text-slate-500/80 text-right uppercase pr-4 tracking-tight">Subtotal</td>
                                            {DAYS_OF_WEEK.map(day => {
                                                const h = calculateHours(activeSegment.shifts[day.key]?.afternoon?.start, activeSegment.shifts[day.key]?.afternoon?.end);
                                                return (
                                                    <td key={`h-a-${day.key}`} className={`text-center font-black text-[11px] pb-1.5 ${h > 0 ? 'text-slate-600' : 'text-slate-300'}`}>
                                                        {h > 0 ? h.toFixed(2) : '—'}
                                                    </td>
                                                );
                                            })}
                                        </tr>

                                        <tr><td colSpan={8} className="h-1.5" /></tr>

                                        {/* TOTALES */}
                                        <tr className="bg-amber-100/50">
                                            <td className="p-4 rounded-l-xl font-black text-amber-900 text-[11px] uppercase text-center bg-amber-500/20">Total Horas Día</td>
                                            {DAYS_OF_WEEK.map(day => (
                                                <td key={`total-${day.key}`} className="text-center p-3 font-black text-[16px] text-amber-900">
                                                    {getDayTotal(activeSegment, day.key).toFixed(2)}
                                                </td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    <div className="flex items-center space-x-3 text-slate-600 bg-blue-50/50 p-4 rounded-xl border border-blue-100 mb-6">
                        <Info size={18} className="text-blue-500 shrink-0" />
                        <p className="text-xs font-bold uppercase tracking-tight">Los bloques de clase coincidirán con estos rangos y se marcarán en <span className="text-slate-900">gris bajo</span>. Se respetan los feriados. Cada tramo se aplica solo dentro de su propio rango de fechas.</p>
                    </div>

                    {/* Validación: horas que NO son HE, para confirmar que sigan sumando 46h */}
                    {instructorSchedules.length > 0 && (
                        <div>
                            <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Validación de Carga Regular (No-HE) vs 46h</h3>
                            {weeklyBreakdown.length === 0 ? (
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-tight bg-slate-50 border-2 border-slate-100 rounded-xl p-4">Sin horario cargado para este instructor{showExemptionSection ? '' : ' en la simulación'}.</p>
                            ) : (
                                <div className="border-2 border-slate-100 rounded-2xl overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-900 text-white">
                                                <th className="p-3 text-left font-black uppercase tracking-widest text-[10px]">Semana</th>
                                                <th className="p-3 text-center font-black uppercase tracking-widest text-[10px]">Total</th>
                                                <th className="p-3 text-center font-black uppercase tracking-widest text-[10px]">HE</th>
                                                <th className="p-3 text-center font-black uppercase tracking-widest text-[10px]">Regular</th>
                                                <th className="p-3 text-center font-black uppercase tracking-widest text-[10px]">vs 46h</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {weeklyBreakdown.map((w, i) => (
                                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                                    <td className="p-3 font-bold text-slate-700">{w.weekStart.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                                                    <td className="p-3 text-center font-bold text-slate-500">{w.totalHours.toFixed(2)}h</td>
                                                    <td className="p-3 text-center font-bold text-amber-600">{w.extraHours.toFixed(2)}h</td>
                                                    <td className="p-3 text-center font-black text-slate-800">{w.regularHours.toFixed(2)}h</td>
                                                    <td className="p-3 text-center">
                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-black text-[10px] ${w.isBalanced ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                            {w.isBalanced ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                                            {w.isBalanced ? 'OK' : (w.regularHours < w.metaHours ? `Faltan ${(w.metaHours - w.regularHours).toFixed(2)}h` : `Exceden ${(w.regularHours - w.metaHours).toFixed(2)}h`)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-slate-50 px-8 py-5 border-t border-slate-100 flex items-center justify-between shrink-0">
                    <div className="text-slate-500 text-[11px] font-black uppercase tracking-widest">
                        Total General HE: <span className="text-amber-700 ml-2 text-xl">
                            {grandTotal.toFixed(2)} hrs
                        </span>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 text-slate-500 font-bold uppercase text-[10px] hover:bg-slate-100 rounded-xl transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleExportReport}
                            disabled={isExporting}
                            className="px-6 py-3 bg-white border-2 border-slate-200 text-slate-700 font-black uppercase text-[11px] rounded-xl hover:bg-slate-50 transition-all flex items-center space-x-2"
                        >
                            {isExporting ? <div className="animate-spin h-4 w-4 border-2 border-slate-700 border-t-transparent rounded-full" /> : <Download size={16} />}
                            <span>Reporte Excel</span>
                        </button>
                        <button
                            onClick={handleFormSave}
                            disabled={!canSaveExemption || isSaving}
                            className="px-8 py-3 bg-amber-500 hover:bg-amber-600 text-white font-black uppercase text-[11px] rounded-xl shadow-lg shadow-amber-500/25 transition-all transform hover:scale-105 active:scale-95 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                        >
                            {isSaving ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <Save size={16} />}
                            <span>Guardar Configuración HE</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExtraHoursModal;
