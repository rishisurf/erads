/**
 * IP Intelligence Provider Interface
 * 
 * Base interface that all external IP intelligence providers must implement.
 * This abstraction allows swapping providers without changing detection logic.
 * 
 * Design Principles:
 * - All providers are optional
 * - Providers can fail gracefully (return null)
 * - Results are normalized to a common format
 * - Caching is handled by the caller, not the provider
 */

import type { ProviderResult, IIPIntelProvider } from './types';
import { logger } from '../utils/logger';
import { ipIntelConfig } from './config';

const log = logger.child({ module: 'ip-intel-providers' });

// ============================================================================
// Base Provider Class
// ============================================================================

/**
 * Abstract base class for IP intelligence providers.
 * Provides common functionality like timeout handling and error logging.
 */
export abstract class BaseProvider implements IIPIntelProvider {
    abstract readonly name: string;
    abstract readonly priority: number;

    protected readonly timeout: number;

    constructor() {
        this.timeout = ipIntelConfig.providers.requestTimeoutMs;
    }

    abstract isEnabled(): boolean;

    /**
     * Subclasses implement this to perform the actual lookup.
     */
    protected abstract doCheck(ip: string): Promise<ProviderResult | null>;

    /**
     * Public check method with timeout and error handling.
     */
    async check(ip: string): Promise<ProviderResult | null> {
        if (!this.isEnabled()) {
            return null;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const result = await Promise.race([
                this.doCheck(ip),
                new Promise<null>((_, reject) => {
                    controller.signal.addEventListener('abort', () => {
                        reject(new Error('Provider timeout'));
                    });
                }),
            ]);

            clearTimeout(timeoutId);

            if (ipIntelConfig.logging.logProviderCalls) {
                log.debug(`Provider ${this.name} check completed`, { ip, result: !!result });
            }

            return result;
        } catch (error) {
            log.warn(`Provider ${this.name} check failed`, {
                ip,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }
}

// ============================================================================
// IP-API Provider (Free tier available)
// ============================================================================

/**
 * IP-API.com provider.
 * 
 * Free tier: 45 requests/minute (no key needed)
 * Pro tier: Higher limits with API key
 * 
 * Detection capabilities:
 * - ASN and organization
 * - Hosting detection
 * - Proxy detection (Pro only)
 * - Mobile detection
 */
export class IPAPIProvider extends BaseProvider {
    readonly name = 'ip-api';
    readonly priority = 10; // Lower priority (fallback)

    isEnabled(): boolean {
        // IP-API has free tier, always available
        return true;
    }

    protected async doCheck(ip: string): Promise<ProviderResult | null> {
        // Use HTTPS for pro, HTTP for free (pro key in query param)
        const apiKey = ipIntelConfig.providers.ipApiKey;
        const baseUrl = apiKey
            ? `https://pro.ip-api.com/json/${ip}?key=${apiKey}&fields=66846719`
            : `http://ip-api.com/json/${ip}?fields=66846719`;

        const response = await fetch(baseUrl, {
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as {
            status: string;
            message?: string;
            query: string;
            as?: string;
            isp?: string;
            org?: string;
            hosting?: boolean;
            proxy?: boolean;
            mobile?: boolean;
            countryCode?: string;
        };

        if (data.status !== 'success') {
            throw new Error(data.message ?? 'Unknown error');
        }

        // Extract ASN from "AS" field (format: "AS12345 Organization Name")
        let asn: number | undefined;
        if (data.as) {
            const match = data.as.match(/^AS(\d+)/);
            if (match) {
                asn = parseInt(match[1], 10);
            }
        }

        // Heuristic: Check if ISP/org contains VPN-related keywords
        const orgLower = (data.org ?? '').toLowerCase() + (data.isp ?? '').toLowerCase();
        const isVPN = /vpn|virtual private|private internet|express|nord|surf|proton|mullvad|cyberghost/i.test(orgLower);

        return {
            ip: data.query,
            isProxy: data.proxy ?? false,
            isVPN,
            isTor: false, // IP-API doesn't detect Tor directly
            isHosting: data.hosting ?? false,
            confidence: 75, // Medium confidence for free provider
            asn,
            asnOrg: data.org ?? data.isp,
            countryCode: data.countryCode,
            raw: data,
        };
    }
}

// ============================================================================
// IPInfo Provider
// ============================================================================

/**
 * IPInfo.io provider.
 * 
 * Requires API token.
 * 
 * Detection capabilities:
 * - ASN and organization
 * - Privacy detection (VPN, proxy, Tor, relay, hosting)
 * - Company and carrier info
 */
export class IPInfoProvider extends BaseProvider {
    readonly name = 'ipinfo';
    readonly priority = 5; // Higher priority (preferred)

    isEnabled(): boolean {
        return !!ipIntelConfig.providers.ipinfoToken;
    }

    protected async doCheck(ip: string): Promise<ProviderResult | null> {
        const token = ipIntelConfig.providers.ipinfoToken;

        const response = await fetch(`https://ipinfo.io/${ip}?token=${token}`, {
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as {
            ip: string;
            asn?: { asn: string; name: string; type: string };
            privacy?: {
                vpn: boolean;
                proxy: boolean;
                tor: boolean;
                relay: boolean;
                hosting: boolean;
            };
            country?: string;
            org?: string;
        };

        // Extract ASN number
        let asn: number | undefined;
        if (data.asn?.asn) {
            const match = data.asn.asn.match(/^AS?(\d+)/);
            if (match) {
                asn = parseInt(match[1], 10);
            }
        }

        const privacy = data.privacy ?? {
            vpn: false,
            proxy: false,
            tor: false,
            relay: false,
            hosting: false,
        };

        return {
            ip: data.ip,
            isProxy: privacy.proxy || privacy.relay,
            isVPN: privacy.vpn,
            isTor: privacy.tor,
            isHosting: privacy.hosting,
            confidence: 90, // High confidence for IPInfo
            asn,
            asnOrg: data.asn?.name ?? data.org,
            countryCode: data.country,
            raw: data,
        };
    }
}

// ============================================================================
// AbuseIPDB Provider
// ============================================================================

/**
 * AbuseIPDB.com provider.
 * 
 * Requires API key.
 * 
 * Detection capabilities:
 * - Abuse confidence score
 * - Total reports
 * - Usage type (hosting, vpn, etc.)
 */
export class AbuseIPDBProvider extends BaseProvider {
    readonly name = 'abuseipdb';
    readonly priority = 8;

    isEnabled(): boolean {
        return !!ipIntelConfig.providers.abuseIpDbKey;
    }

    protected async doCheck(ip: string): Promise<ProviderResult | null> {
        const apiKey = ipIntelConfig.providers.abuseIpDbKey;

        const response = await fetch(
            `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90&verbose`,
            {
                headers: {
                    'Key': apiKey,
                    'Accept': 'application/json',
                },
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as {
            data: {
                ipAddress: string;
                abuseConfidenceScore: number;
                usageType?: string;
                isp?: string;
                countryCode?: string;
                isTor?: boolean;
                isWhitelisted?: boolean;
                totalReports?: number;
            };
        };

        const result = data.data;
        const usageType = (result.usageType ?? '').toLowerCase();

        // Usage type mapping
        const isHosting = /datacenter|hosting|content delivery/i.test(usageType);
        const isVPN = /commercial vpn|vpn/i.test(usageType);
        const isProxy = /proxy|public proxy/i.test(usageType);

        // Calculate confidence based on abuse score and report count
        // Higher abuse score = higher confidence in malicious classification
        const baseConfidence = Math.min(result.abuseConfidenceScore + 50, 100);

        return {
            ip: result.ipAddress,
            isProxy: isProxy || result.abuseConfidenceScore > 50,
            isVPN,
            isTor: result.isTor ?? false,
            isHosting,
            confidence: baseConfidence,
            asnOrg: result.isp,
            countryCode: result.countryCode,
            raw: data,
        };
    }
}

// ============================================================================
// Provider Registry
// ============================================================================

/**
 * Registry of all available providers.
 * Providers are sorted by priority (lower = higher priority).
 */
export function getProviders(): IIPIntelProvider[] {
    const providers: IIPIntelProvider[] = [
        new IPInfoProvider(),
        new AbuseIPDBProvider(),
        new IPAPIProvider(),
    ];

    // Sort by priority (ascending) and filter to enabled only
    return providers
        .filter(p => p.isEnabled())
        .sort((a, b) => a.priority - b.priority);
}

/**
 * Get a specific provider by name.
 */
export function getProvider(name: string): IIPIntelProvider | null {
    const providers = getProviders();
    return providers.find(p => p.name === name) ?? null;
}
