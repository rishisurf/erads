/**
 * Stats Service
 * 
 * Business logic for statistics and analytics.
 */

import { RequestLogRepository, ApiKeyRepository, BanRepository } from '../repositories';
import type { StatsQuery, StatsResponse } from '../types';

export class StatsService {
    private logRepo: RequestLogRepository;
    private apiKeyRepo: ApiKeyRepository;
    private banRepo: BanRepository;

    constructor() {
        this.logRepo = new RequestLogRepository();
        this.apiKeyRepo = new ApiKeyRepository();
        this.banRepo = new BanRepository();
    }

    /**
     * Get aggregated statistics
     */
    getStats(query?: StatsQuery): StatsResponse {
        return this.logRepo.getStats(query);
    }

    /**
     * Get health/status information
     */
    getHealth() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            activeApiKeys: this.apiKeyRepo.countActive(),
            activeBans: this.banRepo.countActive(),
        };
    }
}
