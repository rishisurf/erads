import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (secret: string) => Promise<boolean>;
    logout: () => void;
    getAuthHeader: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_STORAGE_KEY = 'erads_admin_secret';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Check stored credentials on mount
    useEffect(() => {
        const stored = sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
            verifyCredentials(stored).then(valid => {
                setIsAuthenticated(valid);
                if (!valid) {
                    sessionStorage.removeItem(AUTH_STORAGE_KEY);
                }
                setIsLoading(false);
            });
        } else {
            setIsLoading(false);
        }
    }, []);

    async function verifyCredentials(secret: string): Promise<boolean> {
        try {
            const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/v1';
            const res = await fetch(`${API_BASE}/auth/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${secret}`,
                },
            });
            const data = await res.json();
            return data.authenticated === true;
        } catch {
            return false;
        }
    }

    async function login(secret: string): Promise<boolean> {
        const valid = await verifyCredentials(secret);
        if (valid) {
            sessionStorage.setItem(AUTH_STORAGE_KEY, secret);
            setIsAuthenticated(true);
        }
        return valid;
    }

    function logout() {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        setIsAuthenticated(false);
    }

    function getAuthHeader(): Record<string, string> {
        const secret = sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (secret) {
            return { 'Authorization': `Bearer ${secret}` };
        }
        return {};
    }

    return (
        <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout, getAuthHeader }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}
