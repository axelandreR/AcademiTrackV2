import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, UserPlus, RefreshCw, Copy, Check, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listManagedUsers, createManagedUser, generateRandomPassword, ManagedUser } from '../services/adminService';

const formatDate = (value: string | null) => {
    if (!value) return 'Nunca';
    return new Date(value).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
};

const UserManagementPage: React.FC = () => {
    const navigate = useNavigate();
    const { isSuperuser } = useAuth();

    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState(() => generateRandomPassword());
    const [canWrite, setCanWrite] = useState(false);
    const [canDelete, setCanDelete] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [justCreated, setJustCreated] = useState<{ email: string; password: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const loadUsers = async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const data = await listManagedUsers();
            setUsers(data);
        } catch (e: any) {
            setLoadError(e.message || 'No se pudo cargar la lista de usuarios.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isSuperuser) loadUsers();
    }, [isSuperuser]);

    if (!isSuperuser) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-10">
                <div className="bg-white p-10 rounded-3xl shadow-xl border border-slate-100 text-center space-y-4 max-w-sm">
                    <ShieldAlert className="mx-auto text-rose-500" size={40} />
                    <h2 className="text-lg font-black text-slate-900">Acceso restringido</h2>
                    <p className="text-sm text-slate-500">Solo un superusuario puede gestionar usuarios.</p>
                    <button onClick={() => navigate('/')} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest">Volver al menú</button>
                </div>
            </div>
        );
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateError(null);
        if (!email.trim() || password.length < 8) {
            setCreateError('Ingresa un correo válido y una contraseña de al menos 8 caracteres.');
            return;
        }
        setIsCreating(true);
        try {
            const created = await createManagedUser(email.trim(), password, canWrite, canDelete);
            setJustCreated({ email: created.email, password });
            setEmail('');
            setPassword(generateRandomPassword());
            setCanWrite(false);
            setCanDelete(false);
            await loadUsers();
        } catch (e: any) {
            setCreateError(e.message || 'No se pudo crear el usuario.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleCopy = () => {
        if (!justCreated) return;
        navigator.clipboard.writeText(`Correo: ${justCreated.email}\nContraseña: ${justCreated.password}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <div className="max-w-4xl mx-auto p-6 lg:p-10 space-y-8">
                <button onClick={() => navigate('/')} className="text-slate-400 hover:text-slate-900 font-bold flex items-center space-x-2 transition-colors">
                    <ArrowLeft size={18} />
                    <span>Volver al Menú</span>
                </button>

                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200"><ShieldCheck size={24} /></div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Gestión de Usuarios</h1>
                        <p className="text-slate-500 text-sm font-medium">Crea acceso para las personas que autorices. El registro público está desactivado.</p>
                    </div>
                </div>

                {/* Formulario de creación */}
                <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 space-y-5">
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center space-x-2">
                        <UserPlus size={16} className="text-blue-600" />
                        <span>Nuevo usuario</span>
                    </h2>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Correo</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-100 border-none rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                                placeholder="persona@ejemplo.com"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Contraseña temporal</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    required
                                    minLength={8}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="flex-1 px-4 py-3 bg-slate-100 border-none rounded-xl text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                                />
                                <button
                                    type="button"
                                    onClick={() => setPassword(generateRandomPassword())}
                                    title="Generar otra"
                                    className="px-4 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500 transition-colors"
                                >
                                    <RefreshCw size={16} />
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1.5">Compártela tú mismo con la persona — no se envía ningún correo automático.</p>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Permisos</label>
                            <div className="space-y-2">
                                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={canWrite}
                                        onChange={(e) => {
                                            setCanWrite(e.target.checked);
                                            if (!e.target.checked) setCanDelete(false);
                                        }}
                                        className="w-4 h-4 accent-blue-600"
                                    />
                                    <span className="text-xs font-bold text-slate-700">Puede editar (crear/modificar horarios, instructores, ambientes)</span>
                                </label>
                                <label className={`flex items-center gap-3 p-3 rounded-xl ${canWrite ? 'bg-slate-50 cursor-pointer' : 'bg-slate-50/50 cursor-not-allowed'}`}>
                                    <input
                                        type="checkbox"
                                        checked={canDelete}
                                        disabled={!canWrite}
                                        onChange={(e) => setCanDelete(e.target.checked)}
                                        className="w-4 h-4 accent-rose-600"
                                    />
                                    <span className={`text-xs font-bold ${canWrite ? 'text-slate-700' : 'text-slate-400'}`}>Puede eliminar registros</span>
                                </label>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1.5">Sin marcar ninguno, el usuario solo puede ver — el predeterminado más seguro.</p>
                        </div>

                        {createError && (
                            <div className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{createError}</div>
                        )}

                        <button
                            type="submit"
                            disabled={isCreating}
                            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50"
                        >
                            {isCreating ? 'Creando...' : 'Crear usuario'}
                        </button>
                    </form>

                    {justCreated && (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 space-y-2">
                            <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">Usuario creado</p>
                            <p className="text-sm text-slate-700 font-mono">{justCreated.email}</p>
                            <p className="text-sm text-slate-700 font-mono font-bold">{justCreated.password}</p>
                            <button
                                onClick={handleCopy}
                                className="mt-2 flex items-center gap-2 text-xs font-black text-emerald-700 uppercase tracking-widest"
                            >
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                                {copied ? 'Copiado' : 'Copiar correo y contraseña'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Lista de usuarios existentes */}
                <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Usuarios con acceso</h2>
                        <button onClick={loadUsers} className="text-slate-400 hover:text-blue-600 transition-colors" title="Refrescar">
                            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    {loadError && (
                        <div className="p-6 text-xs font-bold text-rose-600">{loadError}</div>
                    )}
                    {!loadError && (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">
                                    <th className="px-6 py-3">Correo</th>
                                    <th className="px-6 py-3">Permisos</th>
                                    <th className="px-6 py-3">Creado</th>
                                    <th className="px-6 py-3">Último ingreso</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} className="border-t border-slate-50">
                                        <td className="px-6 py-3.5 font-bold text-slate-800">{u.email}</td>
                                        <td className="px-6 py-3.5">
                                            {u.role === 'superuser' ? (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">Superusuario</span>
                                            ) : u.can_delete ? (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-100">Editar + Eliminar</span>
                                            ) : u.can_write ? (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">Editar</span>
                                            ) : (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">Solo lectura</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3.5 text-slate-500">{formatDate(u.created_at)}</td>
                                        <td className="px-6 py-3.5 text-slate-500">{formatDate(u.last_sign_in_at)}</td>
                                    </tr>
                                ))}
                                {!isLoading && users.length === 0 && (
                                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-xs font-bold">Sin usuarios.</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserManagementPage;
