/**
 * API Key Service
 * 
 * Business logic for API key management.
 * Wraps the repository with additional validation and logging.
 */

import { ApiKeyRepository } from '../repositories';
import { logger } from '../utils/logger';
import type {
    CreateApiKeyRequest,
    CreateApiKeyResponse,
    RotateApiKeyResponse
} from '../types';

export class ApiKeyService {
    private repo: ApiKeyRepository;

    constructor() {
        this.repo = new ApiKeyRepository();
    }

    /**
     * Create a new API key
     */
    create(request: CreateApiKeyRequest): CreateApiKeyResponse {
        // Validate name
        if (!request.name || request.name.trim().length === 0) {
            throw new Error('API key name is required');
        }

        if (request.name.length > 100) {
            throw new Error('API key name must be 100 characters or less');
        }

        // Validate rate limit
        if (request.rateLimit !== undefined && request.rateLimit < 1) {
            throw new Error('Rate limit must be at least 1');
        }

        // Validate window
        if (request.windowSeconds !== undefined && request.windowSeconds < 1) {
            throw new Error('Window must be at least 1 second');
        }

        // Validate expiry
        if (request.expiresAt) {
            const expiryDate = new Date(request.expiresAt);
            if (isNaN(expiryDate.getTime())) {
                throw new Error('Invalid expiry date format');
            }
            if (expiryDate <= new Date()) {
                throw new Error('Expiry date must be in the future');
            }
        }

        const { apiKey, plainTextKey } = this.repo.create(request);

        logger.info('API key created via service', {
            id: apiKey.id,
            name: apiKey.name,
        });

        return {
            id: apiKey.id,
            key: plainTextKey,
            name: apiKey.name,
            rateLimit: apiKey.rateLimit,
            windowSeconds: apiKey.windowSeconds,
            expiresAt: apiKey.expiresAt?.toISOString() ?? null,
            createdAt: apiKey.createdAt.toISOString(),
        };
    }

    /**
     * Rotate an API key
     */
    rotate(id: string): RotateApiKeyResponse {
        const result = this.repo.rotate(id);

        if (!result) {
            throw new Error('API key not found');
        }

        return {
            id: result.apiKey.id,
            newKey: result.plainTextKey,
            rotatedAt: new Date().toISOString(),
        };
    }

    /**
     * List all API keys (metadata only, not the keys themselves)
     */
    list(limit = 50, offset = 0) {
        const apiKeys = this.repo.list(limit, offset);

        return apiKeys.map(key => ({
            id: key.id,
            name: key.name,
            rateLimit: key.rateLimit,
            windowSeconds: key.windowSeconds,
            isActive: key.isActive,
            createdAt: key.createdAt.toISOString(),
            expiresAt: key.expiresAt?.toISOString() ?? null,
            lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        }));
    }

    /**
     * Get a single API key by ID
     */
    get(id: string) {
        const apiKey = this.repo.getById(id);

        if (!apiKey) {
            return null;
        }

        return {
            id: apiKey.id,
            name: apiKey.name,
            rateLimit: apiKey.rateLimit,
            windowSeconds: apiKey.windowSeconds,
            isActive: apiKey.isActive,
            createdAt: apiKey.createdAt.toISOString(),
            expiresAt: apiKey.expiresAt?.toISOString() ?? null,
            lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
            metadata: apiKey.metadata,
        };
    }

    /**
     * Deactivate an API key
     */
    deactivate(id: string): boolean {
        return this.repo.deactivate(id);
    }

    /**
     * Delete an API key
     */
    delete(id: string): boolean {
        return this.repo.delete(id);
    }
}
