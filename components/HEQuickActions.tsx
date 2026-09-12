import React, { useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, ClipboardList } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Instructor } from '../types';
import { belongsToInstructor } from '../services/businessRules';
import { generateWeeklyHEExcel, generateFullPeriodHEExcel } from '../services/excelExporter';
import MigrateAdminTasksModal from './MigrateAdminTasksModal';

interface HEQuickActionsProps {
    instructor: Instructor;
    currentWeekStart: Date;
}

/**
 * Accesos a los reportes Excel de HE (semanal / periodo completo) y a "Migrar Tareas
 * Administrativas" desde una simulación guardada — antes vivían como íconos dentro de
 * HEAssignedControl.tsx en el encabezado siempre visible de la Toolbar, lo que saturaba
 * esa barra en pantallas medianas y llegaba a tapar el nombre del instructor. Se movieron
 * aquí, al desplegable de "Más opciones" (ver ScheduleToolbar.tsx), junto con el resto de
 * acciones secundarias (Exportar, Resumen para Correo, Auditoría).
 */
const HEQuickActions: React.FC<HEQuickActionsProps> = ({ instructor, currentWeekStart }) => {
    const { allSchedules, extraHoursConfigsByInstructor, holidays, notify } = useData();
    const [isMigrateModalOpen, setIsMigrateModalOpen] = useState(false);
    const [isExportingWeek, setIsExportingWeek] = useState(false);
    const [isExportingPeriod, setIsExportingPeriod] = useState(false);

    const hasExemption = instructor.hasExtraHoursAssigned === true;
    const instructorExtraHoursConfig = extraHoursConfigsByInstructor[instructor.id] || null;
    const hasSegments = !!instructorExtraHoursConfig;
    const isConfigured = hasExemption || hasSegments;

    const instructorSchedules = useMemo(
        () => allSchedules.filter(s => belongsToInstructor(instructor, s)),
        [allSchedules, instructor]
    );

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const handleWeeklyExport = async () => {
        if (isExportingWeek) return;
        setIsExportingWeek(true);
        try {
            const blob = await generateWeeklyHEExcel({
                instructorName: instructor.name, instructorType: instructor.type, weekStart: currentWeekStart,
                allSchedules: instructorSchedules, extraHoursConfig: instructorExtraHoursConfig, holidays
            });
            downloadBlob(blob, `Programacion_Semanal_HE_${instructor.name.replace(/\s+/g, '_')}_${currentWeekStart.toISOString().slice(0, 10)}.xlsx`);
            notify('Reporte semanal exportado correctamente.', 'success');
        } catch (e: any) {
            notify('Error al generar el reporte semanal: ' + e.message, 'error');
        } finally {
            setIsExportingWeek(false);
        }
    };

    const handleFullPeriodExport = async () => {
        if (isExportingPeriod) return;
        setIsExportingPeriod(true);
        try {
            const blob = await generateFullPeriodHEExcel({
                instructorName: instructor.name, instructorType: instructor.type,
                allSchedules: instructorSchedules, extraHoursConfig: instructorExtraHoursConfig, holidays
            });
            downloadBlob(blob, `Programacion_Completa_HE_${instructor.name.replace(/\s+/g, '_')}.xlsx`);
            notify('Reporte del periodo exportado correctamente.', 'success');
        } catch (e: any) {
            notify('Error al generar el reporte del periodo: ' + e.message, 'error');
        } finally {
            setIsExportingPeriod(false);
        }
    };

    return (
        <>
            {isConfigured && (
                <>
                    <button
                        onClick={handleWeeklyExport}
                        disabled={isExportingWeek}
                        className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-amber-400 hover:text-amber-600 transition-all shadow-sm disabled:opacity-40"
                        title="Exportar reporte HE de esta semana"
                    >
                        {isExportingWeek ? <div className="animate-spin h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full" /> : <FileDown size={16} />}
                    </button>
                    <button
                        onClick={handleFullPeriodExport}
                        disabled={isExportingPeriod}
                        className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-amber-400 hover:text-amber-600 transition-all shadow-sm disabled:opacity-40"
                        title="Exportar reporte HE del periodo completo"
                    >
                        {isExportingPeriod ? <div className="animate-spin h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full" /> : <FileSpreadsheet size={16} />}
                    </button>
                </>
            )}

            {/* Migrar a la grilla real solo las tareas administrativas de una simulación
                guardada de este instructor (ver MigrateAdminTasksModal) — agrega/actualiza
                por ID, nunca borra; no requiere tener HE configurada ni pasar por "Aplicar
                Simulación" (que sincroniza también lo académico). */}
            <button
                onClick={() => setIsMigrateModalOpen(true)}
                className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm"
                title="Migrar tareas administrativas desde una simulación guardada de este instructor"
            >
                <ClipboardList size={16} />
            </button>

            {isMigrateModalOpen && (
                <MigrateAdminTasksModal
                    isOpen={isMigrateModalOpen}
                    onClose={() => setIsMigrateModalOpen(false)}
                    instructor={instructor}
                />
            )}
        </>
    );
};

export default HEQuickActions;
