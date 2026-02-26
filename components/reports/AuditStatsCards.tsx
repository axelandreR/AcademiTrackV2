
import React from 'react';
import { Users, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

interface AuditStatsCardsProps {
    stats: {
        total: number;
        perfectCycle: number;
        withDeficit: number; // Used for "Con Observación" (total - perfectCycle) in current logic
        balanced: number;
    }
}

const AuditStatsCards: React.FC<AuditStatsCardsProps> = ({ stats }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            <div className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 flex items-center space-x-5">
                <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><Users size={28} /></div>
                <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Docentes</p><h4 className="text-3xl font-black text-slate-900">{stats.total}</h4></div>
            </div>
            <div className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 flex items-center space-x-5">
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><CheckCircle size={28} /></div>
                <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ciclo Perfecto</p><h4 className="text-3xl font-black text-emerald-600">{stats.perfectCycle}</h4></div>
            </div>
            <div className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 flex items-center space-x-5">
                <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl"><AlertTriangle size={28} /></div>
                <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Con Observación</p><h4 className="text-3xl font-black text-rose-600">{stats.total - stats.perfectCycle}</h4></div>
            </div>
            <div className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 flex items-center space-x-5">
                <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><Clock size={28} /></div>
                <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Equilibrados S1</p><h4 className="text-3xl font-black text-indigo-600">{stats.balanced}</h4></div>
            </div>
        </div>
    );
};

export default AuditStatsCards;
