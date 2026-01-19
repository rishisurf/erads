/**
 * Error Handling Middleware
 * 
 * Provides consistent error responses across the API.
 * Catches and formats all errors in a structured way.
 */

import { Context, Next, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export interface ApiError {
    error: string;
    code: string;
    details?: unknown;
    requestId?: string;
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Error handling middleware
 */
export function errorHandler(): MiddlewareHandler {
    return async (c: Context, next: Next) => {
        const requestId = generateRequestId();
        c.set('requestId', requestId);
        c.header('X-Request-ID', requestId);

        try {
            await next();
        } catch (error) {
            // Handle Hono HTTP exceptions
            if (error instanceof HTTPException) {
                const response: ApiError = {
                    error: error.message,
                    code: `http_${error.status}`,
                    requestId,
                };

                logger.warn('HTTP exception', {
                    requestId,
                    status: error.status,
                    message: error.message,
                });

                return c.json(response, error.status);
            }

            // Handle validation errors
            if (error instanceof Error && error.message.includes('validation')) {
                const response: ApiError = {
                    error: error.message,
                    code: 'validation_error',
                    requestId,
                };

                return c.json(response, 400);
            }

            // Handle known errors
            if (error instanceof Error) {
                logger.error('Request error', {
                    requestId,
                    error: error.message,
                    stack: config.server.isProduction ? undefined : error.stack,
                });

                const response: ApiError = {
                    error: config.server.isProduction
                        ? 'Internal server error'
                        : error.message,
                    code: 'internal_error',
                    requestId,
                    details: config.server.isProduction ? undefined : {
                        message: error.message,
                        stack: error.stack,
                    },
                };

                return c.json(response, 500);
            }

            // Unknown error type
            logger.error('Unknown error type', {
                requestId,
                error: String(error),
            });

            const response: ApiError = {
                error: 'An unexpected error occurred',
                code: 'unknown_error',
                requestId,
            };

            return c.json(response, 500);
        }
    };
}

/**
 * Request logging middleware
 */
export function requestLogger(): MiddlewareHandler {
    return async (c: Context, next: Next) => {
        const start = Date.now();
        const method = c.req.method;
        const path = new URL(c.req.url).pathname;

        await next();

        const duration = Date.now() - start;
        const status = c.res.status;
        const requestId = c.get('requestId');

        // Log based on status
        if (status >= 500) {
            logger.error('Request completed', { requestId, method, path, status, duration });
        } else if (status >= 400) {
            logger.warn('Request completed', { requestId, method, path, status, duration });
        } else if (config.logging.logAllRequests) {
            logger.info('Request completed', { requestId, method, path, status, duration });
        } else {
            logger.debug('Request completed', { requestId, method, path, status, duration });
        }
    };
}
