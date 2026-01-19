/**
 * Admin Authentication Middleware
 * 
 * Protects admin routes with a simple secret key authentication.
 * The admin secret is set via ADMIN_SECRET environment variable.
 */

import { Context, Next, MiddlewareHandler } from 'hono';
import { config } from '../config/env';

/**
 * Middleware to require admin authentication
 * Checks for Authorization: Bearer <ADMIN_SECRET> header
 */
export function requireAdmin(): MiddlewareHandler {
    return async (c: Context, next: Next) => {
        const adminSecret = config.admin?.secret;

        // If no admin secret is configured, allow access (development mode)
        if (!adminSecret) {
            return next();
        }

        const authHeader = c.req.header('Authorization');

        if (!authHeader) {
            return c.json({
                error: 'Authentication required',
                code: 'auth_required',
            }, 401);
        }

        // Support "Bearer <token>" format
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.substring(7)
            : authHeader;

        if (token !== adminSecret) {
            return c.json({
                error: 'Invalid credentials',
                code: 'invalid_credentials',
            }, 403);
        }

        return next();
    };
}

/**
 * Endpoint to verify admin credentials
 * POST /auth/verify
 */
export async function verifyAdminCredentials(c: Context) {
    const adminSecret = config.admin?.secret;

    // If no admin secret is configured, always return authenticated
    if (!adminSecret) {
        return c.json({ authenticated: true, message: 'No authentication configured' });
    }

    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : authHeader;

    if (token === adminSecret) {
        return c.json({ authenticated: true });
    }

    return c.json({ authenticated: false }, 401);
}
