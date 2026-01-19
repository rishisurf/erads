/**
 * Rate Limiter Service
 * 
 * Core service that orchestrates rate limiting, ban checking, and abuse detection.
 * This is the main entry point for the /v1/check endpoint.
 * 
 * Architecture Decision:
 * - Single entry point for all rate limit checks
 * - Layered checks: bans → geo-blocking → rate limits → abuse detection
 * - Logs all checks for analytics and baseline calculation
 */

import { config } from '../config/env';
import { logger } from '../utils/logger';
import {
    ApiKeyRepository,
    RateLimitRepository,
    BanRepository,
    RequestLogRepository,
} from '../repositories';
import type { CheckRequest, CheckResponse, RateLimitConfig } from '../types';

export class RateLimiterService {
    private apiKeyRepo: ApiKeyRepository;
    private rateLimitRepo: RateLimitRepository;
    private banRepo: BanRepository;
    private logRepo: RequestLogRepository;

    constructor() {
        this.apiKeyRepo = new ApiKeyRepository();
        this.rateLimitRepo = new RateLimitRepository();
        this.banRepo = new BanRepository();
        this.logRepo = new RequestLogRepository();
    }

    /**
     * Main check method - determines if a request should be allowed
     * 
     * Check order:
     * 1. Validate input (need at least IP or API key)
     * 2. Check for active bans
     * 3. Check geo-blocking (if enabled)
     * 4. Validate API key (if provided)
     * 5. Apply rate limits
     * 6. Check for abuse patterns (burst detection)
     */
    async check(request: CheckRequest): Promise<CheckResponse> {
        const startTime = Date.now();

        // Determine identifier - prefer API key over IP
        const identifier = request.apiKey || request.ip;
        const identifierType: 'ip' | 'api_key' = request.apiKey ? 'api_key' : 'ip';

        if (!identifier) {
            return this.createResponse(false, 'invalid_key', 0, 0);
        }

        try {
            // Step 1: Check for active bans
            const ban = this.banRepo.isCurrentlyBanned(identifier, identifierType);
            if (ban) {
                const retryAfter = ban.expiresAt
                    ? Math.ceil((ban.expiresAt.getTime() - Date.now()) / 1000)
                    : undefined;

                this.logRequest(request, identifier, identifierType, false, 'banned');

                return this.createResponse(false, 'banned', 0, 0, retryAfter);
            }

            // Step 2: Check geo-blocking (if enabled and country provided)
            if (config.abuse.geoBlockingEnabled && request.metadata?.country) {
                if (config.abuse.blockedCountries.includes(request.metadata.country)) {
                    this.logRequest(request, identifier, identifierType, false, 'geo_blocked');
                    return this.createResponse(false, 'geo_blocked', 0, 0);
                }
            }

            // Step 3: Validate and get rate limit config for API key
            let rateLimitConfig: RateLimitConfig;

            if (request.apiKey) {
                const apiKey = this.apiKeyRepo.lookupByKey(request.apiKey);

                if (!apiKey) {
                    this.logRequest(request, identifier, identifierType, false, 'invalid_key');
                    return this.createResponse(false, 'invalid_key', 0, 0);
                }

                if (this.apiKeyRepo.isExpired(apiKey)) {
                    this.logRequest(request, identifier, identifierType, false, 'expired_key');
                    return this.createResponse(false, 'expired_key', 0, 0);
                }

                // Use API key's custom rate limit
                rateLimitConfig = {
                    limit: apiKey.rateLimit,
                    windowSeconds: apiKey.windowSeconds,
                    useSlidingWindow: config.rateLimit.useSlidingWindow,
                };
            } else {
                // Use default rate limit for IP-based limiting
                rateLimitConfig = {
                    limit: config.rateLimit.defaultLimit,
                    windowSeconds: config.rateLimit.defaultWindowSeconds,
                    useSlidingWindow: config.rateLimit.useSlidingWindow,
                };
            }

            // Step 4: Apply rate limits
            const rateLimitResult = this.rateLimitRepo.check(
                identifier,
                identifierType,
                rateLimitConfig
            );

            // Step 5: Check for abuse patterns (even if rate limit passed)
            if (rateLimitResult.allowed) {
                const abuseDetected = await this.detectAbuse(identifier, identifierType);
                if (abuseDetected) {
                    this.logRequest(request, identifier, identifierType, false, 'banned');
                    return this.createResponse(false, 'banned', 0, rateLimitResult.resetAt);
                }
            }

            // Log the request
            const reason = rateLimitResult.allowed ? 'ok' : 'rate_limited';
            this.logRequest(request, identifier, identifierType, rateLimitResult.allowed, reason);

            const response: CheckResponse = {
                allowed: rateLimitResult.allowed,
                reason: rateLimitResult.allowed ? 'ok' : 'rate_limited',
                remaining: rateLimitResult.remaining,
                resetAt: rateLimitResult.resetAt,
                limit: rateLimitResult.limit,
            };

            if (!rateLimitResult.allowed) {
                response.retryAfter = rateLimitResult.resetAt - Math.floor(Date.now() / 1000);
            }

            logger.debug('Rate limit check completed', {
                identifier,
                type: identifierType,
                allowed: rateLimitResult.allowed,
                duration: Date.now() - startTime,
            });

            return response;

        } catch (error) {
            logger.error('Rate limit check failed', { error, identifier });
            // Fail open - allow request but log the error
            return this.createResponse(true, 'ok', 0, 0);
        }
    }

