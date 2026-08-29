import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

export interface Profile {
    id: string;
    email: string;
    full_name: string | null;
    role: 'user' | 'superuser';
}

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: Profile | null;
    isLoading: boolean;
    isSuperuser: boolean;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchProfile = async (userId: string) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, email, full_name, role')
            .eq('id', userId)
            .single();
        if (!error && data) {
            setProfile(data as Profile);
        } else {
            setProfile(null);
        }
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session?.user) {
                fetchProfile(session.user.id).finally(() => setIsLoading(false));
            } else {
                setIsLoading(false);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session?.user) {
                fetchProfile(session.user.id);
            } else {
                setProfile(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
    };

    const signOut = async () => {
        // No confiar solo en la limpieza interna del SDK: si el servidor no reconoce la
        // sesión (huérfana, p.ej. tras rotar las API keys del proyecto) o falla el
        // refresh del token, supabase-js puede no limpiar el estado local y el botón
        // "Cerrar sesión" queda sin efecto. Forzamos la salida local siempre.
        try {
            await supabase.auth.signOut();
        } catch {
            // Ignorado: igual limpiamos el estado local abajo.
        }
        setSession(null);
        setProfile(null);
    };

    return (
        <AuthContext.Provider value={{
            session,
            user: session?.user ?? null,
            profile,
            isLoading,
            isSuperuser: profile?.role === 'superuser',
            signIn,
            signOut
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
    return ctx;
};
