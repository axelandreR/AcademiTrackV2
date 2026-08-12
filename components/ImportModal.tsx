import React, { useMemo, useState } from 'react';
import { Search, Plus, BookOpen, UserRound, X, Loader2, LayoutGrid, ChevronRight, Video, MapPin } from 'lucide-react';
import { useData } from '../context/DataContext';
import { ProcessedSchedule } from '../types';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetInstructor: string;
}

type Mode = 'bloque' | 'nrc';

interface NrcGroup {
    nrc: string;
    courseCode: string;
    courseName: string;
    instructor: string;
    sessions: ProcessedSchedule[];
}

// Mismo criterio usado en toda la app (ScheduleGrid, auditCalculations, businessRules)
// para identificar sesiones VAEE/Autoestudio — nunca tienen instructor real asignado en
// el sistema, así que no deben aparecer como opción para asignar a nadie.
const isAutoestudio = (s: ProcessedSchedule): boolean =>
    s.meetingType === 'VAEE' ||
    (!!s.activity && s.activity.toUpperCase().includes('AUTOESTUDIO')) ||
    s.category === 'asincrona';

const groupByNrc = (rows: ProcessedSchedule[]): NrcGroup[] => {
    const map = new Map<string, ProcessedSchedule[]>();
    rows.forEach(s => {
        const key = s.nrc || s.id;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s);
    });
    return Array.from(map.entries())
        .map(([nrc, sessions]) => ({
            nrc,
            courseCode: sessions[0].courseCode,
            courseName: sessions[0].courseName,
            instructor: sessions[0].instructor,
            sessions: sessions.slice().sort((a, b) => a.startTime.localeCompare(b.startTime)),
        }))
        .sort((a, b) => a.nrc.localeCompare(b.nrc));
};

// Un mismo NRC puede tener varias filas con día/hora/aula idénticos porque el horario
// real está fragmentado por rango de fechas (ej. antes/después de un feriado); para
// mostrar no aporta repetir la fila, así que se fusionan sólo a efectos visuales
// (el import sigue usando group.sessions completo, sin deduplicar).
const dedupeForDisplay = (sessions: ProcessedSchedule[]): ProcessedSchedule[] => {
    const seen = new Set<string>();
    const result: ProcessedSchedule[] = [];
    sessions.forEach(s => {
        const key = `${s.days.join(',')}|${s.startTime}|${s.endTime}|${s.building}|${s.room}`;
        if (seen.has(key)) return;
        seen.add(key);
        result.push(s);
    });
    return result;
};

