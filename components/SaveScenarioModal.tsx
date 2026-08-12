import React, { useEffect, useRef, useState } from 'react';
import { Save, X, RefreshCw, FilePlus2 } from 'lucide-react';

interface SaveScenarioModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaveNew: (name: string) => void | Promise<void>;
    /** Si hay un escenario cargado/recién guardado, permite actualizarlo en vez de crear otro. */
    onUpdateExisting?: () => void | Promise<void>;
    currentScenarioName?: string | null;
}

type Mode = 'choice' | 'new';

/**
 * Reemplaza el prompt() nativo usado antes para pedir el nombre del escenario —
 * en algunos contextos (PWA instalada, ciertas políticas de seguridad, iframes)
 * prompt() lanza una excepción no capturada y el guardado se aborta en silencio
 * sin que el usuario vea ningún error.
 *
 * Si la simulación proviene de un escenario ya guardado (currentScenarioName),
 * primero ofrece elegir entre actualizar ese mismo registro o crear uno nuevo —
 * antes "Guardar Escenario" siempre creaba uno nuevo, sin poder sobrescribir el
 * que ya se había guardado antes de salir y volver a entrar.
 */
const SaveScenarioModal: React.FC<SaveScenarioModalProps> = ({ isOpen, onClose, onSaveNew, onUpdateExisting, currentScenarioName }) => {
    const hasExisting = !!onUpdateExisting && !!currentScenarioName;
    const [mode, setMode] = useState<Mode>(hasExisting ? 'choice' : 'new');
    const [name, setName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setMode(hasExisting ? 'choice' : 'new');
            setName('');
            setIsSaving(false);
        }
    }, [isOpen, hasExisting]);

    useEffect(() => {
        if (isOpen && mode === 'new') {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen, mode]);

    if (!isOpen) return null;

    const trimmed = name.trim();

    const handleSaveNew = async () => {
        if (!trimmed || isSaving) return;
        setIsSaving(true);
        try {
            await onSaveNew(trimmed);
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdate = async () => {
        if (!onUpdateExisting || isSaving) return;
        setIsSaving(true);
        try {
            await onUpdateExisting();
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-label="Guardar Escenario"
        >
            <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-100">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-amber-100 text-amber-600">
                            <Save size={20} />
                        </div>
                        <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Guardar Escenario</h3>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="p-2 hover:bg-white rounded-xl transition-all">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                {mode === 'choice' ? (
                    <>
                        <div className="p-6 space-y-3">
                            <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                Esta simulación viene del escenario <span className="font-black text-slate-700">"{currentScenarioName}"</span>. ¿Qué quieres hacer?
                            </p>
                            <button
                                onClick={handleUpdate}
                                disabled={isSaving}
                                className="w-full flex items-center gap-3 p-4 bg-slate-50 hover:bg-amber-50 border-2 border-slate-100 hover:border-amber-300 rounded-2xl transition-all text-left disabled:opacity-50"
                            >
                                <div className="p-2 rounded-xl bg-amber-100 text-amber-600 shrink-0">
                                    {isSaving ? <div className="animate-spin h-4 w-4 border-2 border-amber-600 rounded-full border-t-transparent" /> : <RefreshCw size={18} />}
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-800 uppercase tracking-wide">Actualizar Escenario Actual</p>
                                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">Sobrescribe "{currentScenarioName}" con los cambios de ahora.</p>
                                </div>
                            </button>
                            <button
                                onClick={() => setMode('new')}
                                disabled={isSaving}
                                className="w-full flex items-center gap-3 p-4 bg-slate-50 hover:bg-indigo-50 border-2 border-slate-100 hover:border-indigo-300 rounded-2xl transition-all text-left disabled:opacity-50"
                            >
                                <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600 shrink-0">
                                    <FilePlus2 size={18} />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-800 uppercase tracking-wide">Guardar como Nuevo</p>
                                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">Crea un escenario distinto, sin tocar el actual.</p>
                                </div>
                            </button>
                        </div>
                        <div className="p-6 pt-0 flex justify-end">
                            <button onClick={onClose} className="px-6 py-2.5 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-slate-700 transition-colors">
                                Cancelar
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="p-6 space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre del escenario</label>
                            <input
                                ref={inputRef}
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNew(); }}
                                placeholder="Ej. Reasignación turno tarde"
                                maxLength={120}
                                className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-amber-500 focus:ring-0 transition-all font-bold text-slate-800 text-sm"
                            />
                            <p className="text-[10px] text-slate-400 font-medium ml-1">Para uso futuro — podrás cargarlo desde "Simulaciones Guardadas".</p>
                        </div>
                        <div className="p-6 bg-slate-50 flex justify-end gap-3">
                            {hasExisting ? (
                                <button
                                    onClick={() => setMode('choice')}
                                    className="px-6 py-2.5 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-slate-700 transition-colors"
                                >
                                    Atrás
                                </button>
                            ) : (
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2.5 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-slate-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                            )}
                            <button
                                onClick={handleSaveNew}
                                disabled={!trimmed || isSaving}
                                className="px-6 py-2.5 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSaving && <div className="animate-spin h-3 w-3 border-2 border-white rounded-full border-t-transparent" />}
                                {isSaving ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SaveScenarioModal;
