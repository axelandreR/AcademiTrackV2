
import { useMemo } from 'react';
import { ProcessedSchedule, InstitutionalReference } from '../types';
import { reconcileSchedules } from '../services/reconciliationService';

export const useReconciliationReport = (
    schedules: ProcessedSchedule[],
    institutionalReferences: InstitutionalReference[],
    isActive: boolean // Flag to control if calculation should run (for performance)
) => {
    const reconciliationResults = useMemo(() => {
        if (!isActive) return [];
        return reconcileSchedules(schedules, institutionalReferences);
    }, [schedules, institutionalReferences, isActive]);

    return { reconciliationResults };
};
