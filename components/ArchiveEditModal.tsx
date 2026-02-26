import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, User, Clock, Calendar, MapPin, Hash, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { ProcessedSchedule, Instructor, HolidayData } from '../types';
import { useData } from '../context/DataContext';
import { DAYS_OF_WEEK } from '../constants';

interface ArchiveEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (record: ProcessedSchedule) => Promise<void>;
    schedule: ProcessedSchedule | null;
}

const ArchiveEditModal: React.FC<ArchiveEditModalProps> = ({ isOpen, onClose, onSave, schedule }) => {
    const { instructors, holidays } = useData();
    const [formData, setFormData] = useState<Partial<ProcessedSchedule>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [instructorSearch, setInstructorSearch] = useState('');

    useEffect(() => {
        if (schedule) {
            setFormData({ ...schedule });
            setInstructorSearch(schedule.instructor || '');
        }
    }, [schedule, isOpen]);

    // Motor de Reglas para el Tipo de Hora
    const hourType = useMemo(() => {
        const name = (formData.courseName || '').toUpperCase();
        const isSpecial =
            name.includes('REV Y CALIF CUADERNOS') ||
            name.includes('ASESORIA EN ELABORACION DE PROYECTOS') ||
            name.includes('COORDINADOR') ||
            name.includes('COORDINACION') ||
            formData.isAdministrative;

        return isSpecial ? 'cronologica' : 'pedagogica';
    }, [formData.courseName, formData.isAdministrative]);

    // Cálculo Sugerido de Horas
    const suggestedHours = useMemo(() => {
        if (!formData.startTime || !formData.endTime) return 0;
        const daysCount = formData.days?.length || 0;
        if (daysCount === 0) return 0;

        const timeToMin = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        const durationPerDay = timeToMin(formData.endTime) - timeToMin(formData.startTime);
        if (durationPerDay <= 0) return 0;

        const divisor = hourType === 'cronologica' ? 60 : 45;
        return (durationPerDay * daysCount) / divisor;
    }, [formData.startTime, formData.endTime, hourType, formData.days]);

    // Detector de Feriados
    const holidayOverlap = useMemo(() => {
        if (!formData.days || formData.days.length === 0 || !holidays) return null;

        const dayMap: Record<string, number> = {
            'LUNES': 1, 'MARTES': 2, 'MIERCOLES': 3, 'JUEVES': 4, 'VIERNES': 5, 'SABADO': 6, 'DOMINGO': 0
        };

        const activeDays = formData.days.map(d => dayMap[d]);
        const conflictingHoliday = holidays.find(h => activeDays.includes(h.date.getDay()));

        return conflictingHoliday;
    }, [formData.days, holidays]);

    const filteredInstructors = useMemo(() => {
        if (!instructorSearch) return [];
        return instructors.filter(i =>
            i.name.toLowerCase().includes(instructorSearch.toLowerCase()) ||
            i.id.toLowerCase().includes(instructorSearch.toLowerCase())
        ).slice(0, 5);
    }, [instructors, instructorSearch]);

    const toggleDay = (day: string) => {
        const currentDays = formData.days || [];
        const newDays = currentDays.includes(day)
            ? currentDays.filter(d => d !== day)
            : [...currentDays, day];
        setFormData({ ...formData, days: newDays });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.nrc) {
            alert("El NRC es requerido");
            return;
        }

        if (!formData.days || formData.days.length === 0) {
            alert("Debe seleccionar al menos un día");
            return;
        }

        setIsSaving(true);
        try {
            await onSave({
                ...formData,
                weeklyHours: suggestedHours,
            } as ProcessedSchedule);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen || !schedule) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-xl text-white">
                            <RefreshCw size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-900 leading-none">Editar Bloque Maestro</h3>
                            <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-wider">Ajuste de Registro Base</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto max-h-[75vh] custom-scrollbar">

                    {/* NRC e Instructor */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">NRC / Sección</label>
                            <div className="relative">
                                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                <input
                                    value={formData.nrc}
                                    onChange={e => setFormData({ ...formData, nrc: e.target.value })}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-100 border-transparent rounded-2xl text-sm font-bold focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 relative">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Instructor</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                <input
                                    value={instructorSearch}
                                    onChange={e => setInstructorSearch(e.target.value)}
                                    placeholder="Buscar instructor..."
                                    className="w-full pl-10 pr-4 py-3 bg-slate-100 border-transparent rounded-2xl text-sm font-bold focus:bg-white focus:border-blue-500 transition-all outline-none"
                                />
                            </div>
                            {instructorSearch !== (formData.instructor || '') && instructorSearch.length > 0 && (
                                <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl mt-2 z-50 overflow-hidden divide-y divide-slate-50 max-h-48 overflow-y-auto">
                                    {filteredInstructors.map(i => (
                                        <button
                                            key={i.id}
                                            type="button"
                                            onClick={() => {
                                                setFormData({ ...formData, instructor: i.name, instructorId: i.id });
                                                setInstructorSearch(i.name);
                                            }}
                                            className="w-full px-4 py-3 text-left hover:bg-blue-50 text-sm font-bold text-slate-600 transition-colors flex items-center gap-2"
                                        >
                                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">{i.name[0]}</div>
                                            {i.name}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormData({ ...formData, instructor: '', instructorId: '' });
                                            setInstructorSearch('');
                                        }}
                                        className="w-full px-4 py-3 text-left hover:bg-rose-50 text-sm font-bold text-rose-600 transition-colors flex items-center gap-2"
                                    >
                                        <Trash2 size={14} /> Retirar Instructor (Sin Asignar)
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Días de la Semana */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Días de Clase</label>
                        <div className="flex flex-wrap gap-2">
                            {DAYS_OF_WEEK.map(day => (
                                <button
                                    key={day.key}
                                    type="button"
                                    onClick={() => toggleDay(day.key)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all border-2 ${formData.days?.includes(day.key)
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                                        : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-blue-200 hover:text-blue-500'
                                        }`}
                                >
                                    {day.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Fechas de Vigencia */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Inicio</label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                <input
                                    type="date"
                                    value={formData.startDate ? (formData.startDate instanceof Date ? formData.startDate.toISOString().split('T')[0] : new Date(formData.startDate).toISOString().split('T')[0]) : ''}
                                    onChange={e => setFormData({ ...formData, startDate: new Date(e.target.value + 'T00:00:00') })}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-100 border-transparent rounded-2xl text-sm font-bold focus:bg-white focus:border-blue-500 transition-all outline-none"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Fin</label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                <input
                                    type="date"
                                    value={formData.endDate ? (formData.endDate instanceof Date ? formData.endDate.toISOString().split('T')[0] : new Date(formData.endDate).toISOString().split('T')[0]) : ''}
                                    onChange={e => setFormData({ ...formData, endDate: new Date(e.target.value + 'T00:00:00') })}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-100 border-transparent rounded-2xl text-sm font-bold focus:bg-white focus:border-blue-500 transition-all outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Horario y Ambiente */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Inicio</label>
                                <div className="relative">
                                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                    <input
                                        type="time"
                                        value={formData.startTime}
                                        onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                        className="w-full pl-10 pr-4 py-3 bg-slate-100 border-transparent rounded-2xl text-sm font-bold focus:bg-white transition-all outline-none"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fin</label>
                                <div className="relative">
                                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                    <input
                                        type="time"
                                        value={formData.endTime}
                                        onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                                        className="w-full pl-10 pr-4 py-3 bg-slate-100 border-transparent rounded-2xl text-sm font-bold focus:bg-white transition-all outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Edificio</label>
                                <div className="relative">
                                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                    <input
                                        value={formData.building}
                                        onChange={e => setFormData({ ...formData, building: e.target.value })}
                                        placeholder="Ej: A"
                                        className="w-full pl-10 pr-4 py-3 bg-slate-100 border-transparent rounded-2xl text-sm font-bold focus:bg-white outline-none"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Aula</label>
                                <div className="relative">
                                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                    <input
                                        value={formData.room}
                                        onChange={e => setFormData({ ...formData, room: e.target.value })}
                                        placeholder="Ej: 101"
                                        className="w-full pl-10 pr-4 py-3 bg-slate-100 border-transparent rounded-2xl text-sm font-bold focus:bg-white outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Motor de Horas (Display solamente) */}
                    <div className="bg-slate-50 border border-slate-100 rounded-[24px] p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cálculo Detectado</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${hourType === 'cronologica' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                        Modo {hourType} ({hourType === 'cronologica' ? '60' : '45'} min)
                                    </span>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Horas Semanales</p>
                                <p className="text-2xl font-black text-slate-900">{suggestedHours.toFixed(2)}h</p>
                            </div>
                        </div>

                        {/* Alerta de Feriado Integrada */}
                        {holidayOverlap && (
                            <div className="flex items-start gap-4 p-4 bg-orange-50 rounded-2xl border border-orange-100 animate-pulse">
                                <AlertTriangle className="text-orange-500 shrink-0" size={20} />
                                <div>
                                    <p className="text-xs font-black text-orange-700 uppercase leading-none">Conflicto con Feriado</p>
                                    <p className="text-xs text-orange-600 font-medium mt-1">
                                        Detectado feriado "{holidayOverlap.name}". El sistema aplicará proceso de corte y propondrá recuperación automática.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                </form>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving}
                        className="px-10 py-3 bg-slate-900 text-white text-xs font-black rounded-2xl hover:bg-slate-800 shadow-xl shadow-slate-200 transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95 uppercase tracking-widest"
                    >
                        {isSaving ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : <Save size={18} />}
                        Guardar Cambios
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ArchiveEditModal;
