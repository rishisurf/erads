import type { Stats, ApiKey, CreateKeyResponse, Ban } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/v1';
const AUTH_STORAGE_KEY = 'erads_admin_secret';

function getAuthHeaders(): Record<string, string> {
    const secret = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (secret) {
        return { 'Authorization': `Bearer ${secret}` };
    }
    return {};
}

async function fetcher<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
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

    // Settings / Geo-Blocking
    getGeoBlocking: () =>
        fetcher<{ enabled: boolean; blockedCountries: Array<{ countryCode: string; countryName: string | null; blockedAt: string }> }>('/settings/geo-blocking'),

    setGeoBlockingEnabled: (enabled: boolean) =>
        fetcher<{ success: boolean; enabled: boolean }>('/settings/geo-blocking', {
            method: 'PUT',
            body: JSON.stringify({ enabled }),
        }),

    blockCountry: (countryCode: string, countryName?: string) =>
        fetcher<{ success: boolean; countryCode: string }>('/settings/geo-blocking/countries', {
            method: 'POST',
            body: JSON.stringify({ countryCode, countryName }),
        }),

    unblockCountry: (countryCode: string) =>
        fetcher<{ success: boolean }>('/settings/geo-blocking/countries/' + countryCode, {
            method: 'DELETE',
        }),
};
