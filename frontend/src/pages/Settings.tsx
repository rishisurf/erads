import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Card, CardHeader } from '../components/Card';
import { Input } from '../components/Input';
import { Globe, Trash2, Plus, ToggleLeft, ToggleRight } from 'lucide-react';

interface BlockedCountry {
    countryCode: string;
    countryName: string | null;
    blockedAt: string;
}

// Common country codes for quick selection
const COMMON_COUNTRIES = [
    { code: 'CN', name: 'China' },
    { code: 'RU', name: 'Russia' },
    { code: 'KP', name: 'North Korea' },
    { code: 'IR', name: 'Iran' },
    { code: 'SY', name: 'Syria' },
    { code: 'CU', name: 'Cuba' },
    { code: 'VE', name: 'Venezuela' },
    { code: 'BY', name: 'Belarus' },
];

export default function Settings() {
    const [enabled, setEnabled] = useState(false);
    const [blockedCountries, setBlockedCountries] = useState<BlockedCountry[]>([]);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);

    // Form state
    const [countryCode, setCountryCode] = useState('');
    const [countryName, setCountryName] = useState('');
    const [adding, setAdding] = useState(false);

    async function loadSettings() {
        try {
            const data = await api.getGeoBlocking();
            setEnabled(data.enabled);
            setBlockedCountries(data.blockedCountries);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadSettings();
    }, []);

    async function handleToggle() {
        setToggling(true);
        try {
            const res = await api.setGeoBlockingEnabled(!enabled);
            setEnabled(res.enabled);
        } catch (e) {
            alert('Failed to update: ' + e);
        } finally {
            setToggling(false);
        }
    }

    async function handleAddCountry(e: React.FormEvent) {
        e.preventDefault();
        if (!countryCode || countryCode.length !== 2) {
            alert('Please enter a valid 2-letter country code');
            return;
        }
        setAdding(true);
        try {
            await api.blockCountry(countryCode.toUpperCase(), countryName || undefined);
            await loadSettings();
            setCountryCode('');
            setCountryName('');
        } catch (e) {
            alert('Failed to block country: ' + e);
        } finally {
            setAdding(false);
        }
    }

    async function handleRemoveCountry(code: string) {
        try {
            await api.unblockCountry(code);
            await loadSettings();
        } catch (e) {
            alert('Failed to unblock: ' + e);
        }
    }

    async function handleQuickAdd(country: { code: string; name: string }) {
        try {
            await api.blockCountry(country.code, country.name);
            await loadSettings();
        } catch (e) {
            alert('Failed to block: ' + e);
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between pb-6 border-b border-[#333]">
                <h1 className="text-2xl font-light tracking-tight">SYSTEM SETTINGS</h1>
            </div>

            {/* Geo-Blocking Section */}
            <Card>
                <CardHeader
                    title="GEO-BLOCKING"
                    description="Block requests from specific countries. Requires country code in request metadata."
                    action={
                        <button
                            onClick={handleToggle}
                            disabled={toggling || loading}
                            className="flex items-center gap-2 text-sm cursor-pointer disabled:opacity-50"
                        >
                            {enabled ? (
                                <>
                                    <ToggleRight className="w-6 h-6 text-green-500" />
                                    <span className="text-green-500">ENABLED</span>
                                </>
                            ) : (
                                <>
                                    <ToggleLeft className="w-6 h-6 text-[#666]" />
                                    <span className="text-[#666]">DISABLED</span>
                                </>
                            )}
                        </button>
                    }
                />

                {loading ? (
                    <div className="text-xs text-[#888]">LOADING CONFIGURATION...</div>
                ) : (
                    <div className="space-y-6">
                        {/* Quick Add */}
                        <div>
                            <div className="text-xs text-[#666] uppercase mb-3">QUICK ADD</div>
                            <div className="flex flex-wrap gap-2">
                                {COMMON_COUNTRIES.filter(c => !blockedCountries.find(bc => bc.countryCode === c.code)).map(country => (
                                    <button
                                        key={country.code}
                                        onClick={() => handleQuickAdd(country)}
                                        className="px-3 py-1 text-xs border border-[#333] hover:border-white hover:bg-white hover:text-black transition-colors cursor-pointer"
                                    >
                                        {country.code}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Manual Add */}
                        <form onSubmit={handleAddCountry} className="flex gap-4 items-end">
                            <div className="flex-1 max-w-[100px]">
                                <label className="block text-xs text-[#666] uppercase mb-1">Code</label>
                                <Input
                                    placeholder="US"
                                    value={countryCode}
                                    onChange={e => setCountryCode(e.target.value.toUpperCase())}
                                    maxLength={2}
                                    className="uppercase"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs text-[#666] uppercase mb-1">Name (Optional)</label>
                                <Input
                                    placeholder="United States"
                                    value={countryName}
                                    onChange={e => setCountryName(e.target.value)}
                                />
                            </div>
                            <Button type="submit" isLoading={adding}>
                                <Plus size={16} className="mr-1" />
                                BLOCK
                            </Button>
                        </form>

                        {/* Blocked Countries List */}
                        <div>
                            <div className="text-xs text-[#666] uppercase mb-3">BLOCKED COUNTRIES ({blockedCountries.length})</div>
                            {blockedCountries.length === 0 ? (
                                <div className="text-sm text-[#444] py-4 text-center border border-dashed border-[#333]">
                                    NO COUNTRIES BLOCKED
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {blockedCountries.map(country => (
                                        <div
                                            key={country.countryCode}
                                            className="flex items-center justify-between p-3 border border-[#333] bg-black group hover:border-red-900/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Globe className="w-4 h-4 text-[#666]" />
                                                <span className="font-mono text-white">{country.countryCode}</span>
                                                {country.countryName && (
                                                    <span className="text-[#888]">{country.countryName}</span>
                                                )}
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveCountry(country.countryCode)}
                                                className="text-[#666] hover:text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Card>

            {/* Info Card */}
            <Card className="border-[#222]">
                <div className="text-sm text-[#888] space-y-2">
                    <p><strong className="text-white">How Geo-Blocking Works:</strong></p>
                    <p>1. Your upstream proxy (Cloudflare, Nginx, etc.) adds a country header to requests.</p>
                    <p>2. When checking rate limits, include the country in metadata:</p>
                    <code className="block bg-[#111] p-3 text-xs mt-2">
                        {`POST /v1/check
{ "ip": "1.2.3.4", "metadata": { "country": "CN" } }`}
                    </code>
                    <p className="mt-2">3. If the country is in your blocklist and geo-blocking is enabled, the request is denied.</p>
                </div>
            </Card>
        </div>
    );
}
