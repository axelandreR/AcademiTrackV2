import React from 'react';
import { AlertTriangle, Coffee, Sun, ChevronDown, ChevronUp } from 'lucide-react';
import { DailyJourneySummary } from '../services/dailyJourney';

interface DayEntry {
    key: string;
    journey: DailyJourneySummary;
}

interface DailyJourneyPanelProps {
    days: DayEntry[];
    instructorType: 'TC' | 'TP';
    // Meta semanal (46h fijas para TC, Horas Académicas del ARCHIVO para TP) contra la
    // que se compara la sumatoria de Jornada Diaria — ver hasMetaMismatch más abajo.
    weeklyMeta: number;
    timeColumnWidth: string;
    isExpanded: boolean;
    onToggleExpanded: () => void;
}

const dayHasAlert = (journey: DailyJourneySummary, instructorType: 'TC' | 'TP') =>
    journey.overTarget || journey.missingRefrigerio || (instructorType === 'TC' && journey.belowTarget && journey.hasTasks);

const DailyJourneyPanel: React.FC<DailyJourneyPanelProps> = ({ days, instructorType, weeklyMeta, timeColumnWidth, isExpanded, onToggleExpanded }) => {
    const weeklyTotal = days.reduce((sum, d) => sum + d.journey.totalHours, 0);
    // Jornada Diaria mide presencia real (incluye huecos entre bloques, ej. 1 minuto de
    // separación para evitar un cruce exacto); Auditoría suma solo la duración de cada
    // bloque. Si no coinciden, hay un hueco en el horario que no debería estar ahí — se
    // marca en rojo aunque cada día individualmente esté dentro de su límite diario.
    const hasMetaMismatch = Math.abs(weeklyTotal - weeklyMeta) > 0.01;
    const weekHasAlert = hasMetaMismatch || days.some(d => dayHasAlert(d.journey, instructorType));

    if (!isExpanded) {
        return (
            <button
                onClick={onToggleExpanded}
                title="Mostrar jornada diaria"
                className="w-full flex items-center gap-2 px-4 py-1 border-b-2 border-slate-200 bg-slate-50/70 hover:bg-slate-100 transition-colors"
            >
                <span className={`w-7 h-2.5 rounded-sm ${weekHasAlert ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Jornada Diaria</span>
                <span
                    title={hasMetaMismatch ? `No coincide con la Meta (${weeklyMeta.toFixed(2)}h) — probablemente hay un hueco entre bloques.` : undefined}
                    className={`text-[9px] font-bold ml-auto ${hasMetaMismatch ? 'text-rose-500' : 'text-slate-400'}`}
                >
                    {weeklyTotal.toFixed(2)}h sem
                </span>
                <ChevronDown size={12} className="text-slate-400" />
            </button>
        );
    }

    return (
        <div className="flex border-b-2 border-slate-200 bg-slate-50/70">
            <button
                onClick={onToggleExpanded}
                title="Ocultar jornada diaria"
                style={{ width: timeColumnWidth }}
                className="flex-shrink-0 p-2 flex flex-col items-center justify-center border-r border-slate-200 bg-slate-50 sticky left-0 z-[80] hover:bg-slate-100 transition-colors"
            >
                <div className="flex items-center space-x-1 text-slate-400"><Sun size={11} /><span className="text-[9px] font-black uppercase tracking-widest">Jornada</span><ChevronUp size={11} /></div>
                <span
                    title={hasMetaMismatch ? `No coincide con la Meta (${weeklyMeta.toFixed(2)}h) — probablemente hay un hueco entre bloques.` : undefined}
                    className={`text-[11px] font-black mt-0.5 ${hasMetaMismatch ? 'text-rose-600' : 'text-slate-700'}`}
                >
                    {weeklyTotal.toFixed(2)}h sem
                </span>
            </button>
            <div className="flex-1 grid grid-cols-7">
                {days.map(({ key, journey }) => {
                    const statusColor = journey.overTarget
                        ? 'text-rose-600'
                        : (instructorType === 'TC' && journey.belowTarget)
                            ? 'text-amber-600'
                            : 'text-emerald-600';
                    const cellBg = journey.overTarget
                        ? 'bg-rose-50'
                        : (instructorType === 'TC' && journey.belowTarget && journey.hasTasks)
                            ? 'bg-amber-50'
                            : 'bg-transparent';

                    return (
                        <div key={key} className={`p-2 border-r border-slate-200 last:border-r-0 flex flex-col items-center justify-center gap-0.5 min-h-[52px] ${cellBg}`}>
                            {!journey.hasTasks ? (
                                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Libre</span>
                            ) : (
                                <>
                                    <div className="flex items-center gap-1">
                                        {journey.missingRefrigerio && (
                                            <AlertTriangle size={11} className="text-amber-500" aria-label="Falta refrigerio" />
                                        )}
                                        {journey.hasRefrigerio && (
                                            <Coffee size={10} className="text-slate-400" aria-label="Refrigerio registrado" />
                                        )}
                                        <span className="text-[9px] font-black text-slate-400">
                                            {journey.morning.start}–{journey.hasRefrigerio ? journey.afternoon.end : journey.morning.end}
                                        </span>
                                    </div>
                                    <div className="flex gap-2 text-[9px] font-bold text-slate-500">
                                        <span>M {journey.morning.hours.toFixed(1)}h</span>
                                        {journey.hasRefrigerio && <span>T {journey.afternoon.hours.toFixed(1)}h</span>}
                                    </div>
                                    <span className={`text-sm font-black ${statusColor}`}>{journey.totalHours.toFixed(2)}h</span>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default DailyJourneyPanel;
