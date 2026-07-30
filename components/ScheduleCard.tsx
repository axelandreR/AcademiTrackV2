
import React from 'react';
import { Link2Off, Trash2, Hash, MapPin, Video, Clock } from 'lucide-react';
import { ProcessedSchedule, ViewType } from '../types';
import { getShortLabel } from '../constants';

interface ScheduleCardProps {
    sched: ProcessedSchedule;
    day: { key: string; date: Date };
    isHolidayDay: boolean;
    isInstructorView: boolean;
    isOverlapping: boolean;
    getPosition: (time: string) => number;
    getDurationHeight: (start: string, end: string) => number;
    onEditRecord?: (record: ProcessedSchedule) => void;
    onDeleteRecord?: (id: string) => void;
    onIndividualizeTask?: (id: string, targetDate: Date) => void;
    onNavigate?: (type: ViewType, filter: string, instructorId?: string) => void;
    isExtra?: boolean;
}

const ScheduleCard: React.FC<ScheduleCardProps> = ({
    sched,
    day,
    isHolidayDay,
    isInstructorView,
    isOverlapping,
    getPosition,
    getDurationHeight,
    onEditRecord,
    onDeleteRecord,
    onIndividualizeTask,
    onNavigate,
    isExtra,
}) => {
    const timeToMinutes = (t: string) => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    const getCategoryStyles = (sched: ProcessedSchedule, isHolidayDay: boolean) => {
        if (isExtra) return 'bg-slate-200 border-slate-300 text-slate-500';
        const { category, modality, meetingType, activity } = sched;
        const isAutoestudio = meetingType === 'VAEE' || (activity && activity.toUpperCase().includes('AUTOESTUDIO'));
        if (sched.isAdministrative && isHolidayDay) return 'bg-rose-50 border-rose-300 border-dashed text-rose-700 opacity-60';
        switch (category) {
            case 'asincrona': return modality === 'presencial' ? 'bg-[#93bc81] border-[#7a9d6b] text-white' : 'bg-[#e4f4dd] border-[#93bc81] text-[#2d4a2d]';
            case 'preparacion': return modality === 'presencial' ? 'bg-[#EABC2D] border-[#c09a25] text-white' : 'bg-[#FFFA48] border-[#eabc2d] text-[#4a4600]';
            case 'por_asignar': return 'bg-violet-50 border-violet-200 text-violet-700';
            case 'refrigerio': return 'bg-slate-400 border-slate-500 text-white';
            case 'coordinador': return 'bg-[#e6fcf5] border-[#63e6be] text-[#087f5b]';
            case 'clase':
            default:
                if (isAutoestudio) return 'bg-slate-200 border-slate-300 text-slate-700';
                return 'bg-[#D9FFFF] border-cyan-200 text-slate-800';
        }
    };

    const catColor = getCategoryStyles(sched, isHolidayDay);
    const isAutoestudio = sched.meetingType === 'VAEE' || (sched.activity && sched.activity.toUpperCase().includes('AUTOESTUDIO'));
    const durationHours = (timeToMinutes(sched.endTime) - timeToMinutes(sched.startTime)) / 60;
    const isLargeBlock = durationHours >= 1.5;
    const overlapClass = isOverlapping ? 'animate-overlap-error' : '';

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`${sched.courseName}, ${sched.startTime} a ${sched.endTime}${sched.instructor ? `, ${sched.instructor}` : ''}${sched.building ? `, ${sched.building} - ${sched.room}` : ''}`}
            className={`absolute left-[5px] right-[5px] p-2.5 rounded-2xl border-l-[6px] shadow-lg overflow-hidden transition-all hover:scale-[1.015] hover:z-[60] cursor-pointer flex flex-col group z-30 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:z-[60] ${catColor} ${overlapClass}`}
            style={{ top: `${getPosition(sched.startTime)}rem`, height: `${getDurationHeight(sched.startTime, sched.endTime)}rem`, margin: '1px 0' }}
            onClick={(e) => { e.stopPropagation(); onEditRecord?.(sched); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onEditRecord?.(sched); } }}
        >
            <div className="absolute top-1.5 right-1.5 flex space-x-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 z-[80] transition-opacity">
                {(sched.isAdministrative || sched.courseName === 'REV Y CALIF CUADERNOS INFORME' || isHolidayDay) && onIndividualizeTask && sched.startDate.getTime() !== sched.endDate.getTime() && (
                    <button onClick={(e) => { e.stopPropagation(); onIndividualizeTask(sched.id, day.date); }} className="p-1.5 bg-black/5 hover:bg-blue-600 hover:text-white rounded-lg transition-all" title="Individualizar (Desencadenar)"><Link2Off size={12} /></button>
                )}
                {(sched.isAdministrative || sched.courseName === 'REV Y CALIF CUADERNOS INFORME' || isHolidayDay) && onDeleteRecord && (
                    <button onClick={(e) => { e.stopPropagation(); onDeleteRecord(sched.id); }} className="p-1.5 bg-black/5 hover:bg-rose-500 hover:text-white rounded-lg transition-all" title="Eliminar" aria-label={`Eliminar ${sched.courseName}`}><Trash2 size={12} /></button>
                )}
            </div>
            {!sched.isAdministrative ? (
                <>
                    <div className="flex justify-between items-center font-black uppercase text-[8px] opacity-80 mb-1 shrink-0">
                        <span role="link" tabIndex={0} aria-label={`Ver bloque ${sched.block}`} onClick={(e) => { e.stopPropagation(); onNavigate?.('Bloque', sched.block); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onNavigate?.('Bloque', sched.block); } }} className="flex items-center hover:underline focus:outline-none focus:ring-2 focus:ring-blue-600 rounded"><Hash size={8} className="mr-1" />NRC: {sched.nrc} • {sched.block}</span>
                        <div className="flex items-center space-x-1">
                            {isExtra && <span className="bg-slate-900 text-white px-1 rounded mr-1">EXTRAS</span>}
                            {sched.modality === 'presencial' ? <MapPin size={9} /> : <Video size={9} />}
                            <span>{sched.modality?.toUpperCase()}</span>
                        </div>
                    </div>
                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden mb-1">
                        <h4 onClick={(e) => { e.stopPropagation(); onNavigate?.('Bloque', sched.block); }} className={`font-black leading-tight text-slate-900 whitespace-normal break-words hover:underline cursor-pointer xl:text-sm lg:text-[11px] text-[10px]`}>
                            {isAutoestudio ? `${sched.courseName} (AUTOESTUDIO)` : sched.courseName}
                            {isInstructorView && sched.activity && (
                                <span className="ml-1.5 text-[8px] font-black bg-slate-900/10 text-slate-600 px-1 py-0.5 rounded-md align-middle">{sched.activity}</span>
                            )}
                        </h4>
                        {!isInstructorView && (
                            <div className="flex flex-col mt-0.5">
                                <div role="link" tabIndex={0} aria-label={`Ver horario de ${sched.instructor}`} onClick={(e) => { e.stopPropagation(); onNavigate?.('Instructor', sched.instructor, sched.instructorId); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onNavigate?.('Instructor', sched.instructor, sched.instructorId); } }} className={`font-bold text-slate-500 whitespace-normal break-words hover:underline hover:text-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 rounded ${isLargeBlock ? 'text-[12px] mt-1' : 'text-[9px]'}`}>
                                    {sched.instructor}
                                </div>
                                {sched.activity && (
                                    <div className={`mt-0.5 font-black text-indigo-600 uppercase tracking-tighter ${isLargeBlock ? 'text-[10px]' : 'text-[8px]'}`}>
                                        TIPO: {sched.activity}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className={`flex items-center flex-wrap gap-2 mt-auto pt-1 shrink-0 ${isLargeBlock ? 'justify-between' : ''}`}>
                            <div role="link" tabIndex={0} aria-label={`Ver ambiente ${sched.building} - ${sched.room}`} onClick={(e) => { e.stopPropagation(); onNavigate?.('Aula', `${sched.building} - ${sched.room}`); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onNavigate?.('Aula', `${sched.building} - ${sched.room}`); } }} className={`font-black text-slate-700 uppercase flex items-center hover:underline focus:outline-none focus:ring-2 focus:ring-blue-600 rounded ${isLargeBlock ? 'text-[11px]' : 'text-[9px]'}`}><MapPin size={isLargeBlock ? 12 : 9} className="mr-1 shrink-0" /><span className="whitespace-nowrap">{sched.building} - {sched.room}</span></div>
                            <div className={`font-black text-slate-500 flex items-center shrink-0 ${isLargeBlock ? 'text-[11px]' : 'text-[9px]'}`}><Clock size={isLargeBlock ? 12 : 9} className="mr-1" /><span className="whitespace-nowrap">{sched.startTime}-{sched.endTime}</span></div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col h-full items-center justify-center text-center px-1">
                    <h4 className="font-black leading-tight uppercase text-[10px] whitespace-normal break-words">{getShortLabel(sched.courseName)} {sched.category !== 'coordinador' && sched.category !== 'refrigerio' ? `- ${sched.modality?.toUpperCase()}` : ''}</h4>
                    {isExtra && <span className="text-[8px] font-black bg-slate-900/10 px-1 rounded mt-0.5">EXTRAS</span>}
                    <div className="font-black border-t border-black/5 w-full pt-1 mt-1 text-[10px]">{sched.startTime} - {sched.endTime}</div>
                </div>
            )}
        </div>
    );
};

export default React.memo(ScheduleCard);
