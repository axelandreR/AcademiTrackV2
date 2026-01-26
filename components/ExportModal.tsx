
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, FileDown, Layers, MapPin, Users, CheckCircle2, AlertCircle, Briefcase, FileText, Table, Calendar, Upload, Image as ImageIcon } from 'lucide-react';
import { ViewType, ProcessedSchedule, ExportConfig } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ProcessedSchedule[];
  currentViewType: ViewType;
  currentSelectedItem?: string;
  onExport: (config: ExportConfig) => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, data, currentViewType, currentSelectedItem, onExport }) => {
  const [mode, setMode] = useState<'individual' | 'global'>('individual');
  const [format, setFormat] = useState<'pdf' | 'excel'>('pdf');
  const [selectedType, setSelectedType] = useState<ViewType>(currentViewType);
  const [selectedItem, setSelectedItem] = useState<string>(currentSelectedItem || '');
  const [selectedCareer, setSelectedCareer] = useState<string>('all');
  const [scope, setScope] = useState<'firstWeek' | 'allWeeks' | 'custom'>('firstWeek');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sincronizar con la vista actual cuando el modal se abre
  useEffect(() => {
    if (isOpen) {
      setSelectedType(currentViewType);
      setSelectedItem(currentSelectedItem || '');
    }
  }, [isOpen, currentViewType, currentSelectedItem]);

  const options = useMemo(() => {
    let list: string[] = [];
    if (selectedType === 'Bloque') {
      list = Array.from(new Set(data.map(s => s.block)));
    }
    if (selectedType === 'Aula') list = Array.from(new Set(data.map(s => `${s.building} - ${s.room}`)));
    if (selectedType === 'Instructor') list = Array.from(new Set(data.map(s => s.instructor)));
    return list.filter(Boolean).sort();
  }, [data, selectedType]);

  const careers = useMemo(() => {
    return Array.from(new Set(data.map(s => s.career))).filter(Boolean).sort();
  }, [data]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogo(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col ring-1 ring-white/20">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-slate-900 rounded-lg text-white">
              <FileDown size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Exportar</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          {/* Formato de Exportación */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Formato de Archivo</label>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setFormat('pdf')}
                className={`p-4 rounded-xl border-2 flex flex-col items-center text-center transition-all ${format === 'pdf' ? 'border-red-600 bg-red-50 text-red-700' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}
              >
                <FileText size={24} className="mb-2" />
                <span className="text-sm font-bold">Documento PDF</span>
              </button>
              <button 
                onClick={() => setFormat('excel')}
                className={`p-4 rounded-xl border-2 flex flex-col items-center text-center transition-all ${format === 'excel' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}
              >
                <Table size={24} className="mb-2" />
                <span className="text-sm font-bold">Hoja de Cálculo Excel</span>
              </button>
            </div>
          </div>

          {/* Logo Upload */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
              <span>Logo Institucional (Opcional)</span>
              {logo && <button onClick={() => setLogo(undefined)} className="text-[10px] text-rose-500 hover:underline">Eliminar</button>}
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`p-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all ${logo ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-blue-400'}`}
            >
              <input type="file" ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
              {logo ? (
                <div className="flex flex-col items-center">
                  <img src={logo} alt="Logo preview" className="h-12 object-contain mb-2" />
                  <span className="text-[10px] font-black text-emerald-700 uppercase">Logo Cargado ✓</span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-slate-400">
                  <Upload size={24} className="mb-2" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Subir Imagen Logo</span>
                </div>
              )}
            </div>
          </div>

          {/* Modo de Exportación */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Tipo de Descarga</label>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setMode('individual')}
                className={`p-4 rounded-xl border-2 flex flex-col items-center text-center transition-all ${mode === 'individual' ? 'border-blue-600 bg-blue-50/50 text-blue-700 shadow-lg shadow-blue-100' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}
              >
                <div className={`p-2 rounded-lg mb-2 ${mode === 'individual' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}><CheckCircle2 size={18} /></div>
                <span className="text-sm font-bold">Individual</span>
              </button>
              <button 
                onClick={() => setMode('global')}
                className={`p-4 rounded-xl border-2 flex flex-col items-center text-center transition-all ${mode === 'global' ? 'border-blue-600 bg-blue-50/50 text-blue-700 shadow-lg shadow-blue-100' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}
              >
                <div className={`p-2 rounded-lg mb-2 ${mode === 'global' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}><Layers size={18} /></div>
                <span className="text-sm font-bold">Global (ZIP)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Categoría</label>
              <select 
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value as ViewType);
                  setSelectedItem('');
                }}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="Bloque">Bloques</option>
                <option value="Aula">Aulas</option>
                <option value="Instructor">Instructores</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Vigencia</label>
              <div className="flex flex-col space-y-1.5">
                <button 
                  onClick={() => setScope('firstWeek')}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black border transition-all uppercase ${scope === 'firstWeek' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  Primera Semana Lectiva
                </button>
                <button 
                  onClick={() => setScope('allWeeks')}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black border transition-all uppercase ${scope === 'allWeeks' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  Todas las semanas
                </button>
                <button 
                  onClick={() => setScope('custom')}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black border transition-all uppercase flex items-center justify-center space-x-2 ${scope === 'custom' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  <Calendar size={12} />
                  <span>Rango Personalizado</span>
                </button>
              </div>
            </div>
          </div>

          {scope === 'custom' && (
            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Inicio</label>
                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Fin</label>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
                />
              </div>
            </div>
          )}

          {mode === 'global' && selectedType === 'Bloque' && (
            <div className="space-y-2 animate-in slide-in-from-top-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center space-x-2">
                <Briefcase size={14} />
                <span>Filtrar por Carrera</span>
              </label>
              <select 
                value={selectedCareer}
                onChange={(e) => setSelectedCareer(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">Todas las Carreras</option>
                {careers.map(career => (
                  <option key={career} value={career}>{career}</option>
                ))}
              </select>
            </div>
          )}

          {mode === 'individual' && (
            <div className="space-y-2 animate-in slide-in-from-top-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                <span>Seleccionar {selectedType}</span>
                <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{options.length} opciones</span>
              </label>
              <select 
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Selecciona una opción...</option>
                {options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )}

          {format === 'excel' && (
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start space-x-3 text-emerald-800">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed font-medium">
                El archivo Excel incluirá <strong>resúmenes detallados de carga horaria</strong>, información de instructor y tabla de cursos bajo la primera semana.
              </div>
            </div>
          )}
        </div>

        <div className="px-8 py-6 border-t border-slate-100 flex justify-end space-x-4 bg-slate-50/80">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button 
            disabled={(mode === 'individual' && !selectedItem) || (scope === 'custom' && (!customStartDate || !customEndDate))}
            onClick={() => onExport({ mode, type: selectedType, format, selectedItem, selectedCareer: selectedType === 'Bloque' ? selectedCareer : undefined, scope, customStartDate, customEndDate, logo })}
            className="px-8 py-2.5 bg-slate-900 text-white text-sm font-black rounded-xl hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all flex items-center space-x-2 disabled:opacity-50 disabled:shadow-none"
          >
            <FileDown size={18} />
            <span>Exportar {format.toUpperCase()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
