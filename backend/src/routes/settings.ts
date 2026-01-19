/**
 * Settings Routes
 * 
 * API endpoints for managing global settings including geo-blocking.
 */

import { Hono } from 'hono';
import { SettingsRepository } from '../repositories/settings';

const settingsRoute = new Hono();

// Lazy initialization
let settingsRepo: SettingsRepository | null = null;
function getSettingsRepo(): SettingsRepository {
    if (!settingsRepo) {
        settingsRepo = new SettingsRepository();
    }
    return settingsRepo;
}

// ============================================================================
// Geo-Blocking Settings
// ============================================================================

/**
 * GET /settings/geo-blocking
 * Get geo-blocking status and blocked countries
 */
settingsRoute.get('/geo-blocking', (c) => {
    const repo = getSettingsRepo();

    return c.json({
        enabled: repo.isGeoBlockingEnabled(),
        blockedCountries: repo.getBlockedCountries(),
    });
});

/**
 * PUT /settings/geo-blocking
 * Update geo-blocking enabled status
 */
settingsRoute.put('/geo-blocking', async (c) => {
    const body = await c.req.json() as { enabled: boolean };
    const repo = getSettingsRepo();

    repo.setGeoBlockingEnabled(body.enabled);

    return c.json({
        success: true,
        enabled: body.enabled,
    });
});

/**
 * POST /settings/geo-blocking/countries
 * Add a country to the blocklist
 */
settingsRoute.post('/geo-blocking/countries', async (c) => {
    const body = await c.req.json() as { countryCode: string; countryName?: string };
    const repo = getSettingsRepo();

    if (!body.countryCode || body.countryCode.length !== 2) {
        return c.json({ error: 'Invalid country code' }, 400);
    }

    repo.blockCountry(body.countryCode, body.countryName);

    return c.json({
        success: true,
        countryCode: body.countryCode.toUpperCase(),
    });
});

/**
 * DELETE /settings/geo-blocking/countries/:code
 * Remove a country from the blocklist
 */
settingsRoute.delete('/geo-blocking/countries/:code', (c) => {
    const code = c.req.param('code');
    const repo = getSettingsRepo();

    const removed = repo.unblockCountry(code);

    if (!removed) {
        return c.json({ error: 'Country not found in blocklist' }, 404);
    }

    return c.json({
        success: true,
        countryCode: code.toUpperCase(),
    });
});

/**
 * PUT /settings/geo-blocking/countries
 * Bulk update blocked countries (replace all)
 */
settingsRoute.put('/geo-blocking/countries', async (c) => {
    const body = await c.req.json() as { countries: { code: string; name?: string }[] };
    const repo = getSettingsRepo();

    if (!Array.isArray(body.countries)) {
        return c.json({ error: 'countries must be an array' }, 400);
    }

    repo.setBlockedCountries(body.countries);

    return c.json({
        success: true,
        count: body.countries.length,
    });
});

export { settingsRoute };
