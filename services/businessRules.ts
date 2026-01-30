
import { ProcessedSchedule } from '../types';

/**
 * Determina si un curso pertenece a la categoría de "Otras Funciones"
 * (Asesorías de proyectos, revisión de cuadernos, etc.)
 */
export const isOtherFunctionsCourse = (sched: ProcessedSchedule): boolean => {
    const cName = (sched.courseName || '').toUpperCase();
    const cCode = (sched.courseCode || '').toUpperCase();

    return (
        cCode.includes('CNI-108') || cCode.includes('CNIU-108') ||
        cCode.includes('CNI-126') || cCode.includes('CNIU-126') ||
        cName.includes('REV Y CALIF CUADERNOS INFORME') ||
        cName.includes('ASESORIA EN ELABORACION DE PROYECTOS') ||
        cName.includes('MEJORA / CREATIVIDAD')
    );
};

/**
 * Determina si una tarea debe ser contada para la Meta de Carga Académica 
 * (Incluye Clases + VAEE/Autoestudio + Asíncronas)
 * Las "Otras Funciones" (CNIU-108, etc.) NO cuentan para esta meta.
 */
export const isAcademicMetaLoad = (sched: ProcessedSchedule): boolean => {
    const isOtherFunc = isOtherFunctionsCourse(sched);

    // Si no es administrativa, se cuenta solo si NO es "Otras Funciones"
    if (!sched.isAdministrative) {
        return !isOtherFunc;
    }

    // Si es administrativa, se cuenta solo si es VAEE/Autoestudio/Asíncrona
    // Nota: Las "Otras Funciones" marcadas como admin NO cuentan para meta académica.
    const isAutoestudio =
        sched.meetingType === 'VAEE' ||
        (sched.activity && sched.activity.toUpperCase().includes('AUTOESTUDIO')) ||
        sched.category === 'asincrona';

    return isAutoestudio;
};

/**
 * Determina si una tarea suma para el Total Contractual (Meta 46h)
 */
export const isContractualLoad = (sched: ProcessedSchedule): boolean => {
    if (isExcludedFromTotalLoad(sched)) return false;
    // Todo lo que no sea refrigerio cuenta para las 46h
    return true;
};

/**
 * Determina si un bloque debe excluirse del total de 46h (ej: refrigerio)
 */
export const isExcludedFromTotalLoad = (sched: ProcessedSchedule): boolean => {
    const cName = (sched.courseName || '').toUpperCase();
    return cName.includes('REFRIGERIO') || sched.category === 'refrigerio';
};
