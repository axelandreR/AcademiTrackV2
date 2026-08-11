import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Building2, FileDown, AlertTriangle, TrendingDown, ArrowUpDown, CalendarRange, Clock, Pencil, Filter, Check } from 'lucide-react';
import { useData } from '../context/DataContext';
import { parseLocalDBDate } from '../context/DataContext';
import { calculateAllRoomsOccupancy, RoomOccupancySummary, OccupancyAvailability, DEFAULT_OCCUPANCY_AVAILABILITY } from '../services/occupancyCalculations';
import { generateOccupancyExcel } from '../services/excelExporter';
import { SEMESTER_START_DATE, SEMESTER_END_DATE } from '../constants';
import OccupancyDetailPanel from '../components/occupancy/OccupancyDetailPanel';
import OccupancyAvailabilityModal from '../components/occupancy/OccupancyAvailabilityPanel';
import OccupancyRangeModal from '../components/occupancy/OccupancyRangePanel';

const toInputDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const UNDERUTILIZED_THRESHOLD = 30;

const OccupancyPage: React.FC = () => {
    const navigate = useNavigate();
    const { rooms, allSchedules, holidays, settings, updateAppSetting, notify } = useData();

    const [search, setSearch] = useState('');
    const [buildingFilter, setBuildingFilter] = useState('');
    const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
    const [isTypeFilterOpen, setIsTypeFilterOpen] = useState(false);
    const [quickFilter, setQuickFilter] = useState<'all' | 'underutilized' | 'overbooked'>('all');
    const [sortDesc, setSortDesc] = useState(true);
    const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
    const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);

    const toggleTypeFilter = (type: string) => {
        setTypeFilters(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type); else next.add(type);
            return next;
        });
    };

    // Mismo fin de semestre configurable que usa el resto de reportes (settings.semester_end_date)
    // — se usa como default del rango de Ocupabilidad mientras no se configure uno propio.
    const semesterEnd = useMemo(() => {
        const raw = settings['semester_end_date'];
        return raw ? new Date(raw) : new Date(SEMESTER_END_DATE);
    }, [settings]);

    // Rango de fechas propio del reporte de Ocupabilidad — por defecto todo el semestre,
    // pero acotable (ej. semanas de cierre/exámenes con poca carga arrastran el promedio
    // de todo el periodo si se incluyen).
    const rangeStartStr = settings['occupancy_range_start'] || toInputDate(SEMESTER_START_DATE);
    const rangeEndStr = settings['occupancy_range_end'] || toInputDate(semesterEnd);
    const rangeStart = useMemo(() => parseLocalDBDate(rangeStartStr), [rangeStartStr]);
    const rangeEnd = useMemo(() => parseLocalDBDate(rangeEndStr), [rangeEndStr]);

    const handleSaveRange = async (start: string, end: string) => {
        try {
            await Promise.all([
                updateAppSetting('occupancy_range_start', start),
                updateAppSetting('occupancy_range_end', end),
            ]);
            notify('Rango del periodo actualizado.', 'success');
        } catch (e: any) {
            notify('Error al guardar el rango: ' + e.message, 'error');
        }
    };

    // Ventana de disponibilidad de aulas (Lunes-Viernes / Sábado / Domingo por separado —
    // domingo suele cortar más temprano), configurable desde el panel de arriba — antes
    // era fija 07:00-22:00 igual todos los días.
    const availability: OccupancyAvailability = useMemo(() => ({
        weekday: {
            start: settings['occupancy_weekday_start'] || DEFAULT_OCCUPANCY_AVAILABILITY.weekday.start,
            end: settings['occupancy_weekday_end'] || DEFAULT_OCCUPANCY_AVAILABILITY.weekday.end,
        },
        saturday: {
            start: settings['occupancy_saturday_start'] || DEFAULT_OCCUPANCY_AVAILABILITY.saturday.start,
            end: settings['occupancy_saturday_end'] || DEFAULT_OCCUPANCY_AVAILABILITY.saturday.end,
        },
        sunday: {
            start: settings['occupancy_sunday_start'] || DEFAULT_OCCUPANCY_AVAILABILITY.sunday.start,
            end: settings['occupancy_sunday_end'] || DEFAULT_OCCUPANCY_AVAILABILITY.sunday.end,
        },
    }), [settings]);

    const handleSaveAvailability = async (next: OccupancyAvailability) => {
        try {
            await Promise.all([
                updateAppSetting('occupancy_weekday_start', next.weekday.start),
                updateAppSetting('occupancy_weekday_end', next.weekday.end),
                updateAppSetting('occupancy_saturday_start', next.saturday.start),
                updateAppSetting('occupancy_saturday_end', next.saturday.end),
                updateAppSetting('occupancy_sunday_start', next.sunday.start),
                updateAppSetting('occupancy_sunday_end', next.sunday.end),
            ]);
            notify('Disponibilidad de aulas actualizada.', 'success');
        } catch (e: any) {
            notify('Error al guardar la disponibilidad: ' + e.message, 'error');
        }
    };

    const summaries = useMemo(
        () => calculateAllRoomsOccupancy(rooms, allSchedules, holidays, rangeStart, rangeEnd, availability),
        [rooms, allSchedules, holidays, rangeStart, rangeEnd, availability]
    );

    const buildings = useMemo(() => Array.from(new Set(rooms.map(r => r.building))).filter(Boolean).sort(), [rooms]);
    const types = useMemo(() => Array.from(new Set(rooms.map(r => r.type))).filter(Boolean).sort(), [rooms]);

    const filtered = useMemo(() => {
        return summaries
            .filter(s =>
                (!search || s.room.toLowerCase().includes(search.toLowerCase()) || s.building.toLowerCase().includes(search.toLowerCase()) || s.career.toLowerCase().includes(search.toLowerCase())) &&
                (!buildingFilter || s.building === buildingFilter) &&
                (typeFilters.size === 0 || typeFilters.has(s.type)) &&
                (quickFilter === 'all' || (quickFilter === 'underutilized' && s.overallPct < UNDERUTILIZED_THRESHOLD && s.overallPct > 0) || (quickFilter === 'overbooked' && s.hasOverbooking))
            )
            .sort((a, b) => sortDesc ? b.overallPct - a.overallPct : a.overallPct - b.overallPct);
    }, [summaries, search, buildingFilter, typeFilters, quickFilter, sortDesc]);

    const underutilized = useMemo(() => summaries.filter(s => s.overallPct < UNDERUTILIZED_THRESHOLD && s.overallPct > 0), [summaries]);
    const overbooked = useMemo(() => summaries.filter(s => s.hasOverbooking), [summaries]);
    const avgOccupancy = useMemo(() => summaries.length ? summaries.reduce((sum, s) => sum + s.overallPct, 0) / summaries.length : 0, [summaries]);

    const selectedSummary: RoomOccupancySummary | null = selectedRoomKey ? summaries.find(s => s.roomKey === selectedRoomKey) || null : null;

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const blob = await generateOccupancyExcel(filtered);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Ocupabilidad_Aulas_${new Date().toISOString().split('T')[0]}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e: any) {
            alert('Error al generar el reporte: ' + e.message);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col h-screen overflow-hidden">
            <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-[100] shadow-sm">
                <div className="flex items-center space-x-6">
                    <button onClick={() => navigate('/')} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl text-white bg-indigo-600"><Building2 size={20} /></div>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Ocupabilidad de Aulas</h1>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
                                Del {rangeStart.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })} al {rangeEnd.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input type="text" placeholder="Buscar aula..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm font-bold w-56 focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <select value={buildingFilter} onChange={e => setBuildingFilter(e.target.value)} className="px-3 py-2 bg-slate-100 border-none rounded-xl text-xs font-bold text-slate-600">
                        <option value="">Todos los edificios</option>
                        {buildings.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="flex items-center space-x-2 px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50"
                    >
                        <FileDown size={16} /><span>{isExporting ? 'Generando...' : 'Excel'}</span>
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-auto p-8 space-y-6">
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => setIsRangeModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm"
                    >
                        <CalendarRange size={16} className="text-indigo-500 shrink-0" />
                        <span>Rango: {rangeStart.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' })} - {rangeEnd.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                        <Pencil size={12} className="text-slate-300 shrink-0" />
                    </button>
                    <button
                        onClick={() => setIsAvailabilityModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 hover:border-cyan-300 hover:text-cyan-600 transition-all shadow-sm"
                    >
                        <Clock size={16} className="text-cyan-500 shrink-0" />
                        <span>Disponibilidad: Lun-Vie {availability.weekday.start}-{availability.weekday.end} · Sáb {availability.saturday.start}-{availability.saturday.end} · Dom {availability.sunday.start}-{availability.sunday.end}</span>
                        <Pencil size={12} className="text-slate-300 shrink-0" />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aulas Activas</p>
                        <h4 className="text-3xl font-black text-slate-900 mt-1">{summaries.length}</h4>
                    </div>
                    <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ocupación Promedio</p>
                        <h4 className="text-3xl font-black text-indigo-600 mt-1">{avgOccupancy.toFixed(1)}%</h4>
                    </div>
                    <button
                        onClick={() => setQuickFilter(v => v === 'underutilized' ? 'all' : 'underutilized')}
                        className={`p-6 rounded-[32px] shadow-sm border text-left hover:-translate-y-0.5 transition-transform ${quickFilter === 'underutilized' ? 'bg-amber-100 border-amber-300 ring-2 ring-amber-300' : 'bg-amber-50 border-amber-100'}`}
                    >
                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1"><TrendingDown size={12} /> Subutilizadas (&lt;{UNDERUTILIZED_THRESHOLD}%)</p>
                        <h4 className="text-3xl font-black text-amber-600 mt-1">{underutilized.length}</h4>
                    </button>
                    <button
                        onClick={() => setQuickFilter(v => v === 'overbooked' ? 'all' : 'overbooked')}
                        className={`p-6 rounded-[32px] shadow-sm border text-left hover:-translate-y-0.5 transition-transform ${quickFilter === 'overbooked' ? 'bg-rose-100 border-rose-300 ring-2 ring-rose-300' : 'bg-rose-50 border-rose-100'}`}
                    >
                        <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1"><AlertTriangle size={12} /> Con Posible Cruce</p>
                        <h4 className="text-3xl font-black text-rose-600 mt-1">{overbooked.length}</h4>
                    </button>
                </div>

                <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aula</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest relative">
                                    <button
                                        onClick={() => setIsTypeFilterOpen(v => !v)}
                                        className={`flex items-center gap-1.5 transition-colors ${typeFilters.size > 0 ? 'text-indigo-600' : 'hover:text-indigo-600'}`}
                                    >
                                        Tipo
                                        <Filter size={11} />
                                        {typeFilters.size > 0 && (
                                            <span className="bg-indigo-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-black normal-case">{typeFilters.size}</span>
                                        )}
                                    </button>

                                    {isTypeFilterOpen && (
                                        <>
                                            <button
                                                aria-label="Cerrar filtro"
                                                onClick={() => setIsTypeFilterOpen(false)}
                                                className="fixed inset-0 z-[90] cursor-default"
                                            />
                                            <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[95] normal-case overflow-hidden">
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Filtrar por Tipo</span>
                                                    {typeFilters.size > 0 && (
                                                        <button onClick={() => setTypeFilters(new Set())} className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest">
                                                            Limpiar
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="max-h-72 overflow-y-auto custom-scrollbar py-1">
                                                    {types.map(t => {
                                                        const checked = typeFilters.has(t);
                                                        return (
                                                            <button
                                                                key={t}
                                                                onClick={() => toggleTypeFilter(t)}
                                                                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 transition-colors text-left"
                                                            >
                                                                <span className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                                                                    {checked && <Check size={11} className="text-white" strokeWidth={3} />}
                                                                </span>
                                                                <span className="text-xs font-bold text-slate-600 normal-case">{t}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Carrera</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aforo</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <button onClick={() => setSortDesc(v => !v)} className="flex items-center gap-1 hover:text-indigo-600 transition-colors">
                                        Ocupación General <ArrowUpDown size={12} />
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filtered.map(s => (
                                <tr key={s.roomKey} onClick={() => setSelectedRoomKey(s.roomKey)} className="hover:bg-slate-50 transition-colors cursor-pointer group">
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{s.building} - {s.room}</div>
                                        {s.hasOverbooking && <span className="text-[9px] font-black text-rose-500 uppercase tracking-wide flex items-center gap-1 mt-0.5"><AlertTriangle size={10} /> Posible cruce</span>}
                                    </td>
                                    <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{s.type}</td>
                                    <td className="px-6 py-4 text-xs font-bold text-slate-500">{s.career}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-500">{s.capacity}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-[140px]">
                                                <div
                                                    className={`h-full rounded-full ${s.hasOverbooking ? 'bg-rose-500' : s.overallPct < UNDERUTILIZED_THRESHOLD ? 'bg-amber-400' : 'bg-indigo-500'}`}
                                                    style={{ width: `${Math.min(100, s.overallPct)}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-black text-slate-700 w-12 text-right">{s.overallPct.toFixed(1)}%</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr><td colSpan={5} className="px-6 py-10 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">Sin aulas para los filtros seleccionados.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>

            <OccupancyDetailPanel
                summary={selectedSummary}
                onClose={() => setSelectedRoomKey(null)}
                onGoToConflicts={() => navigate('/reports')}
            />

            <OccupancyRangeModal
                isOpen={isRangeModalOpen}
                onClose={() => setIsRangeModalOpen(false)}
                rangeStart={rangeStartStr}
                rangeEnd={rangeEndStr}
                onSave={handleSaveRange}
            />

            <OccupancyAvailabilityModal
                isOpen={isAvailabilityModalOpen}
                onClose={() => setIsAvailabilityModalOpen(false)}
                availability={availability}
                onSave={handleSaveAvailability}
            />
        </div>
    );
};

export default OccupancyPage;
