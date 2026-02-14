
import React from 'react';
import { Filter, PanelLeftClose, LayoutDashboard, Building2, UserRound, Search, BookOpen, ChevronUp, ChevronDown, ChevronRight as ChevronRightIcon, FlaskConical, History } from 'lucide-react';
import { ViewType, AppMode } from '../types';

interface GroupedOption {
    groupName: string;
    items: string[];
}

interface NavigationSidebarProps {
    isSidebarVisible: boolean;
    setIsSidebarVisible: (visible: boolean) => void;
    viewType: ViewType;
    changeViewType: (type: ViewType) => void;
    sidebarSearchTerm: string;
    setSidebarSearchTerm: (term: string) => void;
    groupedSidebarOptions: GroupedOption[];
    expandedGroups: Set<string>;
    toggleGroup: (groupName: string) => void;
    selectedFilter: string;
    setSelectedFilter: (filter: string) => void;
    onStartSimulation?: () => void;
    isSimulationMode?: boolean;
    appMode?: AppMode;
}

const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
    isSidebarVisible,
    setIsSidebarVisible,
    viewType,
    changeViewType,
    sidebarSearchTerm,
    setSidebarSearchTerm,
    groupedSidebarOptions,
    expandedGroups,
    toggleGroup,
    selectedFilter,
    setSelectedFilter,
    onStartSimulation,
    isSimulationMode,
    appMode
}) => {
    return (
        <aside className={`${isSidebarVisible ? 'w-full md:w-[260px] min-[1501px]:w-[320px]' : 'w-0 overflow-hidden'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 h-full z-40 shadow-lg shrink-0`}>
            <div className="p-4 lg:p-5 border-b border-slate-100 shrink-0 bg-slate-50/30">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center hidden min-[1030px]:flex"><Filter size={12} className="mr-2" />Categorización</h2>
                    <button onClick={() => setIsSidebarVisible(false)} className="p-1.5 text-slate-400 hover:text-slate-800 transition-colors">
                        <PanelLeftClose size={18} />
                    </button>
                </div>

                {!isSimulationMode && onStartSimulation && appMode === 'editor' && (
                    <button
                        onClick={() => { console.log('Button clicked'); if (onStartSimulation) onStartSimulation(); }}
                        className="w-full mb-4 flex items-center justify-center space-x-2 bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 px-4 py-3 rounded-xl transition-all shadow-sm hover:shadow-md group"
                    >
                        <FlaskConical size={18} className="group-hover:rotate-12 transition-transform" />
                        <span className="font-black text-[10px] uppercase tracking-widest">Modo de Prueba</span>
                    </button>
                )}

                <div className="grid grid-cols-3 min-[1030px]:grid-cols-1 gap-2">
                    <button onClick={() => changeViewType('Bloque')} title="Bloques" className={`flex items-center justify-center min-[1030px]:justify-start px-3 py-3 min-[1030px]:px-4 rounded-xl transition-all ${viewType === 'Bloque' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-100'}`}>
                        <LayoutDashboard size={20} className="min-[1030px]:mr-3" />
                        <span className="font-black text-[11px] uppercase tracking-widest hidden min-[1030px]:inline">Bloques</span>
                    </button>
                    <button onClick={() => changeViewType('Aula')} title="Ambientes" className={`flex items-center justify-center min-[1030px]:justify-start px-3 py-3 min-[1030px]:px-4 rounded-xl transition-all ${viewType === 'Aula' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-100'}`}>
                        <Building2 size={20} className="min-[1030px]:mr-3" />
                        <span className="font-black text-[11px] uppercase tracking-widest hidden min-[1030px]:inline">Ambientes</span>
                    </button>
                    <button onClick={() => changeViewType('Instructor')} title="Docentes" className={`flex items-center justify-center min-[1030px]:justify-start px-3 py-3 min-[1030px]:px-4 rounded-xl transition-all ${viewType === 'Instructor' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-100'}`}>
                        <UserRound size={20} className="min-[1030px]:mr-3" />
                        <span className="font-black text-[11px] uppercase tracking-widest hidden min-[1030px]:inline">Docentes</span>
                    </button>
                    <button onClick={() => changeViewType('Simulacion')} title="Simulaciones" className={`flex items-center justify-center min-[1030px]:justify-start px-3 py-3 min-[1030px]:px-4 rounded-xl transition-all ${viewType === 'Simulacion' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-100'}`}>
                        <History size={20} className="min-[1030px]:mr-3" />
                        <span className="font-black text-[11px] uppercase tracking-widest hidden min-[1030px]:inline">Simulaciones</span>
                    </button>
                </div>
            </div>

            <div className="p-5 flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="relative mb-4"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder={`Buscar ${viewType}...`} value={sidebarSearchTerm} onChange={(e) => setSidebarSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-100 border-none rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all" /></div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">{groupedSidebarOptions.map((group) => (<div key={group.groupName} className="mb-2"><button onClick={() => toggleGroup(group.groupName)} className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors mb-1 shadow-sm"><div className="flex items-center space-x-2">{viewType === 'Bloque' ? <BookOpen size={14} className="text-blue-500" /> : viewType === 'Aula' ? <Building2 size={14} className="text-orange-500" /> : <UserRound size={14} className="text-indigo-500" />}<span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[180px]">{group.groupName}</span></div>{expandedGroups.has(group.groupName) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>{expandedGroups.has(group.groupName) && (<div className="pl-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">{group.items.map(item => (<button key={item} onClick={() => setSelectedFilter(item)} className={`w-full text-left px-4 py-2.5 rounded-lg text-[10px] font-black transition-all flex items-center justify-between border ${selectedFilter === item ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'text-slate-600 hover:bg-slate-100 border-transparent'}`}><span className="truncate">{item}</span><ChevronRightIcon size={12} /></button>))}</div>)}</div>))}</div>
            </div>
        </aside>
    );
};

export default NavigationSidebar;
