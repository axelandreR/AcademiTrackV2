import React, { useState } from 'react';
import { Info, X } from 'lucide-react';

// Debe mantenerse alineado con getCategoryStyles() en ScheduleCard.tsx.
const LEGEND_ITEMS: { label: string; description: string; swatch: string }[] = [
    { label: 'Clase', description: 'Sesión académica del Excel base (TEC / TAL)', swatch: 'bg-[#D9FFFF] border-cyan-200' },
    { label: 'Autoestudio / VAEE', description: 'Sesión asíncrona del archivo', swatch: 'bg-slate-200 border-slate-300' },
    { label: 'Asíncrona', description: 'Tarea asíncrona agregada en el Editor', swatch: 'bg-[#e4f4dd] border-[#93bc81]' },
    { label: 'Preparación de clase', description: 'Horas de preparación (PC)', swatch: 'bg-[#FFFA48] border-[#eabc2d]' },
    { label: 'Coordinación / Otras', description: 'Coordinación y otras funciones', swatch: 'bg-[#e6fcf5] border-[#63e6be]' },
    { label: 'Por asignar', description: 'Horas pendientes de asignar', swatch: 'bg-violet-50 border-violet-200' },
    { label: 'Refrigerio', description: 'No cuenta para la meta de 46h', swatch: 'bg-slate-400 border-slate-500' },
    { label: 'Feriado', description: 'Día no laborable (auditoría suspendida)', swatch: 'bg-[#FEE2E2] border-rose-300' },
];

const ScheduleLegend: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                aria-label="Ver leyenda de colores"
                title="Leyenda de colores"
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
                <Info size={14} />
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-100">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><Info size={20} /></div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Leyenda de Colores</h3>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categorías de la grilla</p>
                                </div>
                            </div>
                            <button onClick={() => setIsOpen(false)} aria-label="Cerrar" className="p-2 hover:bg-white rounded-xl transition-all"><X size={20} className="text-slate-400" /></button>
                        </div>
                        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            {LEGEND_ITEMS.map(item => (
                                <div key={item.label} className="flex items-start space-x-3">
                                    <span className={`w-6 h-6 rounded-lg border-l-4 shrink-0 mt-0.5 ${item.swatch}`} />
                                    <div>
                                        <p className="text-xs font-black text-slate-900">{item.label}</p>
                                        <p className="text-[11px] text-slate-500 font-medium leading-snug">{item.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ScheduleLegend;
