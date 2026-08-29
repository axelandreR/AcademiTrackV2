import React, { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const LoginPage: React.FC = () => {
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        const result = await signIn(email, password);

        setIsSubmitting(false);

        if (result.error) {
            setError(result.error);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8 space-y-6">
                <div className="text-center space-y-2">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-600 flex items-center justify-center">
                        <ShieldCheck className="text-white" size={28} />
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                        Academi<span className="text-blue-600">Track</span>
                    </h1>
                    <p className="text-sm text-slate-500 font-medium">
                        Inicia sesión para continuar
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Correo</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-100 border-none rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                            placeholder="tu.correo@ejemplo.com"
                            autoComplete="email"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Contraseña</label>
                        <input
                            type="password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-100 border-none rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                            placeholder="••••••••"
                            autoComplete="current-password"
                        />
                    </div>

                    {error && (
                        <div className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50"
                    >
                        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                        Ingresar
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;
