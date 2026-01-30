import React, { useMemo, useState } from 'react';
import {
  FileDown, Search, ArrowRight, TrendingUp, Users, Clock, AlertTriangle, CheckCircle, ShieldAlert, Activity, ChevronRight, Download,
  ArrowLeft, BarChart4, UserCircle2, Minus, X, Calendar, AlertCircle, Info, Briefcase, Calendar as CalendarIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isOtherFunctionsCourse, isAcademicMetaLoad, isContractualLoad, isExcludedFromTotalLoad } from '../services/businessRules';
import { ProcessedSchedule, InstructorData, HolidayData } from '../types';
import { generateGlobalAuditExcel } from '../services/excelExporter';

const SEMESTER_START_DATE = new Date(2026, 1, 16); // 16/02/2026
const SEMESTER_END_DATE = new Date(2026, 5, 28);   // 28/06/2026

interface ReportsDashboardProps {
  schedules: ProcessedSchedule[];
  instructors: InstructorData[];
  holidays: HolidayData[];
  onBack: () => void;
}

interface Discrepancy {
  weekStart: Date;
  weekEnd?: Date;
  meta: number;
  real: number;
  diff: number;
  type: 'deficit' | 'excess' | 'daily_excess';
}

interface DeepAuditResult {
  instructorName: string;
  isPerfect: boolean;
  discrepancies: Discrepancy[];
}

