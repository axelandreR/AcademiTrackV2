
import { useRef } from 'react';
import JSZip from 'jszip';
import { useData } from '../context/DataContext';
import { ProcessedSchedule, ScheduleCategory, ModalityType, ExportConfig, ViewType } from '../types';
import { generateScheduleExcel, generateAdminTasksExcel } from '../services/excelExporter';
import { CUT_OFF_DATE, SEMESTER_END_DATE } from '../constants';
import { timeToMinutes } from '../utils/timeUtils';

export const useScheduleActions = (
    currentWeekStart: Date,
    selectedFilter: string,
    viewType: ViewType,
    setIsExportModalOpen: (open: boolean) => void,
    checkInstructorDiscrepancy: (name: string) => boolean
) => {
    const {
        allSchedules, administrativeTasks, instructorsByNameMap, holidays,
        saveScheduleCloud, deleteScheduleCloud, isSimulationMode
    } = useData();

    const lastTaskCreationRef = useRef<number>(0);

    const handleExport = async (config: ExportConfig) => {
        // En simulación permitimos exportar con discrepancias
        if (!isSimulationMode && config.type === 'Instructor' && config.mode === 'individual' && config.selectedItem && checkInstructorDiscrepancy(config.selectedItem)) {
            alert('ERROR: Horario con discrepancia de carga. Corrija las observaciones antes de exportar.');
            return;
        }

        setIsExportModalOpen(false);
        try {
            const zip = new JSZip();
            if (config.mode === 'individual') {
                const item = config.selectedItem || '';
                const itemData = allSchedules.filter(s => {
                    if (config.type === 'Bloque') return s.block === item;
                    if (config.type === 'Aula') return `${s.building} - ${s.room}` === item;
                    if (config.type === 'Instructor') return s.instructor === item;
                    return false;
                });
                console.log("EXPORT DEBUG: itemData", itemData);
                const blob = await generateScheduleExcel({
                    data: itemData,
                    type: config.type,
                    itemName: item,
                    scope: config.scope,
                    customStartDate: config.customStartDate,
                    customEndDate: config.customEndDate,
                    instructorInfo: instructorsByNameMap[item.toLowerCase()],
                    logo: config.logo,
                    holidays
                });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${item}.xlsx`;
                a.click();
            } else {
                const itemsToExport = Array.from(new Set(allSchedules.map(s => {
                    if (config.type === 'Bloque') return s.block;
                    if (config.type === 'Aula') return `${s.building} - ${s.room}`;
                    if (config.type === 'Instructor') return s.instructor;
                    return '';
                }))).filter((item): item is string => Boolean(item));

                for (const item of itemsToExport) {
                    const itemData = allSchedules.filter(s => {
                        if (config.type === 'Bloque') return s.block === item;
                        if (config.type === 'Aula') return `${s.building} - ${s.room}` === item;
                        if (config.type === 'Instructor') return s.instructor === item;
                        return false;
                    });
                    const blob = await generateScheduleExcel({
                        data: itemData,
                        type: config.type,
                        itemName: item,
                        scope: config.scope,
                        instructorInfo: instructorsByNameMap[item.toLowerCase()],
                        logo: config.logo,
                        holidays
                    });
                    zip.file(`${item}.xlsx`, blob);
                }
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const url = window.URL.createObjectURL(zipBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Reporte_${config.type}.zip`;
                a.click();
            }
        } catch (err: any) {
            console.error("EXCEL GENERATION ERROR:", err);
            alert(`Error al generar Excel: ${err?.message || err}`);
        }
    };

    const handleExportAdminTasks = async () => {
        if (!selectedFilter || viewType !== 'Instructor') return;
        try {
            const instructorInfo = instructorsByNameMap[selectedFilter.toLowerCase()];
            const blob = await generateAdminTasksExcel(selectedFilter, allSchedules, instructorInfo);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Tareas_Administrativas_${selectedFilter}.xlsx`;
            a.click();
        } catch (err) {
            alert('Error al generar Excel de tareas administrativas.');
        }
    };

    const handleAddAdministrativeTask = (day: string, startTime: string, duration: number, category: ScheduleCategory, modality: ModalityType) => {
        const now = Date.now();
        if (now - lastTaskCreationRef.current < 400) return;
        lastTaskCreationRef.current = now;

        if (viewType !== 'Instructor' || !selectedFilter) return;

        const [h, m] = startTime.split(':').map(Number);
        const startMin = h * 60 + m;
        const endMin = startMin + duration;
        const endH = Math.floor(endMin / 60);
        const endM = endMin % 60;
        const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        const instructor = instructorsByNameMap[selectedFilter.toLowerCase()];
        const effectiveModality = category === 'por_asignar' ? 'presencial' : modality;

        const baseStartDate = new Date(currentWeekStart);
        baseStartDate.setHours(0, 0, 0, 0);

        let finalEndDate: Date;
        if (baseStartDate <= CUT_OFF_DATE) {
            finalEndDate = new Date(CUT_OFF_DATE);
        } else {
            finalEndDate = new Date(baseStartDate);
            finalEndDate.setDate(baseStartDate.getDate() + 6);
            if (finalEndDate > SEMESTER_END_DATE) {
                finalEndDate = new Date(SEMESTER_END_DATE);
            }
        }
        finalEndDate.setHours(0, 0, 0, 0);

        let scanner = new Date(baseStartDate);
        scanner.setDate(scanner.getDate() + 7);

        while (scanner <= finalEndDate) {
            const collision = allSchedules.find(s => {
                if (s.instructor !== selectedFilter || !s.days.includes(day)) return false;
                const sStart = timeToMinutes(s.startTime);
                const sEnd = timeToMinutes(s.endTime);
                const hasTimeOverlap = (startMin < sEnd && endMin > sStart);
                if (!hasTimeOverlap) return false;

                const scanTime = scanner.getTime();
                return scanTime >= s.startDate.getTime() && scanTime <= s.endDate.getTime();
            });

            if (collision) {
                const newLimit = new Date(scanner);
                const daysToBack = scanner.getDay() === 0 ? 7 : scanner.getDay();
                newLimit.setDate(scanner.getDate() - daysToBack);
                finalEndDate = new Date(newLimit);
                finalEndDate.setHours(0, 0, 0, 0);
                break;
            }
            scanner.setDate(scanner.getDate() + 7);
        }

        const newTask: ProcessedSchedule = {
            id: `admin-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            courseCode: 'ADMIN',
            courseName: category === 'refrigerio' ? 'REFRIGERIO' : (category === 'preparacion' ? 'PREPARACIÓN DE CLASE' : (category === 'asincrona' ? 'ASÍNCRONA' : category.toUpperCase().replace('_', ' '))),
            activity: category === 'asincrona' ? 'AUTOESTUDIO' : category.toUpperCase(),
            meetingType: category === 'asincrona' ? 'VAEE' : 'ADMIN',
            block: 'ADMIN',
            instructor: selectedFilter,
            instructorId: instructor?.id || '',
            room: effectiveModality === 'virtual' ? 'VIRTUAL' : 'POR DEFINIR',
            building: effectiveModality === 'virtual' ? 'REMOTO' : 'CAMPUS',
            days: [day],
            startTime,
            endTime,
            startDate: baseStartDate,
            endDate: finalEndDate,
            career: instructor?.specialty || 'GENERAL',
            nrc: '0000',
            color: 'bg-slate-100',
            weeklyHours: duration / 60,
            aforo: 0,
            periodo: allSchedules[0]?.periodo || '202510',
            semestre: 'N/A',
            category,
            isAdministrative: true,
            modality: effectiveModality
        };
        saveScheduleCloud(newTask);
    };

    const handleIndividualizeTask = (taskId: string, targetDate: Date) => {
        const adminTaskIndex = administrativeTasks.findIndex(t => t.id === taskId);

        if (adminTaskIndex !== -1) {
            const task = administrativeTasks[adminTaskIndex];
            const targetTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
            const startTime = new Date(task.startDate.getFullYear(), task.startDate.getMonth(), task.startDate.getDate()).getTime();
            const endTime = new Date(task.endDate.getFullYear(), task.endDate.getMonth(), task.endDate.getDate()).getTime();

            if (startTime === endTime) return;

            const splitTasks: ProcessedSchedule[] = [];
            if (startTime < targetTime) {
                const pastEndDate = new Date(targetTime);
                pastEndDate.setDate(pastEndDate.getDate() - 1);
                splitTasks.push({ ...task, id: `past-${Date.now()}-${Math.random()}`, endDate: pastEndDate });
            }
            splitTasks.push({ ...task, id: `indiv-${Date.now()}-${Math.random()}`, startDate: new Date(targetTime), endDate: new Date(targetTime) });
            if (endTime > targetTime) {
                const futureStartDate = new Date(targetTime);
                futureStartDate.setDate(futureStartDate.getDate() + 1);
                splitTasks.push({ ...task, id: `future-${Date.now()}-${Math.random()}`, startDate: futureStartDate });
            }

            deleteScheduleCloud(taskId);
            saveScheduleCloud(splitTasks);
            return;
        }

        const academicTask = allSchedules.find(t => t.id === taskId);

        if (academicTask) {
            const normalizedTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

            const isHol = holidays.some(h =>
                h.date.getDate() === normalizedTarget.getDate() &&
                h.date.getMonth() === normalizedTarget.getMonth() &&
                h.date.getFullYear() === normalizedTarget.getFullYear()
            );

            if (academicTask.courseName !== 'REV Y CALIF CUADERNOS INFORME' && !isHol) return;

            const targetTime = normalizedTarget.getTime();
            const startTime = new Date(academicTask.startDate.getFullYear(), academicTask.startDate.getMonth(), academicTask.startDate.getDate()).getTime();
            const endTime = new Date(academicTask.endDate.getFullYear(), academicTask.endDate.getMonth(), academicTask.endDate.getDate()).getTime();

            if (startTime === endTime) return;

            const splitTasks: ProcessedSchedule[] = [];
            if (startTime < targetTime) {
                const pastEndDate = new Date(targetTime);
                pastEndDate.setDate(pastEndDate.getDate() - 1);
                splitTasks.push({ ...academicTask, id: `past-${Date.now()}-${Math.random()}`, endDate: pastEndDate });
            }
            splitTasks.push({
                ...academicTask,
                id: `indiv-${Date.now()}-${Math.random()}`,
                startDate: new Date(targetTime),
                endDate: new Date(targetTime)
            });
            if (endTime > targetTime) {
                const futureStartDate = new Date(targetTime);
                futureStartDate.setDate(futureStartDate.getDate() + 1);
                splitTasks.push({ ...academicTask, id: `future-${Date.now()}-${Math.random()}`, startDate: futureStartDate });
            }

            const runSplitting = async () => {
                try {
                    await deleteScheduleCloud(taskId);
                    await saveScheduleCloud(splitTasks);
                } catch (err) {
                    console.error("Error al individualizar:", err);
                }
            };
            runSplitting();
        }
    };

    return {
        handleExport,
        handleExportAdminTasks,
        handleAddAdministrativeTask,
        handleIndividualizeTask
    };
};
