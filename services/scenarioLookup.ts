import { supabase } from '../supabaseClient';
import { Instructor, Scenario } from '../types';
import { isFuzzyNameMatch } from './businessRules';

/**
 * Busca en `scenarios` (Simulaciones Guardadas, ver SimulationsList.tsx) los escenarios
 * que pertenecen a un instructor puntual. Un escenario identifica a su instructor de dos
 * formas (ver saveScenario/applySimulation en context/DataContext.tsx):
 * - data.simulationConfig.instructorKey: el ID (confiable) — se setea al iniciar la
 *   simulación cuando el nombre calzó EXACTO contra el catálogo.
 * - data.metadata.instructorName: el nombre, usado como respaldo — necesario porque
 *   confirmamos en producción que hay escenarios donde el catálogo NO calzó exacto al
 *   iniciar la simulación (ej. "JIMENEZ RAMOS LUIS" guardado en el escenario vs
 *   "JIMENEZ RAMOS LUIS GUSTAVO" en el catálogo — nombre truncado/abreviado), y ahí
 *   instructorKey también queda con el nombre crudo en vez del ID. Se compara con
 *   isFuzzyNameMatch (mismo criterio que resolveInstructorByName/belongsToInstructor ya
 *   usan en toda la app para este tipo de variante) en vez de igualdad exacta — una
 *   comparación exacta normalizada NO reconoce ese caso.
 * Sin conexión a un servidor con índice JSONB propio, se trae toda la tabla (pequeña,
 * decenas de filas) y se filtra en cliente — mismo patrón que ya usa SimulationsList.tsx.
 */
export const findInstructorScenarios = async (
    instructor: Instructor,
    opts: { excludeAutoBackup?: boolean } = {}
): Promise<Scenario[]> => {
    const { data, error } = await supabase
        .from('scenarios')
        .select('id,name,description,created_at,data')
        .order('created_at', { ascending: false });
    if (error) throw error;

    return ((data || []) as Scenario[]).filter(s => {
        if (opts.excludeAutoBackup && s.data?.metadata?.isAutoBackup) return false;
        if (s.data?.simulationConfig?.instructorKey === instructor.id) return true;
        const savedName = s.data?.simulationConfig?.instructorKey || s.data?.metadata?.instructorName;
        return !!savedName && isFuzzyNameMatch(savedName, instructor.name);
    });
};
