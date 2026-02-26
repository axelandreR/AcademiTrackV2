
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
        cName.includes('MEJORA / CREATIVIDAD') ||
        cName.includes('COORDINAR') ||
        cName.includes('COORDINACION')
    );
};

/**
 * Determina si una tarea debe ser contada para la Meta de Carga Académica 
 * (Incluye Clases + VAEE/Autoestudio + Asíncronas)
 * Asegura que el ARCHIVO refleje la suma de HORAS SEMANALES del Excel base.
 */
export const isAcademicMetaLoad = (sched: ProcessedSchedule): boolean => {
    // Si no es administrativa (viene del Excel), se cuenta SIEMPRE para la meta académica
    if (!sched.isAdministrative) {
        return true;
    }

    // Si es administrativa (creada en el app), se cuenta solo si es VAEE/Autoestudio/Asíncrona
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

/**
 * Determina si un bloque es de modalidad presencial o asincrona computable (VAEE/Autoestudio)
 * que debe aparecer en la ficha de asistencia.
 */
export const isPresencialOrComputableAsinc = (sched: ProcessedSchedule): boolean => {
    const mod = (sched.modality || '').toUpperCase();
    const meet = (sched.meetingType || '').toUpperCase();
    const name = (sched.courseName || '').toUpperCase();
    const activity = (sched.activity || '').toUpperCase();

    const isVirtual = mod.includes('VIRTUAL') || meet.includes('VIRTUAL') || meet.includes('REMT');
    const isAsynchronous = name.includes('ASINCRONA') || meet.includes('VAEE') || activity.includes('AUTOESTUDIO') || sched.category === 'asincrona';

    return !isVirtual || isAsynchronous;
};

export const isFuzzyNameMatch = (nameA: string, nameB: string): boolean => {
    const norm = (s: string) => (s || '').toString().trim()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,]/g, " ")
        .replace(/\s+/g, " ")
        .toUpperCase();

    const nA = norm(nameA);
    const nB = norm(nameB);

    if (!nA || !nB) return false;
    if (nA === nB) return true;

    // Check if one is a substring of another (handle missing middle names)
    if (nA.length > 3 && nB.length > 3) {
        if (nA.includes(nB) || nB.includes(nA)) return true;
    }

    // Split and check segments (handle different order or abbreviated names)
    const segsA = nA.split(' ').filter(s => s.length > 2);
    const segsB = nB.split(' ').filter(s => s.length > 2);

    if (segsA.length === 0 || segsB.length === 0) return false;

    // If most segments match, consider it a match (at least 2 segments or all if only 1-2 segments)
    const matches = segsA.filter(s => segsB.includes(s));
    const minMatches = Math.min(segsA.length, segsB.length, 2);

    return matches.length >= minMatches;
};

