
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface AuditAlertProps {
    show: boolean;
    deficit: boolean;
    onClose: () => void;
}

const AuditAlert: React.FC<AuditAlertProps> = ({ show, deficit, onClose }) => {
    if (!show || !deficit) return null;

    return (
        <div className="fixed top-[140px] left-1/2 -translate-x-1/2 lg:left-[350px] lg:translate-x-0 z-[150] bg-rose-600 text-white p-5 lg:p-6 rounded-2xl lg:rounded-3xl shadow-2xl border-4 border-white animate-in zoom-in flex items-center space-x-4 max-w-[90vw]">
            <div className="p-2 lg:p-3 bg-white/20 rounded-xl lg:rounded-2xl shrink-0"><AlertTriangle size={24} /></div>
            <div>
                <p className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Carga Académica</p>
                <h4 className="text-xs lg:text-sm font-black uppercase">¡OBSERVACIÓN DETECTADA!</h4>
                <p className="text-[9px] lg:text-[10px] font-medium mt-1">Ajuste requerido en carga administrativa.</p>
            </div>
            <button onClick={onClose} className="ml-2 lg:ml-4 p-1 hover:bg-white/20 rounded-lg shrink-0"><X size={16} /></button>
        </div>
    );
};

export default AuditAlert;
