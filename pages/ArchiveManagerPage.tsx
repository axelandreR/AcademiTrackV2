import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { ProcessedSchedule } from '../types';
import { Search, Edit2, UserMinus, Calendar, MapPin, Clock, Filter, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ArchiveEditModal from '../components/ArchiveEditModal';
import ConfirmDialog from '../components/ConfirmDialog';

const ArchiveManagerPage: React.FC = () => {
    const { allSchedules, isLoading, saveScheduleCloud } = useData();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'academic' | 'admin'>('all');
    const [editingSchedule, setEditingSchedule] = useState<ProcessedSchedule | null>(null);
    const [pendingRemoval, setPendingRemoval] = useState<ProcessedSchedule | null>(null);
    const navigate = useNavigate();

    // Filtrado de datos
    const filteredSchedules = useMemo(() => {
        if (!searchTerm && filterType === 'all') return [];

        return allSchedules.filter(s => {
            const matchesSearch =
                s.nrc?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.courseName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.instructor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.courseCode?.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesType =
                filterType === 'all' ||
                (filterType === 'academic' && !s.isAdministrative) ||
                (filterType === 'admin' && s.isAdministrative);

            return matchesSearch && matchesType;
        });
    }, [allSchedules, searchTerm, filterType]);

    const isSearchActive = searchTerm.length > 0 || filterType !== 'all';

    const handleSave = async (updated: ProcessedSchedule) => {
        try {
            await saveScheduleCloud(updated);
            setEditingSchedule(null);
        } catch (error) {
            console.error("Error al guardar en el registro base:", error);
            alert("No se pudo guardar el cambio.");
        }
    };

    const handleRemoveInstructor = (s: ProcessedSchedule) => setPendingRemoval(s);

    const confirmRemoveInstructor = async () => {
        const s = pendingRemoval;
        setPendingRemoval(null);
        if (!s) return;
        await saveScheduleCloud({ ...s, instructor: '', instructorId: '' });
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-medium animate-pulse">Cargando Registro Base...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <ArchiveEditModal
                isOpen={!!editingSchedule}
                onClose={() => setEditingSchedule(null)}
                onSave={handleSave}
                schedule={editingSchedule}
            />

            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/')}
                            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
                        >
                            <ArrowLeft size={24} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 leading-none">Gestión de Registro Base</h1>
                            <p className="text-sm text-slate-400 font-medium mt-1">Control maestro de programación y carga académica</p>
                        </div>
                    </div>

                    <div className="flex-1 max-w-xl relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar por NRC, Instructor o Curso..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-2xl py-3 pl-12 pr-4 text-slate-900 font-medium transition-all"
                        />
                    </div>

                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setFilterType('all')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Todos
                        </button>
                        <button
                            onClick={() => setFilterType('academic')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'academic' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Académicos
                        </button>
                        <button
                            onClick={() => setFilterType('admin')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Admin
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 mt-8">
                <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-wider">NRC / ID</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-wider">Curso / Actividad</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-wider">Instructor</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-wider">Programación</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-wider">Horas Sem.</th>
                                    <th className="px-6 py-4 text-center text-xs font-black text-slate-400 uppercase tracking-wider">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredSchedules.map((s) => (
                                    <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-slate-900">{s.nrc || 'N/A'}</span>
                                                <span className="text-[10px] font-bold text-slate-400">{s.courseCode}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col max-w-xs">
                                                <span className="text-sm font-bold text-slate-700 truncate">{s.courseName}</span>
                                                <div className="flex items-center gap-1 mt-1">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${s.isAdministrative ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {s.isAdministrative ? 'Administrativo' : 'Académico'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xs">
                                                    {s.instructor?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                                </div>
                                                <span className="text-sm font-bold text-slate-600">{s.instructor || 'SIN ASIGNAR'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                                                    <Calendar size={14} className="text-blue-500" />
                                                    {s.days.join(', ')}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                                                    <Clock size={14} className="text-blue-500" />
                                                    {s.startTime} - {s.endTime}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                                                    <MapPin size={14} className="text-blue-500" />
                                                    {s.building} - {s.room}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-lg">
                                                    {s.weeklyHours.toFixed(2)}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase">H. Semanales</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => setEditingSchedule(s)}
                                                    className="p-2 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-xl transition-all"
                                                    title="Editar Bloque"
                                                >
                                                    <Edit2 size={18} />
                                                </button>
                                                {s.instructor && (
                                                    <button
                                                        onClick={() => handleRemoveInstructor(s)}
                                                        className="p-2 hover:bg-rose-50 text-rose-400 hover:text-rose-600 rounded-xl transition-all"
                                                        title="Remover Instructor"
                                                    >
                                                        <UserMinus size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredSchedules.length === 0 && (
                            <div className="py-24 flex flex-col items-center justify-center text-slate-400">
                                {!isSearchActive ? (
                                    <>
                                        <Filter size={48} className="mb-4 opacity-20 text-blue-500" />
                                        <p className="font-black text-slate-900 text-lg">Busca o filtra para comenzar</p>
                                        <p className="text-sm font-medium text-slate-400 mt-2">Ingresa un NRC, instructor o usa los botones de filtro superiores.</p>
                                    </>
                                ) : (
                                    <>
                                        <Search size={48} className="mb-4 opacity-20" />
                                        <p className="font-bold">No se encontraron bloques con esos criterios</p>
                                        <button onClick={() => { setSearchTerm(''); setFilterType('all') }} className="mt-4 text-blue-600 font-black text-sm uppercase">Limpiar filtros</button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <ConfirmDialog
                isOpen={pendingRemoval !== null}
                title="Retirar instructor"
                message={`Se retirará a ${pendingRemoval?.instructor || 'el instructor'} de este bloque. La reducción de carga se reflejará de inmediato en la auditoría.`}
                confirmLabel="Retirar"
                variant="danger"
                onCancel={() => setPendingRemoval(null)}
                onConfirm={confirmRemoveInstructor}
            />
        </div>
    );
};

export default ArchiveManagerPage;
