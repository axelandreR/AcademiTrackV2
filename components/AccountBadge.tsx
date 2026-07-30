import React from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const AccountBadge: React.FC = () => {
    const { profile, user, isSuperuser, signOut } = useAuth();

    return (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-white border border-slate-200 shadow-lg rounded-full pl-3 pr-1.5 py-1.5">
            {isSuperuser && <ShieldCheck size={14} className="text-blue-600" />}
            <div className="text-right leading-tight">
                <div className="text-[10px] font-black text-slate-700 truncate max-w-[160px]">{profile?.email ?? user?.email}</div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{isSuperuser ? 'Superusuario' : 'Usuario'}</div>
            </div>
            <button
                onClick={() => signOut()}
                title="Cerrar sesión"
                className="p-2 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            >
                <LogOut size={14} />
            </button>
        </div>
    );
};

export default AccountBadge;
