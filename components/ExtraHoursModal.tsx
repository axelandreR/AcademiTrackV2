import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Save, Info, FileText, Download } from 'lucide-react';
import { ExtraHoursConfig, ExtraHoursShift } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { generateHESummaryExcel } from '../services/excelExporter';

interface ExtraHoursModalProps {
    isOpen: boolean;
    onClose: () => void;
    config: ExtraHoursConfig | null;
    onSave: (config: ExtraHoursConfig) => void;
    holidays?: any[];
    instructorName?: string;
}

const ExtraHoursModal: React.FC<ExtraHoursModalProps> = ({ isOpen, onClose, config, onSave, holidays = [], instructorName }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [repeatWeekly, setRepeatWeekly] = useState(true);
    const [shifts, setShifts] = useState<{ [day: string]: { morning?: ExtraHoursShift; afternoon?: ExtraHoursShift } }>({});

    useEffect(() => {
        if (config) {
            setStartDate(config.startDate || '');
            setEndDate(config.endDate || '');
            setRepeatWeekly(config.repeatWeekly ?? true);
            setShifts(config.shifts || {});
        } else {
            setStartDate('');
            setEndDate('');
            setRepeatWeekly(true);
            setShifts({});
        }
    }, [config, isOpen]);

    if (!isOpen) return null;

    const handleExportReport = async () => {
        setIsExporting(true);
        try {
            const blob = await generateHESummaryExcel({
                startDate,
                endDate,
                repeatWeekly,
                shifts
            }, holidays, instructorName);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Reporte_HE_${startDate || 'sin_fecha'}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            alert("Error al generar reporte: " + e);
        } finally {
            setIsExporting(false);
        }
    };

    const handleShiftChange = (dayKey: string, type: 'morning' | 'afternoon', field: 'start' | 'end', value: string) => {
        setShifts(prev => {
            const dayShifts = prev[dayKey] || {};
            const shift = dayShifts[type] || { start: '', end: '' };

            return {
                ...prev,
                [dayKey]: {
                    ...dayShifts,
                    [type]: {
                        ...shift,
                        [field]: value
                    }
                }
            };
        });
    };

    const calculateHours = (start: string, end: string) => {
        if (!start || !end) return 0;
        const [h1, m1] = start.split(':').map(Number);
        const [h2, m2] = end.split(':').map(Number);
        const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        return diff > 0 ? diff / 60 : 0;
    };

    const getDayTotal = (dayKey: string) => {
        const dayShifts = shifts[dayKey];
        if (!dayShifts) return 0;
        const morning = dayShifts.morning ? calculateHours(dayShifts.morning.start, dayShifts.morning.end) : 0;
        const afternoon = dayShifts.afternoon ? calculateHours(dayShifts.afternoon.start, dayShifts.afternoon.end) : 0;
        return morning + afternoon;
    };

    const handleFormSave = () => {
        onSave({
            startDate,
            endDate,
            repeatWeekly,
            shifts
        });
        onClose();
    };

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
                            <h2 className="text-xl font-black text-white uppercase tracking-tight">Programación de Horas Extras</h2>
                            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">Configuración para el Modo de Prueba</p>
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Inicio</label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
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
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-amber-500 focus:ring-0 transition-all font-bold text-slate-800"
                                />
                            </div>
                        </div>
                        <div className="flex items-end pb-0.5">
                            <label className="flex items-center space-x-3 cursor-pointer group bg-slate-50 p-2.5 px-5 rounded-xl border-2 border-slate-100 hover:border-amber-200 transition-all w-full">
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={repeatWeekly}
                                        onChange={(e) => setRepeatWeekly(e.target.checked)}
                                        className="w-5 h-5 rounded-lg border-2 border-slate-300 text-amber-500 focus:ring-amber-500 transition-all cursor-pointer"
                                    />
                                </div>
                                <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors uppercase tracking-tight">Repetir semanalmente</span>
                            </label>
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
                                {/* MAÑANA (agrupada visualmente con su subtotal via fondo compartido) */}
                                <tr className="bg-amber-50/50">
                                    <td className="p-2 rounded-tl-xl font-black text-amber-700 text-[10px] uppercase tracking-widest text-center">Mañana</td>
                                    {DAYS_OF_WEEK.map(day => (
                                        <td key={`morning-${day.key}`} className="bg-white p-1.5 rounded-xl border border-slate-100">
                                            <div className="space-y-1">
                                                <input
                                                    type="time"
                                                    value={shifts[day.key]?.morning?.start || ''}
                                                    onChange={(e) => handleShiftChange(day.key, 'morning', 'start', e.target.value)}
                                                    className="w-full bg-slate-50 border-none rounded-lg text-xs font-bold py-1 focus:ring-1 focus:ring-amber-500 text-slate-800"
                                                />
                                                <input
                                                    type="time"
                                                    value={shifts[day.key]?.morning?.end || ''}
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
                                        const h = shifts[day.key]?.morning ? calculateHours(shifts[day.key]!.morning!.start, shifts[day.key]!.morning!.end) : 0;
                                        return (
                                            <td key={`h-m-${day.key}`} className={`text-center font-black text-[11px] pb-1.5 ${h > 0 ? 'text-amber-700' : 'text-slate-300'}`}>
                                                {h > 0 ? h.toFixed(2) : '—'}
                                            </td>
                                        );
                                    })}
                                </tr>

                                <tr><td colSpan={8} className="h-1.5" /></tr>

                                {/* TARDE (agrupada visualmente con su subtotal via fondo compartido) */}
                                <tr className="bg-slate-100/60">
                                    <td className="p-2 rounded-tl-xl font-black text-slate-500 text-[10px] uppercase tracking-widest text-center">Tarde</td>
                                    {DAYS_OF_WEEK.map(day => (
                                        <td key={`afternoon-${day.key}`} className="bg-white p-1.5 rounded-xl border border-slate-100">
                                            <div className="space-y-1">
                                                <input
                                                    type="time"
                                                    value={shifts[day.key]?.afternoon?.start || ''}
                                                    onChange={(e) => handleShiftChange(day.key, 'afternoon', 'start', e.target.value)}
                                                    className="w-full bg-slate-50 border-none rounded-lg text-xs font-bold py-1 focus:ring-1 focus:ring-amber-500 text-slate-800"
                                                />
                                                <input
                                                    type="time"
                                                    value={shifts[day.key]?.afternoon?.end || ''}
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
                                        const h = shifts[day.key]?.afternoon ? calculateHours(shifts[day.key]!.afternoon!.start, shifts[day.key]!.afternoon!.end) : 0;
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
                                            {getDayTotal(day.key).toFixed(2)}
                                        </td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center space-x-3 text-slate-600 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                        <Info size={18} className="text-blue-500 shrink-0" />
                        <p className="text-xs font-bold uppercase tracking-tight">Los bloques de clase coincidirán con estos rangos y se marcarán en <span className="text-slate-900">gris bajo</span>. Se respetan los feriados.</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-50 px-8 py-5 border-t border-slate-100 flex items-center justify-between shrink-0">
                    <div className="text-slate-500 text-[11px] font-black uppercase tracking-widest">
                        Total General: <span className="text-amber-700 ml-2 text-xl">
                            {DAYS_OF_WEEK.reduce((sum, day) => sum + getDayTotal(day.key), 0).toFixed(2)} hrs
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
                            className="px-8 py-3 bg-amber-500 hover:bg-amber-600 text-white font-black uppercase text-[11px] rounded-xl shadow-lg shadow-amber-500/25 transition-all transform hover:scale-105 active:scale-95 flex items-center space-x-2"
                        >
                            <Save size={16} />
                            <span>Guardar Configuración HE</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExtraHoursModal;
