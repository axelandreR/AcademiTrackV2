
import { ProcessedSchedule, Instructor, RoomData } from '../types';

// Rango Unicode de marcas diacríticas combinables (acentos), construido por code point
// para evitar problemas de encoding con literales unicode en el código fuente.
const DIACRITICS_REGEX = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');

/**
 * Normaliza un nombre para usarlo como clave de `instructorsByNameMap` (mayúsculas,
 * sin tildes). DEBE usarse exactamente esta función en cualquier lookup contra ese mapa
 * — ese mapa se construye con esta misma regla, y buscar con `.toLowerCase()` (como
 * hacían varias pantallas) nunca hace match porque las claves están en mayúsculas.
 */
export const normalizeNameKey = (str: string) => (str || '').toString().trim()
    .normalize("NFD").replace(DIACRITICS_REGEX, "").toUpperCase();

/**
 * Resuelve un instructor a partir de un nombre de texto (ej. el `instructor` crudo de un
 * horario), primero por match EXACTO contra instructorsByNameMap (rápido), y si no
 * encuentra nada, cae a fuzzy match contra el catálogo completo.
 *
 * Por qué existe: instructorsByNameMap solo tiene UNA clave por instructor (su nombre
 * completo normalizado). El texto crudo de un horario a veces es una variante más corta
 * (ej. "ASTUDILLO AGUAYO ABNER" en vez de "ASTUDILLO AGUAYO ABNER ABISAI" del catálogo) —
 * un lookup exacto contra ese mapa falla en ese caso, aunque isFuzzyNameMatch sí los
 * reconocería como la misma persona. Varias pantallas (tipo TC/TP mostrado en la grilla,
 * encabezado, discrepancia semanal) hacían el lookup exacto sin este respaldo, y por eso
 * un instructor TC real terminaba mostrándose como TP por defecto.
 */
export const resolveInstructorByName = (
    name: string,
    instructorsByNameMap: Record<string, Instructor>,
    instructors: Instructor[]
): Instructor | undefined => {
    const exact = instructorsByNameMap[normalizeNameKey(name)];
    if (exact) return exact;
    // Si el nombre coincide (fuzzy) con más de un instructor del catálogo (ej. dos
    // personas con los mismos dos apellidos), NO adivinamos cuál es — es mejor no
    // resolver que resolver mal. Solo devolvemos match si es un candidato único.
    const fuzzyMatches = instructors.filter(i => isFuzzyNameMatch(i.name, name));
    return fuzzyMatches.length === 1 ? fuzzyMatches[0] : undefined;
};

/**
 * Determina si un curso pertenece a la categoría de "Otras Funciones"
 * (Asesorías de proyectos, revisión de cuadernos, etc.)
 *
 * El código de curso (Mat-Cur) es la fuente de verdad — igual que el ID de instructor
 * sobre el nombre, el código identifica el curso de forma estable aunque el nombre
 * cambie o venga truncado en el Excel (ej. "ASESORÍA EN ELABORACIÓN D PIMC" vs el nombre
 * completo). El match por nombre queda solo como respaldo para patrones sin código
 * conocido todavía.
 */
