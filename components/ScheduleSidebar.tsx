
import React from 'react';
import { Settings, ChevronDown, ChevronRight, Zap, BookOpen, UserCircle, Briefcase, Coffee, MonitorPlay, MapPin, Video } from 'lucide-react';
import { ScheduleCategory, ModalityType } from '../types';
import { getShortLabel } from '../constants';

interface ScheduleSidebarProps {
    isEditorMode: boolean;
    isSelectorExpanded: boolean;
    setIsSelectorExpanded: (expanded: boolean) => void;
    sidebarWidth: number;
    isResizing: boolean;
    setIsResizing: (resizing: boolean) => void;
    activeEditorTool: ScheduleCategory;
    setActiveEditorTool: (tool: ScheduleCategory) => void;
    instructorType: 'TC' | 'TP';
    activeModality: ModalityType;
    setActiveModality: (modality: ModalityType) => void;
}

const ScheduleSidebar: React.FC<ScheduleSidebarProps> = ({
    isEditorMode,
    isSelectorExpanded,
    setIsSelectorExpanded,
    sidebarWidth,
    isResizing,
    setIsResizing,
    activeEditorTool,
    setActiveEditorTool,
    instructorType,
    activeModality,
    setActiveModality,
}) => {
    if (!isEditorMode) return null;

    return (
        <>
            <button
                onClick={() => setIsSelectorExpanded(!isSelectorExpanded)}
                className="xl:hidden w-full bg-slate-800 border-b border-slate-700 py-3 px-6 flex items-center justify-between text-white font-black uppercase text-[10px] tracking-widest z-[60]"
            >
                <div className="flex items-center space-x-2">
                    <Settings size={14} className="text-blue-400" />
                    <span>Tareas Administrativas</span>
                </div>
                {isSelectorExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            <div
                style={window.innerWidth >= 1280 ? { width: `${sidebarWidth}px` } : {}}
                className={`
          bg-slate-900 border-slate-800 flex flex-col shrink-0 overflow-y-auto custom-scrollbar z-50 transition-all duration-300
          ${isSelectorExpanded ? 'max-h-[800px] opacity-100 py-6 px-6' : 'max-h-0 opacity-0 py-0 px-6'}
          xl:max-h-none xl:opacity-100 xl:py-6 xl:border-r
          ${isResizing ? 'user-select-none' : ''}
        `}
            >
                <div className="flex flex-col md:flex-row xl:flex-col gap-6 md:gap-10">
                    <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center"><Settings size={14} className="mr-2 text-blue-400" />Tarea</h3>
                        </div>
                        <div className="grid grid-cols-2 xl:grid-cols-1 gap-2.5">
                            {[
                                { id: 'asincrona', label: 'Horas Asíncronas', icon: Zap, color: 'text-cyan-400' },
                                { id: 'preparacion', label: 'Preparación de Clase', icon: BookOpen, color: 'text-violet-400', disabled: instructorType === 'TP' },
                                { id: 'coordinador', label: 'Coordinador Carrera', icon: UserCircle, color: 'text-emerald-400' },
                                { id: 'por_asignar', label: 'Horas por Asignar', icon: Briefcase, color: 'text-violet-300', disabled: instructorType === 'TP' },
                                { id: 'refrigerio', label: 'Refrigerio', icon: Coffee, color: 'text-orange-400' },
                            ].map((tool) => (
                                <button
                                    key={tool.id}
                                    disabled={tool.disabled}
                                    onClick={() => setActiveEditorTool(tool.id as ScheduleCategory)}
                                    className={`flex items-center justify-between p-2.5 min-[1501px]:p-3.5 rounded-2xl transition-all border-2 ${tool.disabled ? 'opacity-20 cursor-not-allowed grayscale' : activeEditorTool === tool.id ? 'bg-white/10 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'border-transparent hover:bg-white/5'}`}
                                >
                                    <div className="flex items-center space-x-2.5 min-w-0">
                                        <tool.icon size={16} className={`${tool.color} shrink-0`} />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white truncate">{getShortLabel(tool.label)}</span>
                                    </div>
                                    {activeEditorTool === tool.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="w-full md:w-[180px] xl:w-full pt-0 md:pt-0 xl:pt-6 xl:border-t border-white/10 flex flex-col gap-4">
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center shrink-0"><MonitorPlay size={14} className="mr-2 text-blue-400" />Modalidad</h3>
                        <div className={`flex flex-col p-1.5 rounded-2xl border border-white/5 w-full gap-2 ${activeEditorTool === 'refrigerio' ? 'bg-slate-900/50 opacity-40' : 'bg-slate-800 shadow-inner'}`}>
                            <button
                                disabled={activeEditorTool === 'por_asignar' || activeEditorTool === 'refrigerio' || activeEditorTool === 'coordinador'}
                                onClick={() => setActiveModality('presencial')}
                                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center space-x-2 ${(activeModality === 'presencial' || activeEditorTool === 'coordinador' || activeEditorTool === 'por_asignar') ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <MapPin size={12} />
                                <span>Presencial</span>
                            </button>
                            <button
                                disabled={activeEditorTool === 'por_asignar' || activeEditorTool === 'refrigerio' || activeEditorTool === 'coordinador'}
                                onClick={() => setActiveModality('virtual')}
                                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center space-x-2 ${(activeModality === 'virtual' && activeEditorTool !== 'coordinador' && activeEditorTool !== 'por_asignar' && activeEditorTool !== 'refrigerio') ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <Video size={12} />
                                <span>Virtual</span>
                            </button>
                        </div>
                        {activeEditorTool === 'refrigerio' && <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest text-center">No aplica modalidad</p>}
                        {(activeEditorTool === 'coordinador' || activeEditorTool === 'por_asignar') && <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest text-center">Forzado a Presencial</p>}
                    </div>
                </div>
            </div>
            {/* Resizer Handle */}
            <div
                onMouseDown={() => setIsResizing(true)}
                className={`
          hidden xl:block w-1.5 h-full cursor-col-resize z-[60] -ml-1 transition-all
          ${isResizing ? 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]' : 'hover:bg-blue-600/30'}
        `}
            />
        </>
    );
};

export default ScheduleSidebar;
