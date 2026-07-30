import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search, ArrowLeft, Plus, Edit2, Trash2, X, Upload, FileText, CheckCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { RoomData } from '../types';
import { parseRoomsFile } from '../services/excelParser';
import { generateAulaTemplate } from '../services/templateGenerator';
import ConfirmDialog from '../components/ConfirmDialog';

const RoomsPage: React.FC = () => {
    const navigate = useNavigate();
    const { rooms, saveRoomCloud, deleteRoomCloud, bulkUpsertRooms } = useData();

    const [managementSearch, setManagementSearch] = useState('');
    const [isManagementModalOpen, setIsManagementModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<RoomData | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
    const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
    const [uploadResult, setUploadResult] = useState<string | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        setIsUploading(true);
        setUploadResult(null);
        try {
            const parsed = await parseRoomsFile(file);
            if (parsed.length === 0) {
                setUploadResult('No se detectaron aulas válidas en el archivo.');
            } else {
                await bulkUpsertRooms(parsed);
                setUploadResult(`${parsed.length} aula(s) agregada(s)/actualizada(s) correctamente.`);
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
            const blob = await generateAulaTemplate();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'AcademiTrack_Plantilla_Aulas.xlsx';
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e: any) {
            alert('Error al generar la plantilla: ' + e.message);
        } finally {
            setIsDownloadingTemplate(false);
        }
    };

    const filteredRooms = useMemo(() =>
        rooms.filter(r =>
            r.roomKey.toLowerCase().includes(managementSearch.toLowerCase()) ||
            r.career.toLowerCase().includes(managementSearch.toLowerCase())
        ),
        [rooms, managementSearch]);

    const handleSaveRoom = (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const b = formData.get('building') as string;
        const r = formData.get('room') as string;
        const newRoom: RoomData = {
            career: formData.get('career') as string,
            building: b,
            room: r,
            roomKey: `${b} - ${r}`,
            description: formData.get('description') as string,
            type: formData.get('type') as string,
            capacity: Number(formData.get('capacity')),
        };

        saveRoomCloud(newRoom);
        setIsManagementModalOpen(false);
    };

    const handleDelete = (key: string) => setPendingDeleteKey(key);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col h-screen overflow-hidden">
            <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-[100] shadow-sm">
                <div className="flex items-center space-x-6">
                    <button onClick={() => navigate('/')} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl text-white bg-orange-600">
                            <MapPin size={20} />
                        </div>
                        <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Gestión de Ambientes</h1>
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
                        className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase tracking-widest hover:border-orange-400 hover:text-orange-600 transition-all disabled:opacity-50"
                    >
                        <FileText size={16} /><span>{isDownloadingTemplate ? 'Generando...' : 'Plantilla'}</span>
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase tracking-widest hover:border-orange-400 hover:text-orange-600 transition-all disabled:opacity-50"
                    >
                        <Upload size={16} /><span>{isUploading ? 'Cargando...' : 'Cargar Excel'}</span>
                    </button>
                    <button
                        onClick={() => { setEditingItem(null); setIsManagementModalOpen(true); }}
                        className="flex items-center space-x-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
                    >
                        <Plus size={16} /><span>Añadir Ambiente</span>
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
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Carrera</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Edificio</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aula</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aforo</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredRooms.map(room => (
                                <tr key={room.roomKey} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-6 py-4 text-sm font-bold text-slate-600">{room.career}</td>
                                    <td className="px-6 py-4 text-sm font-black text-slate-900">{room.building}</td>
                                    <td className="px-6 py-4 text-sm font-black text-slate-900">{room.room}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-500 truncate max-w-[200px]">{room.description}</td>
                                    <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{room.type}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-500">{room.capacity}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-all">
                                            <button onClick={() => { setEditingItem(room); setIsManagementModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(room.roomKey)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
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
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{editingItem ? 'Editar' : 'Crear'} Ambiente</h3>
                            <button onClick={() => setIsManagementModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSaveRoom} className="p-10 space-y-6">
                            <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Carrera Responsable</label><input required name="career" defaultValue={editingItem?.career} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Edificio</label><input required name="building" defaultValue={editingItem?.building} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Aula</label><input required name="room" defaultValue={editingItem?.room} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Tipo Ambiente</label><input name="type" defaultValue={editingItem?.type} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Aforo</label><input type="number" name="capacity" defaultValue={editingItem?.capacity} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>
                            </div>
                            <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Descripción Actual</label><input name="description" defaultValue={editingItem?.description} className="w-full px-4 py-3 bg-slate-100 rounded-2xl font-bold" /></div>

                            <div className="flex justify-end space-x-4 pt-6 border-t border-slate-100">
                                <button type="button" onClick={() => setIsManagementModalOpen(false)} className="px-8 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Cancelar</button>
                                <button type="submit" className="px-10 py-3 bg-slate-900 text-white text-xs font-black rounded-2xl uppercase tracking-widest shadow-xl">Guardar Cambios</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={pendingDeleteKey !== null}
                title="Eliminar ambiente"
                message="Se eliminará este ambiente del catálogo de forma permanente. Los horarios que lo usan no se borran, pero quedarán apuntando a un ambiente inexistente."
                confirmLabel="Eliminar"
                variant="danger"
                onCancel={() => setPendingDeleteKey(null)}
                onConfirm={() => {
                    if (pendingDeleteKey) deleteRoomCloud(pendingDeleteKey);
                    setPendingDeleteKey(null);
                }}
            />
        </div>
    );
};

export default RoomsPage;