const ReportsDashboard: React.FC<ReportsDashboardProps> = ({ schedules, instructors, holidays, onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAudit, setSelectedAudit] = useState<DeepAuditResult | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const timeToMin = (t: string) => {
    const parts = t.split(':');
    if (parts.length < 2) return 0;
    const h = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    return h * 60 + m;
  };

  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const semesterRange = useMemo(() => {
    if (schedules.length === 0) return { start: new Date(), end: new Date() };
    const starts = schedules.map(s => s.startDate.getTime());
    const ends = schedules.map(s => s.endDate.getTime());
    return {
      start: getStartOfWeek(new Date(Math.max(Math.min(...starts), SEMESTER_START_DATE.getTime()))),
      // El fin de rango para auditoría nunca debe exceder el fin de semestre oficial
      end: new Date(Math.min(Math.max(...ends), SEMESTER_END_DATE.getTime()))
    };
  }, [schedules]);

  const auditData = useMemo(() => {
    const { start: globalStart, end: globalEnd } = semesterRange;
    const firstWeekStart = new Date(globalStart);

    return instructors.map(inst => {
      const isTC = inst.type === 'TC';
      const instSchedules = schedules.filter(s => s.instructor === inst.name);
      const instAcademic = instSchedules.filter(s => !s.isAdministrative);

      let metaCargaS1 = 0;
      let totalSyncS1 = 0;
      let totalAsyncS1 = 0;
      let hasHolidayS1 = false;

      // --- Auditoría Semana 1 (Vista rápida de la tabla) ---
      // Nueva lógica: Sumamos la carga de tareas ACTIVAS en esta semana específica
      const weekStartAt = firstWeekStart.getTime();
      const weekEndAt = new Date(firstWeekStart); weekEndAt.setDate(firstWeekStart.getDate() + 6);
      const weekEndAtTime = weekEndAt.getTime();

      const activeAcademicWeek1 = instAcademic.filter(s => s.startDate.getTime() <= weekEndAtTime && s.endDate.getTime() >= weekStartAt);
      metaCargaS1 = activeAcademicWeek1.reduce((sum, s) => sum + s.weeklyHours, 0);

      let hasDailyBreachS1 = false;
      const dailyLimit = isTC ? 9.2 : 7.0;

      for (let i = 0; i < 7; i++) {
        const currentDate = new Date(firstWeekStart); currentDate.setDate(firstWeekStart.getDate() + i);
        if (currentDate > SEMESTER_END_DATE) continue;

        const dayNames = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
        const dayName = dayNames[currentDate.getDay()];
        const hol = holidays.find(h =>
          h.date.getDate() === currentDate.getDate() &&
          h.date.getMonth() === currentDate.getMonth() &&
          h.date.getFullYear() === currentDate.getFullYear()
        );
        if (hol) hasHolidayS1 = true;

        let dayMinS1 = 0;
        instSchedules.filter(s => s.days.includes(dayName) && currentDate >= s.startDate && currentDate <= s.endDate)
          .forEach(s => {
            const durTotal = (timeToMin(s.endTime) - timeToMin(s.startTime));
            if (isContractualLoad(s)) dayMinS1 += durTotal;

            const dur = durTotal / 60;
            if (isAcademicMetaLoad(s)) {
              totalSyncS1 += dur;
            } else if (!isExcludedFromTotalLoad(s)) {
              totalAsyncS1 += dur;
            }
          });

        if (dayMinS1 / 60 > dailyLimit + 0.01 && !hol) hasDailyBreachS1 = true;
      }

      // --- Auditoría Semestral Detallada (Botón de lupa) ---
      const discrepancies: Discrepancy[] = [];
      let scannerDate = new Date(globalStart);

      while (scannerDate <= globalEnd && scannerDate <= SEMESTER_END_DATE) {
        let wMeta = 0;
        let wReal = 0;
        let hasHolidayInWeek = false;

        const scanStart = scannerDate.getTime();
        const scanEnd = new Date(scannerDate); scanEnd.setDate(scannerDate.getDate() + 6);
        const scanEndTime = scanEnd.getTime();

        // 1. Meta de la semana (por tareas activas que cuentan para meta académica)
        const weeklyTasks = instSchedules.filter(s => isAcademicMetaLoad(s) && s.startDate.getTime() <= scanEndTime && s.endDate.getTime() >= scanStart);
        wMeta = weeklyTasks.reduce((sum, s) => sum + s.weeklyHours, 0);

        // 2. Ejecución real (por cuadritos en el calendario)
        for (let i = 0; i < 7; i++) {
          const d = new Date(scannerDate); d.setDate(scannerDate.getDate() + i);
          if (d > SEMESTER_END_DATE) continue;

          const dName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][d.getDay()];
          const hol = holidays.find(h =>
            h.date.getDate() === d.getDate() &&
            h.date.getMonth() === d.getMonth() &&
            h.date.getFullYear() === d.getFullYear()
          );
          if (hol) hasHolidayInWeek = true;

          let dayMinScanner = 0;
          instSchedules.filter(s => s.days.includes(dName) && d >= s.startDate && d <= s.endDate).forEach(s => {
            const durTotal = (timeToMin(s.endTime) - timeToMin(s.startTime));
            if (isContractualLoad(s)) dayMinScanner += durTotal;

            const dur = durTotal / 60;
            if (isAcademicMetaLoad(s)) {
              wReal += dur;
            }
          });

          // Validación diaria en escáner
          if (dayMinScanner / 60 > dailyLimit + 0.01 && !hol) {
            discrepancies.push({
              weekStart: new Date(d),
              meta: dailyLimit,
              real: dayMinScanner / 60,
              diff: (dayMinScanner / 60) - dailyLimit,
              type: 'daily_excess'
            });
          }
        }

        // REGLA: Ignorar discrepancias semanales en semanas con feriado
        if (!hasHolidayInWeek && Math.abs(wReal - wMeta) > 0.01) {
          discrepancies.push({
            weekStart: new Date(scannerDate), weekEnd: new Date(scanEndTime),
            meta: wMeta, real: wReal, diff: Math.abs(wReal - wMeta),
            type: wReal < wMeta ? 'deficit' : 'excess'
          });
        }
        scannerDate.setDate(scannerDate.getDate() + 7);
      }

      const cargaRealS1 = totalSyncS1 + totalAsyncS1;
      const isWeekBeforeSemester = weekEndAtTime < SEMESTER_START_DATE.getTime();
      const isWeekAfterSemester = weekStartAt > SEMESTER_END_DATE.getTime();

      // REGLA: Si hay feriado en S1 o la semana está fuera de periodo, no hay déficit
      const deficitS1 = !hasHolidayS1 && !isWeekBeforeSemester && !isWeekAfterSemester && (cargaRealS1 < metaCargaS1 - 0.01);

      let finalStatus: 'DEFICIT' | 'EXCESO' | 'OK' | 'NO_LOAD' = deficitS1 ? 'DEFICIT' : (cargaRealS1 > metaCargaS1 + 0.01 && !hasHolidayS1 && !isWeekBeforeSemester && !isWeekAfterSemester ? 'EXCESO' : 'OK');
      if (finalStatus === 'OK' && hasDailyBreachS1 && !isWeekBeforeSemester && !isWeekAfterSemester) finalStatus = 'EXCESO';
      if ((metaCargaS1 === 0 && cargaRealS1 === 0) || isWeekBeforeSemester || isWeekAfterSemester) finalStatus = 'NO_LOAD';

      return {
        ...inst,
        metaCarga: metaCargaS1, cargaReal: cargaRealS1,
        totalSync: totalSyncS1, totalAsync: totalAsyncS1,
        status: finalStatus,
        hasHolidayS1,
        hasDailyBreachS1,
        deepAudit: { instructorName: inst.name, isPerfect: discrepancies.length === 0, discrepancies }
      };
    });
  }, [schedules, instructors, holidays, semesterRange]);

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

  const stats = {
    total: auditData.length,
    withDeficit: auditData.filter(i => i.status === 'DEFICIT').length,
    balanced: auditData.filter(i => i.status === 'OK').length,
    perfectCycle: auditData.filter(i => i.deepAudit.isPerfect).length,
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col animate-in fade-in duration-500">
      <header className="bg-white border-b border-slate-200 px-8 py-6 flex items-center justify-between sticky top-0 z-[100] shadow-sm">
        <div className="flex items-center space-x-6">
          <button onClick={onBack} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-600 transition-all active:scale-95"><ArrowLeft size={22} /></button>
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100"><BarChart4 size={24} /></div>
            <div><h1 className="text-2xl font-black text-slate-900 tracking-tight">Auditoría Global</h1><p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mt-1">Reporte de Carga y Ciclo Lectivo</p></div>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="Buscar instructor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-12 pr-6 py-3 bg-slate-100 border-none rounded-2xl text-sm font-bold w-80 focus:ring-2 focus:ring-indigo-600 transition-all shadow-inner" /></div>
          <button
            disabled={isExporting}
            onClick={handleGlobalExport}
            className="flex items-center space-x-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
          >
            {isExporting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FileDown size={18} />}
            <span>{isExporting ? 'Generando...' : 'Excel Global'}</span>
          </button>
        </div>
      </header>

      <main className="p-10 flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          <div className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 flex items-center space-x-5"><div className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><Users size={28} /></div><div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Docentes</p><h4 className="text-3xl font-black text-slate-900">{stats.total}</h4></div></div>
          <div className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 flex items-center space-x-5"><div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><CheckCircle size={28} /></div><div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ciclo Perfecto</p><h4 className="text-3xl font-black text-emerald-600">{stats.perfectCycle}</h4></div></div>
          <div className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 flex items-center space-x-5"><div className="p-4 bg-rose-50 text-rose-600 rounded-2xl"><AlertTriangle size={28} /></div><div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Con Observación</p><h4 className="text-3xl font-black text-rose-600">{stats.total - stats.perfectCycle}</h4></div></div>
          <div className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 flex items-center space-x-5"><div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><Clock size={28} /></div><div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Equilibrados S1</p><h4 className="text-3xl font-black text-indigo-600">{stats.balanced}</h4></div></div>
        </div>

        <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Instructor / ID</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Carrera / Tipo</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Carga Archivo (S1)</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ejecución Real (S1)</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Auditoría Ciclo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAudit.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors"><UserCircle2 size={20} /></div>
                      <div><p className="text-sm font-black text-slate-900 leading-tight truncate max-w-[200px]">{row.name}</p><p className="text-[10px] font-bold text-slate-400 mt-0.5">{row.id}</p></div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col"><span className="text-[10px] font-black text-slate-600 uppercase tracking-tighter truncate max-w-[150px]">{row.specialty}</span><span className={`text-[9px] font-black mt-1 px-2 py-0.5 rounded-md w-fit ${row.type === 'TC' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{row.type === 'TC' ? 'Tiempo Completo' : 'Tiempo Parcial'}</span></div>
                  </td>
                  <td className="px-8 py-5 text-sm font-black text-slate-500">{row.metaCarga.toFixed(2)}h</td>
                  <td className="px-8 py-5">
                    <div className="flex items-center space-x-2">
                      <Activity size={14} className="text-slate-300" />
                      <span className={`text-sm font-black ${row.status === 'DEFICIT' ? 'text-rose-600' : row.status === 'EXCESO' ? 'text-amber-600' : row.status === 'NO_LOAD' ? 'text-amber-500' : 'text-emerald-600'}`}>
                        {row.cargaReal.toFixed(2)}h
                      </span>
                      {row.hasDailyBreachS1 && (
                        <div className="flex items-center justify-center p-1 bg-rose-50 text-rose-600 rounded-lg" title="Exceso de jornada diaria">
                          <Clock size={12} />
                        </div>
                      )}
                    </div>
                    {row.hasHolidayS1 && <span className="text-[8px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase mt-1 block w-fit">Feriado</span>}
                  </td>
                  <td className="px-8 py-5 text-center">
                    <button
                      disabled={row.status === 'NO_LOAD'}
                      onClick={() => setSelectedAudit(row.deepAudit)}
                      className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl transition-all shadow-md ${row.status !== 'NO_LOAD' ? 'hover:scale-110 active:scale-95' : 'opacity-80'} ${row.status === 'NO_LOAD' ? 'bg-amber-100 text-amber-500' : (row.deepAudit.isPerfect ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-rose-100 text-rose-600 hover:bg-rose-200')}`}
                    >
                      {row.status === 'NO_LOAD' ? <Minus size={24} className="stroke-[3]" /> : (row.deepAudit.isPerfect ? <CheckCircle size={24} /> : <X size={24} />)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

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
    </div>
  );
};

export default ReportsDashboard;
