
import React, { useState, useEffect } from 'react';
// Fix: Added ShieldAlert to the import list from lucide-react
import { X, Save, AlertCircle, MapPin, Video, Calendar, Hash, BookOpen, Layers, Briefcase, Palette, Clock, ShieldAlert } from 'lucide-react';
import { ProcessedSchedule, ViewType } from '../types';
import { DAYS_OF_WEEK, COLORS } from '../constants';

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: ProcessedSchedule) => void;
  onNavigate?: (type: ViewType, filter: string) => void;
  initialData?: ProcessedSchedule | null;
  defaultInstructor?: string;
}

const RecordModal: React.FC<RecordModalProps> = ({ isOpen, onClose, onSave, onNavigate, initialData, defaultInstructor }) => {
  const [formData, setFormData] = useState<Partial<ProcessedSchedule>>({
    courseCode: '',
    courseName: '',
    block: '',
    instructor: defaultInstructor || '',
    room: '',
    building: '',
    days: [],
    startTime: '08:00',
    endTime: '10:00',
    startDate: new Date(),
    endDate: new Date(),
    career: '',
    nrc: '',
    color: COLORS[0],
    modality: 'presencial',
    isAdministrative: false,
    weeklyHours: 0
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        startDate: new Date(initialData.startDate),
        endDate: new Date(initialData.endDate)
      });
    } else {
      setFormData({
        courseCode: '',
        courseName: '',
        block: '',
        instructor: defaultInstructor || '',
        room: '',
        building: '',
        days: [],
        startTime: '08:00',
        endTime: '10:00',
        startDate: new Date(),
        endDate: new Date(),
        career: '',
        nrc: '',
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        modality: 'presencial',
        isAdministrative: false,
        weeklyHours: 0
      });
    }
    setError(null);
  }, [initialData, isOpen, defaultInstructor]);

  if (!isOpen) return null;

  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const durationMin = timeToMinutes(formData.endTime!) - timeToMinutes(formData.startTime!);

    if (formData.courseName === 'REFRIGERIO' && durationMin !== 45) {
      setError('El REFRIGERIO debe durar exactamente 45 minutos.');
      return;
    }

    if (durationMin <= 0) {
      setError('La hora de fin debe ser posterior a la de inicio.');
      return;
    }

    if ((formData.days || []).length === 0) {
      setError('Debe seleccionar al menos un día.');
      return;
    }

    // REGLA DE INMUTABILIDAD:
    // Solo recalculamos carga para tareas administrativas.
    // Para clases académicas, preservamos el valor original del archivo.
    let finalWeeklyHours = formData.weeklyHours || 0;
    if (formData.isAdministrative) {
      finalWeeklyHours = durationMin / 60;
    } else if (initialData) {
      finalWeeklyHours = initialData.weeklyHours;
    }

    onSave({
      ...formData,
      id: formData.id || `custom-${Date.now()}`,
      weeklyHours: finalWeeklyHours
    } as ProcessedSchedule);
    onClose();
  };

  const toggleDay = (day: string) => {
    // Removed academic lock check to allow editing days
    const currentDays = formData.days || [];
    if (currentDays.includes(day)) {
      setFormData({ ...formData, days: currentDays.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, days: [...currentDays, day] });
    }
  };

  const toInputDate = (d?: Date) => {
    if (!d || isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isLocked = !formData.isAdministrative && !!initialData;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300 border border-white/20">

        {/* Cabezal */}
        <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-2xl text-white shadow-xl ${formData.isAdministrative ? 'bg-indigo-600 shadow-indigo-100' : 'bg-blue-600 shadow-blue-100'}`}>
              {formData.isAdministrative ? <Briefcase size={24} /> : <BookOpen size={24} />}
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none uppercase">
                {initialData ? (formData.isAdministrative ? 'Editar Tarea Administrativa' : 'Detalle de Clase') : 'Nuevo Registro de Horario'}
              </h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2">
                {formData.isAdministrative ? 'Modo Gestión de Carga Real' : 'Información de Registro Maestro'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-900"><X size={24} /></button>
        </div>

        <form id="record-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar bg-white">

          {/* Alertas */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-[24px] text-rose-700 text-xs font-black flex items-center gap-3 animate-in slide-in-from-top-2">
              <AlertCircle size={20} className="shrink-0" /> {error}
            </div>
          )}

          {!formData.isAdministrative && initialData && (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-[24px] text-blue-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
              <ShieldAlert size={20} className="shrink-0" />
              <span>PROTECCIÓN DE CARGA: Este bloque académico mantiene su carga original de {initialData.weeklyHours.toFixed(2)}h definida en el archivo maestro.</span>
            </div>
          )}

          {/* Sección 1: Identificación (NRC, Código, Bloque) */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center"><Hash size={14} className="mr-2" /> Identificación del Curso</h4>
            <div className="grid grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">NRC / Sección</label>
                <input required disabled={isLocked} className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50" value={formData.nrc} onChange={e => setFormData({ ...formData, nrc: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Código Curso</label>
                <input required disabled={isLocked} className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50" value={formData.courseCode} onChange={e => setFormData({ ...formData, courseCode: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Bloque</label>
                <input required disabled={isLocked} className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50" value={formData.block} onChange={e => setFormData({ ...formData, block: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Sección 2: Información Académica (Nombre, Carrera) */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre de Actividad / Curso</label>
                <input required disabled={isLocked && !formData.isAdministrative} className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50" value={formData.courseName} onChange={e => setFormData({ ...formData, courseName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Carrera / Especialidad</label>
                <input required disabled={isLocked} className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50" value={formData.career} onChange={e => setFormData({ ...formData, career: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Sección 3: Programación (Días, Modalidad) */}
          <div className="grid grid-cols-2 gap-10 pt-4">
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center"><Layers size={14} className="mr-2" /> Días Programados</h4>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map(day => {
                  const active = formData.days?.includes(day.key);
                  return (
                    <button
                      key={day.key}
                      type="button"
                      // disabled={isLocked} -> Removed to allow editing
                      onClick={() => toggleDay(day.key)}
                      className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${active ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center"><Video size={14} className="mr-2" /> Modalidad de Sesión</h4>
              <div className="flex bg-slate-100 p-1.5 rounded-[24px]">
                <button type="button" onClick={() => setFormData({ ...formData, modality: 'presencial' })} className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase transition-all flex items-center justify-center space-x-2 ${formData.modality === 'presencial' ? 'bg-white text-blue-600 shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}>
                  <MapPin size={16} /><span>Presencial</span>
                </button>
                <button type="button" onClick={() => setFormData({ ...formData, modality: 'virtual' })} className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase transition-all flex items-center justify-center space-x-2 ${formData.modality === 'virtual' ? 'bg-white text-blue-600 shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}>
                  <Video size={16} /><span>Virtual</span>
                </button>
              </div>
            </div>
          </div>

          {/* Sección 4: Tiempo y Ubicación (Editable siempre para visualización) */}
          <div className="grid grid-cols-2 gap-10 pt-4">
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center"><Clock size={14} className="mr-2" /> Horario Visual</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Inicio</label>
                  <input type="time" required className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl font-black text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fin</label>
                  <input type="time" required className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl font-black text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={formData.endTime} onChange={e => setFormData({ ...formData, endTime: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center"><MapPin size={14} className="mr-2" /> Ambiente y Ubicación</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Edificio</label>
                  <input className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ej: 82-CF" value={formData.building} onChange={e => setFormData({ ...formData, building: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Aula</label>
                  <input className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ej: 107" value={formData.room} onChange={e => setFormData({ ...formData, room: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          {/* Sección 5: Vigencia y Estética */}
          <div className="grid grid-cols-2 gap-10 pt-4">
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center"><Calendar size={14} className="mr-2" /> Vigencia del Semestre</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha Inicio</label>
                  <input type="date" className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" value={toInputDate(formData.startDate)} onChange={e => setFormData({ ...formData, startDate: new Date(e.target.value + 'T00:00:00') })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha Fin</label>
                  <input type="date" className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" value={toInputDate(formData.endDate)} onChange={e => setFormData({ ...formData, endDate: new Date(e.target.value + 'T00:00:00') })} />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center"><Palette size={14} className="mr-2" /> Color de Identificación</h4>
              <div className="grid grid-cols-5 gap-2">
                {COLORS.slice(0, 10).map((c, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: c })}
                    className={`h-10 rounded-xl transition-all border-4 ${formData.color === c ? 'border-slate-900 scale-110 shadow-lg' : 'border-transparent hover:scale-105'} ${c.split(' ')[0]}`}
                  />
                ))}
              </div>
            </div>
          </div>

        </form>

        {/* Footer */}
        <div className="px-10 py-8 border-t border-slate-100 flex justify-end space-x-4 bg-slate-50/80">
          <button type="button" onClick={onClose} className="px-8 py-3.5 text-xs font-black text-slate-500 hover:bg-slate-200 rounded-2xl transition-all uppercase tracking-widest">Cancelar</button>
          <button form="record-form" type="submit" className="px-10 py-3.5 bg-slate-900 text-white text-xs font-black rounded-2xl hover:bg-slate-800 shadow-2xl shadow-slate-200 transition-all flex items-center space-x-3 active:scale-95 uppercase tracking-widest">
            <Save size={20} /><span>Guardar Cambios</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordModal;
