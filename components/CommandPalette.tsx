
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Search, MapPin, User, Layers, Hash, Book,
    ChevronRight, Calculator, AlertTriangle, CheckCircle,
    Command as CommandIcon, X, ShieldAlert, ShieldCheck
} from 'lucide-react';
import { ProcessedSchedule, Instructor, ViewType, RoomData } from '../types';

export interface SearchItem {
    id: string;
    label: string;
    description: string;
    type: 'instructor' | 'room' | 'block' | 'nrc' | 'audit';
    viewType?: ViewType;
    filterValue?: string;
    instructorId?: string; // Solo para type 'instructor'/'nrc' — ID real del instructor
    auditStatus?: 'deficit' | 'excess' | 'perfect';
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (item: SearchItem) => void;
    allSchedules: ProcessedSchedule[];
    instructors: Instructor[];
    rooms: RoomData[];
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
    isOpen,
    onClose,
    onSelect,
    allSchedules,
    instructors,
    rooms
}) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    }, [isOpen]);

    const searchableItems = useMemo(() => {
        const items: SearchItem[] = [];

        // 1. Docentes
        instructors.forEach(inst => {
            items.push({
                id: `inst-${inst.id}`,
                label: inst.name,
                description: `${inst.type} | ${inst.specialty}`,
                type: 'instructor',
                viewType: 'Instructor',
                filterValue: inst.name,
                instructorId: inst.id
            });
        });

        // 2. Aulas (Únicas)
        const uniqueRooms = new Set<string>();
        allSchedules.forEach(s => {
            if (s.isAdministrative) return;
            const roomKey = `${s.building} - ${s.room}`;
            if (!uniqueRooms.has(roomKey)) {
                uniqueRooms.add(roomKey);
                items.push({
                    id: `room-${roomKey}`,
                    label: roomKey,
                    description: 'Ambiente Físico',
                    type: 'room',
                    viewType: 'Aula',
                    filterValue: roomKey
                });
            }
        });

        // 3. Bloques (Únicos)
        const uniqueBlocks = new Set<string>();
        allSchedules.forEach(s => {
            if (s.isAdministrative) return;
            if (!uniqueBlocks.has(s.block)) {
                uniqueBlocks.add(s.block);
                items.push({
                    id: `block-${s.block}`,
                    label: s.block,
                    description: `Bloque / Sección (${s.career})`,
                    type: 'block',
                    viewType: 'Bloque',
                    filterValue: s.block
                });
            }
        });

        // 4. NRCs
        const uniqueNrcs = new Set<string>();
        allSchedules.forEach(s => {
            if (s.isAdministrative) return;
            if (!uniqueNrcs.has(s.nrc)) {
                uniqueNrcs.add(s.nrc);
                items.push({
                    id: `nrc-${s.nrc}`,
                    label: `NRC ${s.nrc}`,
                    description: `${s.courseName} | ${s.instructor}`,
                    type: 'nrc',
                    viewType: 'Instructor',
                    filterValue: s.instructor,
                    instructorId: s.instructorId
                });
            }
        });

        // 5. Atajos de Auditoría
        items.push({
            id: 'audit-deficit',
            label: 'Auditoría: Ver Docentes con Observaciones',
            description: 'Filtrar por carga incompleta o exceso de jornada diaria',
            type: 'audit',
            auditStatus: 'deficit'
        });
        items.push({
            id: 'audit-perfect',
            label: 'Auditoría: Ver Cargas Completas (OK)',
            description: 'Filtrar por docentes que cumplen sus horas meta',
            type: 'audit',
            auditStatus: 'perfect'
        });

        return items;
    }, [instructors, allSchedules]);

    const filteredItems = useMemo(() => {
        if (!query) return searchableItems.slice(0, 10); // Mostrar top 10 por defecto

        const q = query.toLowerCase();
        return searchableItems.filter(item =>
            item.label.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.type.toLowerCase().includes(q)
        ).slice(0, 20); // Limitar a 20 resultados
    }, [query, searchableItems]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % filteredItems.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
            } else if (e.key === 'Enter') {
                if (filteredItems[selectedIndex]) {
                    onSelect(filteredItems[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, filteredItems, selectedIndex, onSelect, onClose]);

    // Asegurar que el elemento seleccionado sea visible al hacer scroll
    useEffect(() => {
        if (scrollContainerRef.current) {
            const selectedElement = scrollContainerRef.current.children[selectedIndex] as HTMLElement;
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex]);

    if (!isOpen) return null;

    const getItemIcon = (type: string) => {
        switch (type) {
            case 'instructor': return <User size={18} />;
            case 'room': return <MapPin size={18} />;
            case 'block': return <Layers size={18} />;
            case 'nrc': return <Hash size={18} />;
            case 'audit': return <Calculator size={18} />;
            default: return <Book size={18} />;
        }
    };

    return (
        <div className="fixed inset-0 z-[500] flex items-start justify-center pt-[15vh] px-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Buscador */}
                <div className="relative border-b border-slate-100 flex items-center px-6 py-5 bg-slate-50/50">
                    <Search className="text-slate-400 mr-4" size={22} />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Busca por docente, aula, bloque, NRC o comando..."
                        className="flex-1 bg-transparent border-none outline-none text-lg font-bold text-slate-900 placeholder:text-slate-400"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-black text-slate-400 bg-white border border-slate-200 px-2 py-1 rounded-lg shadow-sm">ESC</span>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Resultados */}
                <div
                    ref={scrollContainerRef}
                    className="max-h-[50vh] overflow-y-auto custom-scrollbar p-2"
                >
                    {filteredItems.length > 0 ? (
                        filteredItems.map((item, idx) => (
                            <button
                                key={item.id}
                                onClick={() => onSelect(item)}
                                onMouseEnter={() => setSelectedIndex(idx)}
                                className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group ${idx === selectedIndex
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                    : 'hover:bg-slate-50 text-slate-600'
                                    }`}
                            >
                                <div className="flex items-center space-x-4">
                                    <div className={`p-2.5 rounded-xl transition-colors ${idx === selectedIndex ? 'bg-white/20' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:shadow-sm'
                                        }`}>
                                        {getItemIcon(item.type)}
                                    </div>
                                    <div className="text-left">
                                        <p className={`text-sm font-black leading-tight uppercase tracking-tight ${idx === selectedIndex ? 'text-white' : 'text-slate-900'}`}>{item.label}</p>
                                        <p className={`text-[10px] font-bold mt-0.5 uppercase tracking-widest ${idx === selectedIndex ? 'text-indigo-100' : 'text-slate-400'}`}>{item.description}</p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-3">
                                    {item.type === 'audit' && (
                                        <div className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase ${idx === selectedIndex ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-600'
                                            }`}>
                                            COMANDO
                                        </div>
                                    )}
                                    <ChevronRight size={16} className={`${idx === selectedIndex ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'} transition-all`} />
                                </div>
                            </button>
                        ))
                    ) : (
                        <div className="py-20 text-center">
                            <div className="p-4 bg-slate-50 rounded-full w-fit mx-auto mb-4 text-slate-300">
                                <Search size={32} />
                            </div>
                            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No se encontraron resultados</p>
                            <p className="text-[10px] font-bold text-slate-300 mt-2">Prueba con otro término de búsqueda</p>
                        </div>
                    )}
                </div>

                {/* Footer del Palette */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-1.5 grayscale opacity-50">
                            <span className="text-[9px] font-black p-1 bg-white border rounded shadow-sm">↑↓</span>
                            <span className="text-[9px] font-black uppercase">Navegar</span>
                        </div>
                        <div className="flex items-center space-x-1.5 grayscale opacity-50">
                            <span className="text-[9px] font-black p-1 bg-white border rounded shadow-sm">ENTER</span>
                            <span className="text-[9px] font-black uppercase">Seleccionar</span>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 text-indigo-600">
                        <CommandIcon size={14} />
                        <span className="text-[9px] font-black uppercase tracking-widest">AcademiTrack Search</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommandPalette;
