export interface AppSettings {
    key: string;
    value: string;
    description?: string;
}

export const DEFAULT_SETTINGS: Record<string, string> = {
    semester_start_date: '2026-02-16',
    semester_end_date: '2026-07-26',
    planning_cutoff_date: '2025-12-07',
    days_of_week: 'LUNES,MARTES,MIERCOLES,JUEVES,VIERNES,SABADO'
};
