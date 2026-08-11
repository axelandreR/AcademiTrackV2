import React from 'react';
import { X, Building2, Users, AlertTriangle, TrendingDown, MapPin } from 'lucide-react';
import { RoomOccupancySummary, FrequencyKey, TurnoBucketKey } from '../../services/occupancyCalculations';
import { DAYS_OF_WEEK } from '../../constants';
import OccupancyBarChart from './OccupancyBarChart';

interface OccupancyDetailPanelProps {
    summary: RoomOccupancySummary | null;
    onClose: () => void;
    onGoToConflicts: () => void;
}

const FREQ_ORDER: { key: FrequencyKey; label: string }[] = [
    { key: 'weekday', label: 'Lunes-Viernes' },
    { key: 'weekend', label: 'Sábado-Domingo' },
    { key: 'general', label: 'General' },
];
const TURNO_ORDER: { key: TurnoBucketKey; label: string }[] = [
    { key: 'manana', label: 'Mañana' },
    { key: 'tarde', label: 'Tarde' },
    { key: 'noche', label: 'Noche' },
    { key: 'allday', label: 'Todo el día' },
];

const UNDERUTILIZED_THRESHOLD = 30;

const cellColor = (pct: number) => {
    if (pct > 100.01) return 'text-rose-600';
    if (pct < UNDERUTILIZED_THRESHOLD) return 'text-slate-400';
    return 'text-indigo-700';
};

const OccupancyDetailPanel: React.FC<OccupancyDetailPanelProps> = ({ summary, onClose, onGoToConflicts }) => {
    if (!summary) return null;

    const isUnderutilized = summary.overallPct < UNDERUTILIZED_THRESHOLD;
    const weekdayChartData = DAYS_OF_WEEK.map(d => ({ label: d.label.slice(0, 3), pct: summary.byWeekday[d.key].occupancyPct }));
    const turnoChartData = TURNO_ORDER.filter(t => t.key !== 'allday').map(t => ({ label: t.label, pct: summary.matrix.general[t.key].occupancyPct }));

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-100">
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100"><Building2 size={22} /></div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">{summary.building} - {summary.room}</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{summary.type} · {summary.career}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><X size={22} className="text-slate-400" /></button>
                </div>

                <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 flex items-center gap-3">
                            <Users size={18} className="text-slate-400" />
                            <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Aforo</p><p className="text-lg font-black text-slate-900">{summary.capacity}</p></div>
                        </div>
                        <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 flex items-center gap-3">
                            <MapPin size={18} className="text-slate-400" />
                            <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Edificio</p><p className="text-lg font-black text-slate-900">{summary.building}</p></div>
                        </div>
                        <div className="bg-indigo-50 rounded-3xl p-5 border border-indigo-100 flex items-center gap-3">
                            <div><p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Ocupación General</p><p className="text-lg font-black text-indigo-700">{summary.overallPct.toFixed(1)}%</p></div>
                        </div>
                    </div>

                    {summary.hasOverbooking && (
                        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 flex items-start gap-3">
                            <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-black text-rose-700 uppercase tracking-wide">Posible doble reserva</p>
                                <p className="text-xs text-rose-600 font-medium mt-1">Alguna franja supera el 100% — no es "mucha demanda", es un cruce de horarios en la misma aula. Revísalo en el radar de conflictos.</p>
                                <button onClick={onGoToConflicts} className="mt-3 text-[10px] font-black uppercase tracking-widest text-rose-700 hover:text-rose-900 underline">Ir a Conflictos →</button>
                            </div>
                        </div>
                    )}
                    {!summary.hasOverbooking && isUnderutilized && (
                        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex items-start gap-3">
                            <TrendingDown size={18} className="text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-black text-amber-700 uppercase tracking-wide">Aula subutilizada</p>
                                <p className="text-xs text-amber-600 font-medium mt-1">Menos del {UNDERUTILIZED_THRESHOLD}% de ocupación en el semestre — candidata a reasignar o consolidar carga.</p>
                            </div>
                        </div>
                    )}

                    <div>
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Matriz de Ocupación</h4>
                        <div className="overflow-x-auto rounded-2xl border border-slate-100">
                            <table className="w-full text-center border-collapse">
                                <thead>
                                    <tr className="bg-slate-50">
                                        <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Turno</th>
                                        {FREQ_ORDER.map(f => (
                                            <th key={f.key} className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{f.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {TURNO_ORDER.map(t => (
                                        <tr key={t.key} className={t.key === 'allday' ? 'bg-slate-50/60' : ''}>
                                            <td className="px-4 py-3 text-left text-xs font-black text-slate-600 uppercase">{t.label}</td>
                                            {FREQ_ORDER.map(f => {
                                                const cell = summary.matrix[f.key][t.key];
                                                return (
                                                    <td key={f.key} className="px-4 py-3">
                                                        <div className={`text-base font-black ${cellColor(cell.occupancyPct)}`}>{cell.occupancyPct.toFixed(1)}%</div>
                                                        <div className="text-[9px] font-bold text-slate-400">{cell.usedHours.toFixed(1)}h / {cell.availableHours.toFixed(0)}h</div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Ocupación por Día de Semana</h4>
                            <div className="bg-white rounded-2xl border border-slate-100 p-4">
                                <OccupancyBarChart data={weekdayChartData} orientation="vertical" />
                            </div>
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Ocupación por Turno (General)</h4>
                            <div className="bg-white rounded-2xl border border-slate-100 p-4">
                                <OccupancyBarChart data={turnoChartData} orientation="horizontal" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OccupancyDetailPanel;
