import type { Stats, ApiKey, CreateKeyResponse, Ban } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/v1';

async function fetcher<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || `Error ${res.status}: ${res.statusText}`);
    }

    return res.json();
}

export const api = {
    getStats: (startDate?: string, endDate?: string) => {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        return fetcher<Stats>(`/stats?${params.toString()}`);
    },

    getHealth: () => fetcher<{ status: string; activeApiKeys: number; activeBans: number }>('/stats/health'),

    getKeys: () => fetcher<{ data: ApiKey[] }>('/keys'),

    createKey: (data: { name: string; rateLimit?: number; windowSeconds?: number }) =>
        fetcher<CreateKeyResponse>('/keys', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    rotateKey: (id: string) =>
        fetcher<{ newKey: string }>('/keys/' + id + '/rotate', {
            method: 'POST',
        }),

    revokeKey: (id: string) =>
        fetcher<{ success: boolean }>('/keys/' + id, {
            method: 'DELETE',
        }),

    getBans: () => fetcher<{ data: Ban[] }>('/bans'),

    createBan: (data: { identifier: string; identifierType: 'ip' | 'api_key'; reason: string; durationSeconds?: number }) =>
        fetcher<Ban>('/bans', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    removeBan: (id: string) =>
        fetcher<{ success: boolean }>('/bans/' + id, {
            method: 'DELETE',
        }),
};
