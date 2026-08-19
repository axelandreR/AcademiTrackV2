
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar as CalendarIcon, Menu, X
} from 'lucide-react';
import Breadcrumbs from './Breadcrumbs';
import { ViewType, ProcessedSchedule } from '../types';
import { useData } from '../context/DataContext';
import { resolveInstructorForRecord } from '../services/businessRules';

interface ScheduleHeaderProps {
    navigate: (path: string) => void;
    currentWeekStart: Date;
    semesterWeeks: { start: Date; label: string }[];
    selectedFilter: string;
    setSelectedFilter: (filter: string) => void;
    viewType: ViewType;
    filteredData: ProcessedSchedule[];
    setSidebarSearchTerm: (term: string) => void;
}

const ScheduleHeader: React.FC<ScheduleHeaderProps> = ({
    navigate,
    currentWeekStart,
    semesterWeeks,
    selectedFilter,
    setSelectedFilter,
    viewType,
    filteredData,
    setSidebarSearchTerm
}) => {
    const { roomsMap, instructors } = useData();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Helper for breadcrumbs
    const breadcrumbItems = useMemo(() => {
        const crumbs: any[] = [
            { label: 'OPERACIONES', onClick: () => navigate('/') },
            {
                label: 'VISUALIZADOR', onClick: () => {
                    setSelectedFilter('');
                    setSidebarSearchTerm('');
                }, active: !selectedFilter
            }
        ];

        if (selectedFilter) {
            crumbs.push({
                label: viewType.toUpperCase(),
                onClick: () => {
                    setSelectedFilter('');
                }
            });

            // Intentar encontrar el grupo (Carrera/Tipo)
            const activeSample = filteredData[0];
            if (activeSample) {
                let groupName = 'GENERAL';
                if (viewType === 'Bloque') groupName = activeSample.career;
                else if (viewType === 'Aula') {
                    const room = roomsMap[activeSample.building + ' - ' + activeSample.room];
                    groupName = room?.type || 'AULA';
                }
                else if (viewType === 'Instructor') {
                    const inst = resolveInstructorForRecord(activeSample, instructors);
                    groupName = inst?.type === 'TC' ? 'TIEMPO COMPLETO' : 'TIEMPO PARCIAL';
                }
                crumbs.push({ label: groupName.toUpperCase(), onClick: () => { }, active: false });
            }

            crumbs.push({ label: selectedFilter.toUpperCase(), onClick: () => { }, active: true });
        }

        return crumbs;
    }, [selectedFilter, viewType, filteredData, roomsMap, instructors, navigate, setSelectedFilter, setSidebarSearchTerm]);

    return (
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-2.5 lg:py-4 sticky top-0 z-[100] shadow-sm shrink-0">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 sm:space-x-6 min-w-0">
                    <button
                        onClick={() => navigate('/progress')}
                        className="flex items-center space-x-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all border border-slate-100 font-bold text-[10px] sm:text-xs uppercase tracking-widest shadow-sm shrink-0"
                    >
                        <span>Avance Horarios</span>
                    </button>

                    {/* Ruta de navegación completa — visible siempre en desktop; en pantallas
                        angostas se accede con el menú hamburguesa (antes se cortaba a la mitad
                        contra el borde de la pantalla). */}
                    <div className="hidden lg:flex items-center space-x-1 min-w-0" onClick={() => navigate('/')}>
                        <div className="p-1.5 bg-slate-900 rounded-lg text-white shadow-lg cursor-pointer hover:bg-indigo-600 transition-colors mr-2 shrink-0">
                            <CalendarIcon size={14} />
                        </div>
                        <Breadcrumbs items={breadcrumbItems} />
                    </div>
                </div>

                {/* Menú hamburguesa — solo por debajo de `lg` */}
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className={`lg:hidden p-2 rounded-xl border transition-all shrink-0 ${isMenuOpen ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'}`}
                    aria-label={isMenuOpen ? 'Cerrar navegación' : 'Abrir navegación'}
                    title={isMenuOpen ? 'Cerrar navegación' : 'Abrir navegación'}
                >
                    {isMenuOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
            </div>

            {isMenuOpen && (
                <div className="lg:hidden flex items-center space-x-1 mt-3 pt-3 border-t border-slate-100">
                    <div className="p-1.5 bg-slate-900 rounded-lg text-white shadow-lg cursor-pointer hover:bg-indigo-600 transition-colors mr-2 shrink-0" onClick={() => { navigate('/'); setIsMenuOpen(false); }}>
                        <CalendarIcon size={14} />
                    </div>
                    <Breadcrumbs items={breadcrumbItems} />
                </div>
            )}
        </header>
    );
};

export default ScheduleHeader;
