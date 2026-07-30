import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, ArrowLeft, Plus, Edit2, Trash2, X, Upload, FileText, CheckCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Instructor } from '../types';
import { parseInstructorsFile } from '../services/excelParser';
import { generateInstructoresTemplate } from '../services/templateGenerator';
import ConfirmDialog from '../components/ConfirmDialog';

const InstructorsPage: React.FC = () => {
    const navigate = useNavigate();
    const { instructors, saveInstructorCloud, deleteInstructorCloud, bulkUpsertInstructors } = useData();

    const [managementSearch, setManagementSearch] = useState('');
    const [isManagementModalOpen, setIsManagementModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Instructor | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
    const [uploadResult, setUploadResult] = useState<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        setIsUploading(true);
        setUploadResult(null);
        try {
            const parsed = await parseInstructorsFile(file);
            if (parsed.length === 0) {
                setUploadResult('No se detectaron instructores válidos en el archivo.');
            } else {
                await bulkUpsertInstructors(parsed);
                setUploadResult(`${parsed.length} instructor(es) agregado(s)/actualizado(s) correctamente.`);
            }
        } catch (err: any) {
            console.error(err);
            setUploadResult('Error al procesar el archivo: ' + (err.message || 'formato inválido'));
        } finally {
            setIsUploading(false);
        }
    };

    const handleDownloadTemplate = async () => {
        setIsDownloadingTemplate(true);
        try {
            const blob = await generateInstructoresTemplate();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'AcademiTrack_Plantilla_Instructores.xlsx';
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e: any) {
            alert('Error al generar la plantilla: ' + e.message);
        } finally {
            setIsDownloadingTemplate(false);
        }
    };

    const filteredInstructors = useMemo(() =>
        instructors.filter(i =>
            i.name.toLowerCase().includes(managementSearch.toLowerCase()) ||
            i.id.includes(managementSearch)
        ),
        [instructors, managementSearch]);

    const handleSaveInstructor = (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const newInst: Instructor = {
            id: formData.get('id') as string,
            name: formData.get('name') as string,
            type: formData.get('type') as 'TC' | 'TP',
            maxHours: Number(formData.get('maxHours')),
            specialty: formData.get('specialty') as string,
            campus: formData.get('campus') as string,
            status: formData.get('status') as string,
        };

        if (editingItem) {
            saveInstructorCloud(newInst);
        } else {
            saveInstructorCloud(newInst);
        }
        setIsManagementModalOpen(false);
    };

    const handleDelete = (id: string) => setPendingDeleteId(id);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col h-screen overflow-hidden">
            <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-[100] shadow-sm">
                <div className="flex items-center space-x-6">
                    <button onClick={() => navigate('/')} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl text-white bg-indigo-600">
                            <Users size={20} />
                        </div>
                        <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Gestión de Instructores</h1>
                    </div>
                </div>
                <div className="flex items-center space-x-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={managementSearch}
                            onChange={e => setManagementSearch(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm font-bold w-64 focus:ring-2 focus:ring-slate-400"
                        />
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx, .xls" className="hidden" />
                    <button
                        onClick={handleDownloadTemplate}
                        disabled={isDownloadingTemplate}
                        className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-600 transition-all disabled:opacity-50"
                    >
                        <FileText size={16} /><span>{isDownloadingTemplate ? 'Generando...' : 'Plantilla'}</span>
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-600 transition-all disabled:opacity-50"
                    >
                        <Upload size={16} /><span>{isUploading ? 'Cargando...' : 'Cargar Excel'}</span>
                    </button>
                    <button
                        onClick={() => { setEditingItem(null); setIsManagementModalOpen(true); }}
                        className="flex items-center space-x-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
                    >
                        <Plus size={16} /><span>Añadir Instructor</span>
                    </button>
                </div>
            </header>

            {uploadResult && (
                <div className="px-8 pt-4">
                    <div className="flex items-center justify-between px-6 py-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl text-xs font-bold">
                        <div className="flex items-center space-x-2"><CheckCircle size={16} /><span>{uploadResult}</span></div>
                        <button onClick={() => setUploadResult(null)} className="text-emerald-400 hover:text-emerald-700"><X size={16} /></button>
                    </div>
                </div>
            )}

            <main className="flex-1 overflow-auto p-8">
                <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Trabajador</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Horas Max</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Especialidad</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sede</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredInstructors.map(inst => (
                                <tr key={inst.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-6 py-4 text-sm font-bold text-slate-600">{inst.id}</td>
                                    <td className="px-6 py-4 text-sm font-black text-slate-900">{inst.name}</td>
                                    <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{inst.type}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-500">{inst.maxHours}h</td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-500">{inst.specialty}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-500">{inst.campus}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-all">
                                            <button onClick={() => { setEditingItem(inst); setIsManagementModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(inst.id)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>

            {isManagementModalOpen && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
                        <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{editingItem ? 'Editar' : 'Crear'} Instructor</h3>
                            <button onClick={() => setIsManagementModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSaveInstructor} className="p-10 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">ID Instructor</label><input required name="id" defaultValue={editingItem?.id} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Nombre Completo</label><input required name="name" defaultValue={editingItem?.name} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                            </div>
                            <div className="grid grid-cols-3 gap-6">
                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Tipo</label><select name="type" defaultValue={editingItem?.type} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold"><option value="TC">Tiempo Completo (TC)</option><option value="TP">Tiempo Parcial (TP)</option></select></div>
                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Horas Max</label><input type="number" name="maxHours" defaultValue={editingItem?.maxHours} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Sede</label><input name="campus" defaultValue={editingItem?.campus} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                            </div>
                            <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Especialidad</label><input name="specialty" defaultValue={editingItem?.specialty} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                            <input type="hidden" name="status" value="Activo" />

                            <div className="flex justify-end space-x-4 pt-6 border-t border-slate-100">
                                <button type="button" onClick={() => setIsManagementModalOpen(false)} className="px-8 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Cancelar</button>
                                <button type="submit" className="px-10 py-3 bg-slate-900 text-white text-xs font-black rounded-2xl uppercase tracking-widest shadow-xl">Guardar Cambios</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={pendingDeleteId !== null}
                title="Eliminar instructor"
                message="Se eliminará este instructor del catálogo de forma permanente. Sus horarios cargados no se borran, pero quedarán sin instructor asociado."
                confirmLabel="Eliminar"
                variant="danger"
                onCancel={() => setPendingDeleteId(null)}
                onConfirm={() => {
                    if (pendingDeleteId) deleteInstructorCloud(pendingDeleteId);
                    setPendingDeleteId(null);
                }}
            />
        </div>
    );
};

export default InstructorsPage;