const NrcGroupCard: React.FC<{ group: NrcGroup; onImport: (sessions: ProcessedSchedule[]) => void }> = ({ group, onImport }) => (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
                <div className="flex items-center flex-wrap gap-2 mb-1">
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-black rounded uppercase tracking-wider border border-blue-100">
                        NRC: {group.nrc}
                    </span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{group.courseCode}</span>
                </div>
                <h3 className="text-xs font-bold text-slate-800 mb-1">{group.courseName}</h3>
                <div className="flex items-center text-[10px] text-slate-500">
                    <UserRound size={12} className="mr-1 text-slate-400 shrink-0" />
                    <span className="font-semibold truncate">{group.instructor || 'Sin Asignar'}</span>
                </div>
            </div>
            <button
                onClick={() => onImport(group.sessions)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-500 hover:bg-indigo-600 hover:text-white rounded-lg transition-all transform hover:scale-105 active:scale-95 border border-slate-200 hover:border-indigo-600 shadow-sm"
                title="Importar todas las sesiones de este NRC"
            >
                <Plus size={16} />
                <span className="text-[10px] font-black uppercase tracking-wide">Importar</span>
            </button>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-50 space-y-1.5">
            {dedupeForDisplay(group.sessions).map(s => (
                <div key={s.id} className="flex items-center text-[10px] text-slate-500 font-mono gap-3">
                    {s.modality === 'virtual' ? <Video size={11} className="text-slate-400 shrink-0" /> : <MapPin size={11} className="text-slate-400 shrink-0" />}
                    <span className="font-black text-slate-600 shrink-0">{s.days.join(', ')}</span>
                    <span className="shrink-0">{s.startTime}-{s.endTime}</span>
                    {s.building && <span className="truncate text-slate-400">{s.building} - {s.room}</span>}
                </div>
            ))}
        </div>
    </div>
);

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, targetInstructor }) => {
    const { searchSchedules, importScheduleToSimulation, notify, rawSchedules } = useData();
    const [mode, setMode] = useState<Mode>('bloque');

    // --- Modo Bloque ---
    const [blockQuery, setBlockQuery] = useState('');
    const [selectedBlock, setSelectedBlock] = useState<string | null>(null);

    // --- Modo NRC (búsqueda libre) ---
    const [searchTerm, setSearchTerm] = useState('');
    const [nrcResults, setNrcResults] = useState<ProcessedSchedule[]>([]);
    const [loading, setLoading] = useState(false);

    // Solo cursos reales del archivo (no administrativos, esos no tienen bloque/NRC real).
    const archive = useMemo(() => rawSchedules.filter(s => !s.isAdministrative), [rawSchedules]);

    const blockOptions = useMemo(() => {
        const q = blockQuery.trim().toUpperCase();
        if (q.length < 2) return [];
        const seen = new Map<string, { block: string; career: string; sample: string }>();
        archive.forEach(s => {
            if (!s.block || seen.has(s.block)) return;
            if (s.block.toUpperCase().includes(q) || (s.career || '').toUpperCase().includes(q) || (s.courseName || '').toUpperCase().includes(q)) {
                seen.set(s.block, { block: s.block, career: s.career, sample: s.courseName });
            }
        });
        return Array.from(seen.values()).slice(0, 20);
    }, [archive, blockQuery]);

    const blockGroups = useMemo(() => {
        if (!selectedBlock) return [];
        const rows = archive.filter(s => s.block === selectedBlock && !isAutoestudio(s));
        return groupByNrc(rows);
    }, [archive, selectedBlock]);

    const selectedBlockCareer = useMemo(() => archive.find(s => s.block === selectedBlock)?.career || '', [archive, selectedBlock]);

    React.useEffect(() => {
        const timer = setTimeout(async () => {
            if (mode === 'nrc' && searchTerm.length >= 3) {
                setLoading(true);
                try {
                    const data = await searchSchedules(searchTerm);
                    setNrcResults(data.filter(s => !isAutoestudio(s)));
                } catch (error) {
                    console.error("Search error", error);
                    setNrcResults([]);
                } finally {
                    setLoading(false);
                }
            } else {
                setNrcResults([]);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchTerm, mode, searchSchedules]);

    if (!isOpen) return null;

    const nrcGroups = groupByNrc(nrcResults);

    const handleImportGroup = (sessions: ProcessedSchedule[]) => {
        const ids = sessions.map(s => s.id);
        const count = importScheduleToSimulation(ids, targetInstructor);
        if (count > 0) {
            notify(`${count} sesión${count === 1 ? '' : 'es'} importada${count === 1 ? '' : 's'}. Ahora puedes editarlas en el horario.`, 'success');
            onClose();
        }
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
                            Elige NRC del archivo general para asignarlos a <span className="text-indigo-600">{targetInstructor}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Selector de Modo */}
                <div className="px-4 pt-4 bg-white shrink-0">
                    <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                        <button
                            onClick={() => setMode('bloque')}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${mode === 'bloque' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <LayoutGrid size={12} /> Por Bloque
                        </button>
                        <button
                            onClick={() => setMode('nrc')}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${mode === 'nrc' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <Search size={12} /> Por NRC
                        </button>
                    </div>
                </div>

                {mode === 'bloque' ? (
                    <>
                        {/* Buscador de Bloque */}
                        <div className="p-4 border-b border-slate-100 bg-white shrink-0 relative">
                            {selectedBlock ? (
                                <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Bloque Seleccionado</p>
                                        <p className="text-sm font-black text-indigo-700 truncate">{selectedBlock} <span className="text-indigo-400 font-bold">· {selectedBlockCareer}</span></p>
                                    </div>
                                    <button
                                        onClick={() => { setSelectedBlock(null); setBlockQuery(''); }}
                                        className="shrink-0 ml-3 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-wide hover:bg-indigo-100 transition-all"
                                    >
                                        Cambiar
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <input
                                            type="text"
                                            placeholder="Escribe el código del bloque, carrera o curso (min 2 caracteres)..."
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                                            value={blockQuery}
                                            onChange={(e) => setBlockQuery(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    {blockOptions.length > 0 && (
                                        <div className="absolute left-4 right-4 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto z-10 custom-scrollbar">
                                            {blockOptions.map(opt => (
                                                <button
                                                    key={opt.block}
                                                    onClick={() => { setSelectedBlock(opt.block); }}
                                                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-indigo-50 transition-colors text-left border-b border-slate-50 last:border-b-0"
                                                >
                                                    <div className="min-w-0">
                                                        <span className="text-xs font-black text-slate-700">{opt.block}</span>
                                                        <span className="text-[10px] text-slate-400 font-bold ml-2">{opt.career}</span>
                                                    </div>
                                                    <ChevronRight size={14} className="text-slate-300 shrink-0" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Resultados agrupados por NRC */}
                        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30 custom-scrollbar space-y-2">
                            {!selectedBlock ? (
                                <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                                    <LayoutGrid size={32} className="mb-2 opacity-50" />
                                    <p className="text-xs font-bold uppercase tracking-wider">Busca y selecciona un bloque</p>
                                </div>
                            ) : blockGroups.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                                    <Search size={32} className="mb-2 opacity-50" />
                                    <p className="text-xs font-bold uppercase tracking-wider text-center px-6">Este bloque no tiene NRC asignables (o todo es Autoestudio/VAEE).</p>
                                </div>
                            ) : (
                                blockGroups.map(group => <NrcGroupCard key={group.nrc} group={group} onImport={handleImportGroup} />)
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        {/* Búsqueda por NRC (modo original) */}
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

                        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30 custom-scrollbar space-y-2">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-48 text-indigo-400">
                                    <Loader2 size={32} className="mb-2 animate-spin" />
                                    <p className="text-xs font-bold uppercase tracking-wider">Buscando en Archivo...</p>
                                </div>
                            ) : nrcGroups.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                                    <Search size={32} className="mb-2 opacity-50" />
                                    <p className="text-xs font-bold uppercase tracking-wider">
                                        {searchTerm.length < 3 ? 'Ingresa al menos 3 caracteres' : 'No se encontraron resultados'}
                                    </p>
                                </div>
                            ) : (
                                nrcGroups.map(group => <NrcGroupCard key={group.nrc} group={group} onImport={handleImportGroup} />)
                            )}
                        </div>
                    </>
                )}

                {/* Footer */}
                <div className="p-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 text-center font-medium shrink-0">
                    Las sesiones de Autoestudio (VAEE) no se muestran — no se asignan a ningún instructor.
                </div>
            </div>
        </div>
    );
};

export default ImportModal;
