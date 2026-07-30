export interface AppSettings {
    key: string;
    value: string;
    description?: string;
}

export const DEFAULT_SETTINGS: Record<string, string> = {
    semester_start_date: '2026-08-17',
    semester_end_date: '2027-01-17',
    days_of_week: 'LUNES,MARTES,MIERCOLES,JUEVES,VIERNES,SABADO',
    // Hasta dónde se exige horario completo para marcar auditoría "OK" (Avance de
    // Horarios). Editable desde el ícono de ajustes de ese panel; este valor solo
    // aplica como respaldo si la tabla app_settings todavía no tiene una fila para
    // esta clave.
    audit_validation_cutoff_date: '2027-01-17'
};
