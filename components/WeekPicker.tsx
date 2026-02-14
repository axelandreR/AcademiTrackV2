
import React from 'react';
import { Calendar as CalendarIcon, Check } from 'lucide-react';

interface WeekPickerProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    currentWeekStart: Date;
    setCurrentWeekStart: (date: Date) => void;
    semesterWeeks: { start: Date; label: string }[];
    pickerRef: React.RefObject<HTMLDivElement>;
}

const WeekPicker: React.FC<WeekPickerProps> = ({
    isOpen,
    setIsOpen,
    currentWeekStart,
    setCurrentWeekStart,
    semesterWeeks,
    pickerRef
}) => {
    return (
        <div className="relative" ref={pickerRef}>
            <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className={`p-1.5 border rounded-lg transition-all active:scale-95 flex items-center space-x-2 ${isOpen ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200'}`}
                title="Seleccionar Semana"
            >
                <CalendarIcon size={18} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[200] overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-right">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Semestralización</span>
                        <span className="text-[9px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">{semesterWeeks.length} SEMANAS</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto custom-scrollbar p-2">
                        {semesterWeeks.map((week, idx) => {
                            const isActive = currentWeekStart.getTime() === week.start.getTime();
                            return (
                                <button
                                    key={idx}
                                    onClick={(e) => { e.stopPropagation(); setCurrentWeekStart(week.start); setIsOpen(false); }}
                                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-600'}`}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-tighter">Semana {idx + 1}</span>
                                        <span className={`text-[11px] font-bold ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>{week.label}</span>
                                    </div>
                                    {isActive && <Check size={16} />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default WeekPicker;