    /**
     * Detect abuse patterns
     * 
     * Currently implements burst detection:
     * - Counts requests in a short window
     * - Compares to historical baseline
     * - If current rate >> baseline, flag as abuse
     */
    private async detectAbuse(
        identifier: string,
        identifierType: 'ip' | 'api_key'
    ): Promise<boolean> {
        const burstWindowSeconds = config.abuse.burstWindowSeconds;
        const burstThreshold = config.abuse.burstThreshold;
        const burstMultiplier = config.abuse.burstMultiplier;

        // Get current burst count
        const currentBurstCount = this.logRepo.getCountInWindow(
            identifier,
            identifierType,
            burstWindowSeconds
        );

        // If over absolute threshold, definitely abuse
        if (currentBurstCount >= burstThreshold) {
            logger.warn('Burst threshold exceeded', {
                identifier,
                type: identifierType,
                count: currentBurstCount,
                threshold: burstThreshold,
            });

            // Create automatic temporary ban
            this.banRepo.createAutoBan(
                identifier,
                identifierType,
                `Burst detection: ${currentBurstCount} requests in ${burstWindowSeconds}s`
            );

            return true;
        }

        // Check against baseline (more sophisticated detection)
        const baselineRate = this.logRepo.getBaselineRate(identifier, identifierType, 60);
        const currentRate = currentBurstCount / (burstWindowSeconds / 60);

        // If current rate is significantly higher than baseline, flag it
        if (baselineRate > 0 && currentRate > baselineRate * burstMultiplier) {
            logger.warn('Baseline burst detected', {
                identifier,
                type: identifierType,
                currentRate,
                baselineRate,
                multiplier: burstMultiplier,
            });

            // Create automatic temporary ban
            this.banRepo.createAutoBan(
                identifier,
                identifierType,
                `Baseline spike: ${currentRate.toFixed(2)} req/min vs baseline ${baselineRate.toFixed(2)} req/min`
            );

            return true;
        }

        return false;
    }

    /**
     * Log request for analytics
     */
    private logRequest(
        request: CheckRequest,
        identifier: string,
        identifierType: 'ip' | 'api_key',
        allowed: boolean,
        reason: string
    ): void {
        // Only log if configured to log all requests, or if blocked
        if (config.logging.logAllRequests || !allowed) {
            this.logRepo.log({
                identifier,
                identifierType,
                path: request.metadata?.path,
                method: request.metadata?.method,
                allowed,
                reason,
                country: request.metadata?.country,
                city: request.metadata?.city,
                userAgent: request.metadata?.userAgent,
            });
        }
    }

    /**
     * Helper to create response object
     */
    private createResponse(
        allowed: boolean,
        reason: CheckResponse['reason'],
        remaining: number,
        resetAt: number,
        retryAfter?: number
    ): CheckResponse {
        const response: CheckResponse = {
            allowed,
            reason,
            remaining,
            resetAt,
        };

        if (retryAfter !== undefined) {
            response.retryAfter = retryAfter;
        }

        return response;
    }
}
