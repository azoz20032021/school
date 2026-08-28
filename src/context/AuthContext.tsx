import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { UserData } from '../types';
import { api, setToken, getToken, SESSION_EXPIRED_EVENT } from '../lib/api';

interface AuthContextType {
    user: UserData | null;
    loading: boolean;
    login: (token: string, userData: UserData) => void;
    logout: () => void;
    refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_KEY = 'school_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);

    const clearSession = useCallback(() => {
        setUser(null);
        setToken(null);
        try {
            localStorage.removeItem(USER_KEY);
        } catch { /* ignore */ }
    }, []);

    /**
     * The cached user object is a display convenience only — it makes the first
     * paint instant. Authority always comes from the server: the stored token
     * is revalidated against /api/me on every boot, so editing localStorage to
     * claim an admin role no longer grants anything.
     */
    useEffect(() => {
        let cancelled = false;

        const restore = async () => {
            if (!getToken()) {
                clearSession();
                setLoading(false);
                return;
            }

            try {
                const cached = localStorage.getItem(USER_KEY);
                if (cached) setUser(JSON.parse(cached));
            } catch { /* ignore a corrupt cache */ }

            try {
                const fresh = await api.get<UserData>('/api/me');
                if (cancelled) return;
                setUser(fresh);
                localStorage.setItem(USER_KEY, JSON.stringify(fresh));
            } catch {
                if (!cancelled) clearSession();
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        restore();
        return () => { cancelled = true; };
    }, [clearSession]);

    // The API layer raises this when the server rejects our token mid-session.
    useEffect(() => {
        const onExpired = () => clearSession();
        window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    }, [clearSession]);

    const login = useCallback((token: string, userData: UserData) => {
        setToken(token);
        setUser(userData);
        try {
            localStorage.setItem(USER_KEY, JSON.stringify(userData));
        } catch { /* ignore */ }
    }, []);

    const refresh = useCallback(async () => {
        const fresh = await api.get<UserData>('/api/me');
        setUser(fresh);
        try {
            localStorage.setItem(USER_KEY, JSON.stringify(fresh));
        } catch { /* ignore */ }
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, login, logout: clearSession, refresh }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

/** Convenience guards used across the dashboards. */
export const isStaff = (role?: string) => role === 'admin' || role === 'assistant_admin';
export const isAdmin = (role?: string) => role === 'admin';
