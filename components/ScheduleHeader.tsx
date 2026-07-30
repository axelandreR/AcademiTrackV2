
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar as CalendarIcon
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
        <header className="bg-white border-b border-slate-200 px-8 py-3 lg:py-4 flex flex-col lg:flex-row lg:items-center justify-between sticky top-0 z-[100] shadow-sm shrink-0">
            <div className="flex items-center justify-between w-full lg:w-auto">
                <div className="flex items-center space-x-6">
                    <button
                        onClick={() => navigate('/progress')}
                        className="flex items-center space-x-2 px-4 py-2 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all border border-slate-100 font-bold text-xs uppercase tracking-widest shadow-sm"
                    >
                        <span>Avance Horarios</span>
                    </button>
                    <div className="flex items-center space-x-4 lg:space-x-8">
                        <div className="flex flex-col">
                            <div className="flex items-center space-x-1 mb-1" onClick={() => navigate('/')}>
                                <div className="p-1.5 bg-slate-900 rounded-lg text-white shadow-lg cursor-pointer hover:bg-indigo-600 transition-colors mr-2">
                                    <CalendarIcon size={14} />
                                </div>
                                <Breadcrumbs items={breadcrumbItems} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center space-x-2 lg:space-x-4 mt-4 lg:mt-0 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
            </div>
        </header>
    );
};

export default ScheduleHeader;
