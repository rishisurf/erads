
export interface ApiResponse<T> {
    data?: T;
    error?: string;
}

export interface Stats {
    period: {
        start: string;
        end: string;
    };
    requests: {
        total: number;
        allowed: number;
        blocked: number;
        byReason: Record<string, number>;
    };
    topIdentifiers: Array<{
        identifier: string;
        type: 'ip' | 'api_key';
        count: number;
    }>;
    topPaths: Array<{
        path: string;
        count: number;
    }>;
    activeBans: number;
    activeApiKeys: number;
}

export interface ApiKey {
    id: string;
    name: string;
    rateLimit: number;
    windowSeconds: number;
    isActive: boolean;
    createdAt: string;
    expiresAt: string | null;
    lastUsedAt: string | null;
}

export interface CreateKeyResponse {
    id: string;
    key: string;
    name: string;
    rateLimit: number;
    windowSeconds: number;
    expiresAt: string | null;
    createdAt: string;
}

export interface Ban {
    id: string;
    identifier: string;
    identifierType: 'ip' | 'api_key';
    reason: string;
    bannedAt: string;
    expiresAt: string | null;
    createdBy: string;
}
