
import React, { useState } from 'react';
import {
  FileDown, Search, ArrowLeft, BarChart4, Download, Scale
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { ProcessedSchedule, Instructor, HolidayData, ReconciliationResult } from '../types';
import { generateGlobalAuditExcel, generateIdealStructureExport } from '../services/excelExporter';
import { parseInstitutionalReport } from '../services/excelParser';
import ValidationPanel from './ValidationPanel';
import { useAuditReport } from '../hooks/useAuditReport';
import { useConflictReport } from '../hooks/useConflictReport';
import { useReconciliationReport } from '../hooks/useReconciliationReport';
import AuditStatsCards from './reports/AuditStatsCards';
import AuditTable from './reports/AuditTable';
import ConflictsRadar from './reports/ConflictsRadar';
import ReconciliationView from './reports/ReconciliationView';
import ReconciliationDetailModal from './reports/ReconciliationDetailModal';
import { DeepAuditResult } from '../services/auditCalculations';
import { CheckCircle, AlertTriangle, X, Clock, Calendar } from 'lucide-react';

interface ReportsDashboardProps {
  schedules: ProcessedSchedule[];
  instructors: Instructor[];
  holidays: HolidayData[];
  onBack: () => void;
}

const ReportsDashboard: React.FC<ReportsDashboardProps> = ({ schedules, instructors, holidays, onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAudit, setSelectedAudit] = useState<DeepAuditResult | null>(null);
  const [selectedReconResult, setSelectedReconResult] = useState<ReconciliationResult | null>(null);
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'audit' | 'conflicts'>('audit');

  const { holidaysMap, institutionalReferences, uploadInstitutionalReference } = useData();
  const navigate = useNavigate();

  // --- Custom Hooks ---
  // --- Custom Hooks ---
  const { auditData, stats, semesterRange } = useAuditReport(schedules, instructors, holidays);
  const { conflictData } = useConflictReport(schedules, semesterRange, holidaysMap, instructors);

  const { reconciliationResults } = useReconciliationReport(schedules, institutionalReferences, true);

  const handleInstitutionalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await parseInstitutionalReport(file);
      await uploadInstitutionalReference(data);
    } catch (err) {
      alert("Error al procesar reporte institucional.");
    }
  };

  const handleGlobalExport = async () => {
    setIsExporting(true);
    try {
      const blob = await generateGlobalAuditExcel(instructors, schedules, holidays);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Auditoria_Global_Carga_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
    } catch (e) {
      alert("Error al generar reporte global.");
    } finally {
      setIsExporting(false);
    }
  };

  const filteredAudit = auditData.filter(i =>
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.specialty.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCorrectConflict = (view: 'Instructor' | 'Aula', filterValue: string, date: string) => {
    onBack();
    navigate(`/schedule?view=${view}&filter=${encodeURIComponent(filterValue)}&date=${date}`);
  };

  if (showValidationPanel) {
    return <ValidationPanel onBack={() => setShowValidationPanel(false)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col animate-in fade-in duration-500">
      <header className="bg-white border-b border-slate-200 px-8 py-6 flex items-center justify-between sticky top-0 z-[100] shadow-sm">
        <div className="flex items-center space-x-6">
          <button onClick={onBack} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-600 transition-all active:scale-95"><ArrowLeft size={22} /></button>
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100"><BarChart4 size={24} /></div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Auditoría Global</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mt-1">Reporte de Carga y Ciclo Lectivo</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mr-4">
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'audit' ? 'bg-white text-indigo-600 shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
              Carga Horaria
            </button>
            <button
              onClick={() => setActiveTab('conflicts')}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center space-x-2 ${activeTab === 'conflicts' ? 'bg-white text-rose-600 shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
              {conflictData.length > 0 && <div className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />}
              <span>Conflictos ({conflictData.length})</span>
            </button>
            <button
              onClick={() => setShowValidationPanel(true)}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 text-slate-400 hover:text-indigo-600 hover:bg-white/50`}
            >
              <Scale size={14} />
              <span>Validación Sistema</span>
            </button>
          </div>
          {activeTab === 'audit' && (
            <>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="Buscar instructor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-12 pr-6 py-3 bg-slate-100 border-none rounded-2xl text-sm font-bold w-80 focus:ring-2 focus:ring-indigo-600 transition-all shadow-inner" />
              </div>
              <button
                disabled={isExporting}
                onClick={handleGlobalExport}
                className="flex items-center space-x-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
              >
                {isExporting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FileDown size={18} />}
                <span>{isExporting ? 'Generando...' : 'Excel Global'}</span>
              </button>
              <button
                disabled={isExporting}
                onClick={async () => {
                  setIsExporting(true);
                  try {
                    const blob = await generateIdealStructureExport(schedules, instructors);
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Data_Ideal_App_${new Date().toISOString().split('T')[0]}.xlsx`;
                    a.click();
                  } catch (e) {
                    alert("Error al generar reporte de estructura ideal.");
                  } finally {
                    setIsExporting(false);
                  }
                }}
                className="flex items-center space-x-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 disabled:opacity-50"
              >
                <Download size={18} />
                <span>Estructura Ideal</span>
              </button>
            </>
          )}
        </div>
      </header>

      <main className="p-10 flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'audit' ? (
          <>
            <AuditStatsCards stats={stats} />
            <AuditTable filteredAudit={filteredAudit} onSelectAudit={setSelectedAudit} />
          </>
        ) : activeTab === 'conflicts' ? (
          <ConflictsRadar conflictData={conflictData} onCorrectConflict={handleCorrectConflict} />
        ) : (
          <ReconciliationView
            institutionalReferences={institutionalReferences}
            reconciliationResults={reconciliationResults}
            schedules={schedules}
            onUploadReference={handleInstitutionalUpload}
            onSelectResult={setSelectedReconResult}
          />
        )}
      </main>

      {/* MODAL DETALLE AUDITORIA */}
      {selectedAudit && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-2xl text-white shadow-xl ${selectedAudit.isPerfect ? 'bg-emerald-600 shadow-emerald-100' : 'bg-rose-600 shadow-rose-100'}`}>
                  {selectedAudit.isPerfect ? <CheckCircle size={24} /> : <AlertTriangle size={24} />}
                </div>
                <div><h3 className="text-xl font-black text-slate-900 leading-tight">Auditoría Semestral</h3><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedAudit.instructorName}</p></div>
              </div>
              <button onClick={() => setSelectedAudit(null)} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><X size={24} className="text-slate-400" /></button>
            </div>
            <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
              {selectedAudit.isPerfect ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <div className="p-6 bg-emerald-50 rounded-full text-emerald-600"><CheckCircle size={64} /></div>
                  <h4 className="text-2xl font-black text-slate-900">¡Programación Impecable!</h4>
                  <p className="text-xs text-slate-400">Nota: Auditoría limitada hasta el 28/06 y omitida en semanas con feriados.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedAudit.discrepancies.map((d, idx) => (
                    <div key={idx} className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-3xl group hover:border-indigo-200 hover:bg-white transition-all shadow-sm">
                      <div className="flex items-center space-x-4">
                        <div className={`p-2 rounded-xl ${d.type === 'daily_excess' ? 'bg-rose-50 text-rose-500' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600'} transition-colors`}>
                          {d.type === 'daily_excess' ? <Clock size={18} /> : <Calendar size={18} />}
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">
                            {d.type === 'daily_excess'
                              ? d.weekStart.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'short' })
                              : `Semana ${d.weekStart.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`}
                          </p>
                          <p className="text-xs font-black text-slate-700">
                            {d.type === 'daily_excess' ? 'Exceso de Jornada' : 'Discrepancia de carga'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-[10px] font-black uppercase ${d.type === 'deficit' ? 'text-rose-600' : 'text-amber-600'}`}>
                          {d.type === 'deficit' ? '-' : '+'}{d.diff.toFixed(2)}h
                        </div>
                        <div className="text-[9px] font-bold text-slate-400">
                          {d.type === 'daily_excess'
                            ? `Total: ${d.real.toFixed(2)}h (Límite ${d.meta}h)`
                            : `Real: ${d.real.toFixed(2)}h / Meta: ${d.meta.toFixed(2)}h`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button onClick={() => setSelectedAudit(null)} className="px-10 py-3 bg-slate-900 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all">Entendido</button>
            </div>
          </div>
        </div>
      )}

      {selectedReconResult && (
        <ReconciliationDetailModal
          result={selectedReconResult}
          schedules={schedules}
          onClose={() => setSelectedReconResult(null)}
        />
      )}
    </div>
  );
};

export default ReportsDashboard;
