import { supabase } from '../supabaseClient';

export interface ManagedUser {
    id: string;
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
    role: 'user' | 'superuser';
    can_write: boolean;
    can_delete: boolean;
}

// Todas las operaciones administrativas de usuarios pasan por la Edge Function
// "manage-users", que valida que quien llama sea superusuario y usa el service_role key
// (nunca expuesto en el cliente) para crear/listar cuentas de Supabase Auth.
const invoke = async (body: Record<string, unknown>): Promise<any> => {
    const { data, error } = await supabase.functions.invoke('manage-users', { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
};

export const listManagedUsers = async (): Promise<ManagedUser[]> => {
    const data = await invoke({ action: 'list' });
    return data.users || [];
};

export const createManagedUser = async (
    email: string,
    password: string,
    canWrite: boolean,
    canDelete: boolean
): Promise<ManagedUser> => {
    const data = await invoke({ action: 'create', email, password, canWrite, canDelete });
    return data.user;
};

// Contraseña temporal legible pero con buena entropía (crypto.getRandomValues, no
// Math.random) para que el superusuario la comparta manualmente con el nuevo usuario.
export const generateRandomPassword = (length = 12): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    return Array.from(values, (n) => chars[n % chars.length]).join('');
};