export const isOtherFunctionsCourse = (sched: ProcessedSchedule): boolean => {
    const cCode = (sched.courseCode || '').toUpperCase();

    if (
        cCode.includes('CNI-108') || cCode.includes('CNIU-108') ||
        cCode.includes('CNI-126') || cCode.includes('CNIU-126')
    ) {
        return true;
    }

    const cName = (sched.courseName || '').toUpperCase();
    return (
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

const normalizeFuzzyName = (s: string) => (s || '').toString().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();

/**
 * N\u00facleo de isFuzzyNameMatch, sobre nombres YA normalizados (ver normalizeFuzzyName arriba).
 * Separado para que getInstructorSchedules pueda normalizar una sola vez por nombre (en vez
 * de re-normalizar en cada una de las miles de comparaciones instructor\u00d7horario-sin-ID) \u2014
 * mismo criterio de match, solo evita trabajo redundante.
 */
const isFuzzyNameMatchNormalized = (nA: string, nB: string): boolean => {
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

export const isFuzzyNameMatch = (nameA: string, nameB: string): boolean =>
    isFuzzyNameMatchNormalized(normalizeFuzzyName(nameA), normalizeFuzzyName(nameB));

const normalizeId = (s: string) => (s || '').toString().trim()
    .normalize("NFD").replace(DIACRITICS_REGEX, "")
    .replace(/[.,]/g, "").toUpperCase();

/**
 * Determina si un bloque de horario pertenece a un instructor.
 * El instructorId es la ÚNICA fuente de verdad cuando el bloque lo trae: si existe,
 * NO se recurre al nombre aunque coincida. El fuzzy match por nombre solo se usa como
 * último recurso para bloques legados que llegaron sin ID.
 *
 * Esto evita el cruce clásico entre instructores con apellidos parecidos (ej. mismos
 * dos apellidos y distinto nombre de pila), donde antes un bloque ya identificado por
 * ID podía terminar apareciendo también en la carga de otro instructor por el fuzzy match.
 */
export const belongsToInstructor = (
    instructor: { id: string; name: string },
    sched: { instructorId?: string; instructor?: string }
): boolean => {
    const schedId = normalizeId(sched.instructorId || '');
    if (schedId) {
        return schedId === normalizeId(instructor.id);
    }
    return isFuzzyNameMatch(instructor.name, sched.instructor || '');
};

/**
 * Encuentra, dentro del catálogo, el instructor dueño de un registro que trae
 * instructorId/instructor (un ProcessedSchedule o una tarea recuperada) — prioriza el
 * ID (belongsToInstructor), igual que el resto de la app. Úsalo en vez de
 * resolveInstructorByName siempre que el registro en mano tenga (o pueda traer) un
 * instructorId, aunque esté vacío en el caso puntual — así el ID manda apenas esté
 * disponible, y el nombre queda solo como respaldo para registros legados sin ID.
 */
export const resolveInstructorForRecord = (
    record: { instructorId?: string; instructor?: string },
    instructors: Instructor[]
): Instructor | undefined => {
    return instructors.find(i => belongsToInstructor(i, record));
};

export interface InstructorScheduleIndex<T extends { instructorId?: string; instructor?: string }> {
    byId: Map<string, T[]>;
    unlinked: T[];
    // Nombre normalizado (ver normalizeFuzzyName) de cada horario de `unlinked`, en el mismo
    // orden — precalculado una sola vez aquí para que getInstructorSchedules no tenga que
    // re-normalizar miles de veces en su fallback por nombre difuso (era la causa confirmada
    // de que cambiar a la vista Docentes se congelara varios segundos: con ~260 instructores
    // × horarios sin instructor_id, cada uno se normalizaba desde cero en cada comparación).
    unlinkedNormalized: string[];
}

/**
 * Indexa un arreglo de horarios por instructorId normalizado en una sola pasada O(n).
 * Úsalo junto con getInstructorSchedules para evitar el patrón O(instructores × horarios)
 * de llamar belongsToInstructor por cada par instructor/horario — ese patrón, repetido en
 * varias pantallas (sidebar de Docentes, Avance de Horarios, Reporte Global), fue la causa
 * confirmada de la lentitud al cambiar de vista con ~260 instructores × ~3400 horarios.
 */
export const buildInstructorScheduleIndex = <T extends { instructorId?: string; instructor?: string }>(
    schedules: T[]
): InstructorScheduleIndex<T> => {
    const byId = new Map<string, T[]>();
    const unlinked: T[] = [];
    const unlinkedNormalized: string[] = [];
    schedules.forEach(s => {
        const id = normalizeId(s.instructorId || '');
        if (id) {
            const list = byId.get(id);
            if (list) list.push(s); else byId.set(id, [s]);
        } else {
            unlinked.push(s);
            unlinkedNormalized.push(normalizeFuzzyName(s.instructor || ''));
        }
    });
    return { byId, unlinked, unlinkedNormalized };
};

/**
 * Horarios que pertenecen a un instructor usando el índice de buildInstructorScheduleIndex:
 * O(1) para el caso normal (horario con ID), sin recorrer todo el arreglo. Solo recorre
 * `unlinked` (horarios legados sin ID, normalmente una minoría) para el fallback por nombre,
 * normalizando el nombre del instructor UNA vez (no una vez por cada horario comparado).
 */
export const getInstructorSchedules = <T extends { instructorId?: string; instructor?: string }>(
    instructor: { id: string; name: string },
    index: InstructorScheduleIndex<T>
): T[] => {
    const direct = index.byId.get(normalizeId(instructor.id)) || [];
    if (index.unlinked.length === 0) return direct;
    const normalizedInstructorName = normalizeFuzzyName(instructor.name);
    const fuzzy = index.unlinked.filter((_, i) => isFuzzyNameMatchNormalized(normalizedInstructorName, index.unlinkedNormalized[i]));
    return fuzzy.length > 0 ? [...direct, ...fuzzy] : direct;
};

/**
 * Devuelve los instructores de una lista cuyo nombre coincide (fuzzy) con el nombre dado,
 * excluyendo opcionalmente un ID. Se usa para detectar ambigüedad ANTES de vincular
 * automáticamente un bloque sin ID a un instructor por nombre: si hay más de un candidato,
 * no se debe decidir a ciegas.
 */
export const findFuzzyNameMatches = <T extends { id: string; name: string }>(
    name: string,
    candidates: T[],
    excludeId?: string
): T[] => {
    return candidates.filter(c => c.id !== excludeId && isFuzzyNameMatch(c.name, name));
};

export interface MissingInstructorRef {
    id: string;
    name: string;
}

export interface MissingRoomRef {
    building: string;
    room: string;
    roomKey: string;
}

/**
 * Escanea los horarios de una carga de Programación en busca de instructores y aulas
 * referenciados que NO existen todavía en los catálogos actuales. Se usa para el panel
 * de "referencias pendientes" que se muestra antes de sincronizar.
 *
 * Se ignoran filas sin instructor asignado ("vacantes") y filas sin edificio/salón real
 * (ej. bloques virtuales VAEE sin salón físico) — esas no representan una referencia rota.
 */
export const findMissingCatalogReferences = (
    schedules: ProcessedSchedule[],
    instructors: Pick<Instructor, 'id' | 'name'>[],
    rooms: Pick<RoomData, 'roomKey'>[]
): { missingInstructors: MissingInstructorRef[]; missingRooms: MissingRoomRef[] } => {
    const existingInstructorIds = new Set(instructors.map(i => normalizeId(i.id)).filter(Boolean));
    const existingInstructorNames = new Set(instructors.map(i => normalizeId(i.name)).filter(Boolean));
    const existingRoomKeys = new Set(rooms.map(r => normalizeId(r.roomKey)));

    const missingInstructorsMap = new Map<string, MissingInstructorRef>();
    const missingRoomsMap = new Map<string, MissingRoomRef>();

    schedules.forEach(s => {
        const hasId = !!(s.instructorId && s.instructorId.trim() !== '');
        const hasName = !!(s.instructor && s.instructor.trim() !== '' && s.instructor.toUpperCase() !== 'SIN ASIGNAR');

        if (hasId || hasName) {
            const idMatches = hasId && existingInstructorIds.has(normalizeId(s.instructorId!));
            const nameMatches = hasName && existingInstructorNames.has(normalizeId(s.instructor!));

            if (!idMatches && !nameMatches) {
                const key = normalizeId(hasId ? s.instructorId! : s.instructor!);
                if (!missingInstructorsMap.has(key)) {
                    missingInstructorsMap.set(key, { id: s.instructorId || '', name: s.instructor || '' });
                }
            }
        }

        const hasRealRoom = !!(s.building && s.building.trim() !== '' && s.room && s.room.trim() !== '');
        if (hasRealRoom) {
            const roomKey = `${s.building} - ${s.room}`;
            const normKey = normalizeId(roomKey);
            if (!existingRoomKeys.has(normKey) && !missingRoomsMap.has(normKey)) {
                missingRoomsMap.set(normKey, { building: s.building, room: s.room, roomKey });
            }
        }
    });

    return {
        missingInstructors: Array.from(missingInstructorsMap.values()),
        missingRooms: Array.from(missingRoomsMap.values())
    };
};

