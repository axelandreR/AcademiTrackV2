import React from 'react';
import { X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Instructor } from '../types';

interface InstructorEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** null = crear instructor nuevo; con valor = editar (el ID queda de solo lectura). */
    instructor: Instructor | null;
}

/**
 * Formulario de ficha de instructor compartido entre pages/InstructorsPage.tsx y
 * ProgressPanel.tsx (Avance Horarios) — mismo formulario, misma persistencia
 * (saveInstructorCloud escribe directo a la tabla real de Supabase, no hay modo
 * simulación aquí), para no mantener dos copias del mismo form desincronizadas.
 */
const InstructorEditModal: React.FC<InstructorEditModalProps> = ({ isOpen, onClose, instructor }) => {
    const { saveInstructorCloud } = useData();

    if (!isOpen) return null;

    const isEditing = !!instructor;

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const newInst: Instructor = {
            id: isEditing ? instructor!.id : (formData.get('id') as string),
            name: formData.get('name') as string,
            type: formData.get('type') as 'TC' | 'TP',
            maxHours: Number(formData.get('maxHours')),
            specialty: formData.get('specialty') as string,
            campus: formData.get('campus') as string,
            status: formData.get('status') as string,
        };
        saveInstructorCloud(newInst);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
                <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{isEditing ? 'Editar' : 'Crear'} Instructor</h3>
                    <button onClick={onClose} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-10 space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase">ID Instructor</label>
                            <input
                                required
                                name="id"
                                defaultValue={instructor?.id}
                                readOnly={isEditing}
                                title={isEditing ? 'El ID no se puede modificar: es la referencia usada por los horarios ya cargados de este instructor.' : undefined}
                                className={`w-full px-4 py-3 rounded-2xl font-bold ${isEditing ? 'bg-slate-100/60 text-slate-400 cursor-not-allowed' : 'bg-slate-100'}`}
                            />
                        </div>
                        <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Nombre Completo</label><input required name="name" defaultValue={instructor?.name} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-6">
                        <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Tipo</label><select name="type" defaultValue={instructor?.type} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold"><option value="TC">Tiempo Completo (TC)</option><option value="TP">Tiempo Parcial (TP)</option></select></div>
                        <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Horas Max</label><input type="number" name="maxHours" defaultValue={instructor?.maxHours} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                        <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Sede</label><input name="campus" defaultValue={instructor?.campus} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                    </div>
                    <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Especialidad</label><input name="specialty" defaultValue={instructor?.specialty} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                    <input type="hidden" name="status" value={instructor?.status || 'Activo'} />

                    <div className="flex justify-end space-x-4 pt-6 border-t border-slate-100">
                        <button type="button" onClick={onClose} className="px-8 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Cancelar</button>
                        <button type="submit" className="px-10 py-3 bg-slate-900 text-white text-xs font-black rounded-2xl uppercase tracking-widest shadow-xl">Guardar Cambios</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default InstructorEditModal;
