import React, { useState, useEffect } from 'react';
import { Search, Plus, Filter, BookOpen, UserRound, Building2, X, Loader2 } from 'lucide-react';
import { useData } from '../context/DataContext';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetInstructor: string;
}

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, targetInstructor }) => {
    const { searchSchedules, importScheduleToSimulation } = useData();
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchTerm.length >= 3) {
                setLoading(true);
                try {
                    const data = await searchSchedules(searchTerm);
                    setResults(data);
                } catch (error) {
                    console.error("Search error", error);
                    setResults([]);
                } finally {
                    setLoading(false);
                }
            } else {
                setResults([]);
            }
        }, 500); // Debounce 500ms

        return () => clearTimeout(timer);
    }, [searchTerm, searchSchedules]);

    if (!isOpen) return null;

    const handleImport = (scheduleId: string) => {
        importScheduleToSimulation(scheduleId, targetInstructor);
        alert("Curso importado. Ahora puedes editarlo en el horario.");
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center">
                            <BookOpen className="mr-2 text-indigo-600" size={20} />
                            Asignar Carga Externa
                        </h2>
                        <p className="text-xs text-slate-500 font-bold mt-1">
                            Busca un NRC del archivo general para asignarlo a <span className="text-indigo-600">{targetInstructor}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Search Bar */}
                <div className="p-4 border-b border-slate-100 bg-white shrink-0 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por NRC, Nombre del Curso o Código (min 3 caracteres)..."
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-600 animate-spin" size={18} />}
                    </div>
                </div>

                {/* Results List */}
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30 custom-scrollbar space-y-2">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-48 text-indigo-400">
                            <Loader2 size={32} className="mb-2 animate-spin" />
                            <p className="text-xs font-bold uppercase tracking-wider">Buscando en Archivo...</p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                            <Search size={32} className="mb-2 opacity-50" />
                            <p className="text-xs font-bold uppercase tracking-wider">
                                {searchTerm.length < 3 ? 'Ingresa al menos 3 caracteres' : 'No se encontraron resultados'}
                            </p>
                        </div>
                    ) : (
                        results.map((item) => (
                            <div key={item.id} className="group bg-white p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all flex items-center justify-between">
                                <div className="min-w-0 flex-1 pr-4">
                                    <div className="flex items-center space-x-2 mb-1">
                                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-black rounded uppercase tracking-wider border border-blue-100">
                                            NRC: {item.nrc || 'N/A'}
                                        </span>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider line-clamp-1">
                                            {item.courseCode}
                                        </span>
                                    </div>
                                    <h3 className="text-xs font-bold text-slate-800 line-clamp-1 mb-1 group-hover:text-indigo-700 transition-colors">
                                        {item.courseName}
                                    </h3>
                                    <div className="flex items-center text-[10px] text-slate-500 space-x-3">
                                        <div className="flex items-center" title="Instructor Actual">
                                            <UserRound size={12} className="mr-1 text-slate-400" />
                                            <span className="font-semibold truncate max-w-[120px]">{item.instructor || 'Sin Asignar'}</span>
                                        </div>
                                        <div className="flex items-center" title="Horario Original">
                                            <Building2 size={12} className="mr-1 text-slate-400" />
                                            <span className="font-mono">{item.days.join(', ')} • {item.startTime} - {item.endTime}</span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleImport(item.id)}
                                    className="shrink-0 p-2 bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white rounded-lg transition-all transform hover:scale-105 active:scale-95 border border-slate-200 hover:border-indigo-600 shadow-sm"
                                    title="Importar a Simulación"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 text-center font-medium">
                    Mostrando primeros {results.length} resultados del archivo general.
                </div>
            </div>
        </div>
    );
};

export default ImportModal;
