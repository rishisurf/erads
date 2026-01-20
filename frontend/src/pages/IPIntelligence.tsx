import { useState, useEffect } from 'react';
import { api, type IPCheckResult, type IPBlock, type IPIntelStats, type ASNResult } from '../api/client';
import { Button } from '../components/Button';
import { Card, CardHeader } from '../components/Card';
import { StatCard } from '../components/StatCard';
import { Input } from '../components/Input';
import {
    Search,
    ShieldAlert,
    ShieldCheck,
    Globe,
    Server,
    Eye,
    EyeOff,
    Trash2,
    Plus,
    RefreshCw,
    Activity,
    Database,
    AlertTriangle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';

export default function IPIntelligence() {
    // Check IP State
    const [checkIP, setCheckIP] = useState('');
    const [checking, setChecking] = useState(false);
    const [checkResult, setCheckResult] = useState<IPCheckResult | null>(null);
    const [bypassCache, setBypassCache] = useState(false);

    // ASN Lookup State
    const [checkASN, setCheckASN] = useState('');
    const [checkingASN, setCheckingASN] = useState(false);
    const [asnResult, setAsnResult] = useState<ASNResult | null>(null);

    // Blocks State
    const [blocks, setBlocks] = useState<IPBlock[]>([]);
    const [loadingBlocks, setLoadingBlocks] = useState(true);

    // Stats State
    const [stats, setStats] = useState<IPIntelStats | null>(null);

    // Add Block Form State
    const [showAddForm, setShowAddForm] = useState(false);
    const [newIdentifier, setNewIdentifier] = useState('');
    const [newType, setNewType] = useState<'ip' | 'asn' | 'range'>('ip');
    const [newReason, setNewReason] = useState('');
    const [newDuration, setNewDuration] = useState<number | ''>('');
    const [addingBlock, setAddingBlock] = useState(false);

    // Load data
    useEffect(() => {
        loadBlocks();
        loadStats();
    }, []);

    async function loadBlocks() {
        try {
            const res = await api.getIPBlocks();
            setBlocks(res.blocks);
        } catch (e) {
            console.error('Failed to load blocks:', e);
        } finally {
            setLoadingBlocks(false);
        }
    }

    async function loadStats() {
        try {
            const res = await api.getIPIntelStats();
            setStats(res);
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    }

    async function handleCheckIP(e: React.FormEvent) {
        e.preventDefault();
        if (!checkIP.trim()) return;

        setChecking(true);
        setCheckResult(null);

        try {
            const result = await api.checkIP(checkIP.trim(), bypassCache);
            setCheckResult(result);
        } catch (e) {
            console.error('Check failed:', e);
            alert('Failed to check IP: ' + e);
        } finally {
            setChecking(false);
        }
    }

    async function handleCheckASN(e: React.FormEvent) {
        e.preventDefault();
        const asn = checkASN.replace(/^AS/i, '').trim();
        if (!asn) return;

        setCheckingASN(true);
        setAsnResult(null);

        try {
            const result = await api.lookupASN(asn);
            setAsnResult(result);
        } catch (e) {
            console.error('ASN lookup failed:', e);
            alert('ASN lookup failed: ' + e + '\n\nNote: Only ASNs previously seen in IP checks are available in the cache.');
        } finally {
            setCheckingASN(false);
        }
    }

    async function handleAddBlock(e: React.FormEvent) {
        e.preventDefault();
        setAddingBlock(true);

        try {
            await api.addIPBlock({
                identifier: newType === 'asn' ? newIdentifier.replace(/^AS/i, '') : newIdentifier,
                type: newType,
                reason: newReason,
                durationSeconds: newDuration ? Number(newDuration) : undefined,
            });

            await loadBlocks();
            setNewIdentifier('');
            setNewReason('');
            setNewDuration('');
            setShowAddForm(false);
        } catch (e) {
            alert('Failed to add block: ' + e);
        } finally {
            setAddingBlock(false);
        }
    }

    async function handleRemoveBlock(identifier: string, type: 'ip' | 'asn' | 'range') {
        if (!confirm(`Remove block for ${type.toUpperCase()} ${identifier}?`)) return;

        try {
            await api.removeIPBlock(identifier, type);
            loadBlocks();
        } catch (e) {
            alert('Failed to remove block: ' + e);
        }
    }

    // Classification badge helper
    function getClassificationBadge(result: IPCheckResult) {
        if (result.isTor) return { label: 'TOR', color: 'text-purple-400 border-purple-800/50', bg: 'bg-purple-900/20' };
        if (result.isVPN) return { label: 'VPN', color: 'text-yellow-400 border-yellow-800/50', bg: 'bg-yellow-900/20' };
        if (result.isProxy) return { label: 'PROXY', color: 'text-orange-400 border-orange-800/50', bg: 'bg-orange-900/20' };
        if (result.isHosting) return { label: 'HOSTING', color: 'text-blue-400 border-blue-800/50', bg: 'bg-blue-900/20' };
        return { label: 'RESIDENTIAL', color: 'text-green-400 border-green-800/50', bg: 'bg-green-900/20' };
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between pb-6 border-b border-[#333]">
                <div>
                    <h1 className="text-2xl font-light tracking-tight">IP INTELLIGENCE</h1>
                    <p className="text-xs text-[#666] mt-1 font-mono">PROXY / VPN / TOR / HOSTING DETECTION</p>
                </div>
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => { loadBlocks(); loadStats(); }}>
                        <RefreshCw size={14} className="mr-2" />
                        REFRESH
                    </Button>
                </div>
            </div>

            {/* Stats Row */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    <StatCard
                        label="TOTAL CHECKS"
                        value={stats.totalChecks.toLocaleString()}
                        subtext={stats.period.replace('_', ' ')}
                        icon={Activity}
                    />
                    <StatCard
                        label="CACHE HIT RATE"
                        value={stats.cacheHitRate}
                        subtext={`${stats.cacheHits.toLocaleString()} hits`}
                        icon={Database}
                    />
                    <StatCard
                        label="VPN / PROXY"
                        value={(stats.classifications.vpn + stats.classifications.proxy).toLocaleString()}
                        subtext="detected"
                        icon={EyeOff}
                    />
                    <StatCard
                        label="TOR NODES"
                        value={stats.tor.nodeCount.toLocaleString()}
                        subtext={stats.tor.enabled ? 'active' : 'disabled'}
                        icon={Globe}
                    />
                    <StatCard
                        label="HOSTING IPs"
                        value={stats.classifications.hosting.toLocaleString()}
                        subtext="detected"
                        icon={Server}
                    />
                    <StatCard
                        label="MANUAL BLOCKS"
                        value={(stats.manualBlocks.ips + stats.manualBlocks.asns + stats.manualBlocks.ranges).toLocaleString()}
                        subtext={`${stats.manualBlocks.ips} IPs, ${stats.manualBlocks.asns} ASNs, ${stats.manualBlocks.ranges} Ranges`}
                        icon={ShieldAlert}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* IP Checker */}
                <Card>
                    <CardHeader
                        title="IP LOOKUP"
                        description="Check IP reputation and classification"
                    />

                    <form onSubmit={handleCheckIP} className="space-y-4">
                        <div className="flex gap-3">
                            <Input
                                placeholder="Enter IP address (e.g., 8.8.8.8)"
                                value={checkIP}
                                onChange={(e) => setCheckIP(e.target.value)}
                                className="flex-1"
                            />
                            <Button type="submit" isLoading={checking}>
                                <Search size={16} className="mr-2" />
                                CHECK
                            </Button>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-[#666] cursor-pointer">
                            <input
                                type="checkbox"
                                checked={bypassCache}
                                onChange={(e) => setBypassCache(e.target.checked)}
                                className="accent-white"
                            />
                            Bypass cache (force fresh lookup)
                        </label>
                    </form>

                    {/* Check Result */}
                    {checkResult && (
                        <div className="mt-6 border border-[#333] bg-[#0a0a0a] p-4">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="font-mono text-lg">{checkResult.ip}</span>
                                        <span className={cn(
                                            "text-[10px] px-2 py-0.5 border font-mono",
                                            getClassificationBadge(checkResult).color,
                                            getClassificationBadge(checkResult).bg
                                        )}>
                                            {getClassificationBadge(checkResult).label}
                                        </span>
                                    </div>
                                    {checkResult.asnOrg && (
                                        <p className="text-sm text-[#888]">
                                            AS{checkResult.asn} · {checkResult.asnOrg}
                                        </p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-light">{checkResult.confidence}%</div>
                                    <div className="text-[10px] text-[#666] uppercase">confidence</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="flex items-center gap-2">
                                    {checkResult.isVPN ? (
                                        <EyeOff size={14} className="text-yellow-500" />
                                    ) : (
                                        <Eye size={14} className="text-[#444]" />
                                    )}
                                    <span className={cn("text-xs", checkResult.isVPN ? "text-yellow-500" : "text-[#666]")}>
                                        VPN: {checkResult.isVPN ? 'YES' : 'NO'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {checkResult.isProxy ? (
                                        <AlertTriangle size={14} className="text-orange-500" />
                                    ) : (
                                        <ShieldCheck size={14} className="text-[#444]" />
                                    )}
                                    <span className={cn("text-xs", checkResult.isProxy ? "text-orange-500" : "text-[#666]")}>
                                        PROXY: {checkResult.isProxy ? 'YES' : 'NO'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {checkResult.isTor ? (
                                        <Globe size={14} className="text-purple-500" />
                                    ) : (
                                        <Globe size={14} className="text-[#444]" />
                                    )}
                                    <span className={cn("text-xs", checkResult.isTor ? "text-purple-500" : "text-[#666]")}>
                                        TOR: {checkResult.isTor ? 'YES' : 'NO'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {checkResult.isHosting ? (
                                        <Server size={14} className="text-blue-500" />
                                    ) : (
                                        <Server size={14} className="text-[#444]" />
                                    )}
                                    <span className={cn("text-xs", checkResult.isHosting ? "text-blue-500" : "text-[#666]")}>
                                        HOSTING: {checkResult.isHosting ? 'YES' : 'NO'}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-3 border-t border-[#333]">
                                <p className="text-xs text-[#888] font-mono">{checkResult.reason}</p>
                                <p className="text-[10px] text-[#555] mt-1">
                                    Source: <span className="text-[#888]">{checkResult.source}</span>
                                    {checkResult.countryCode && (
                                        <> · Country: <span className="text-[#888]">{checkResult.countryCode}</span></>
                                    )}
                                </p>
                            </div>
                        </div>
                    )}
                </Card>

                {/* ASN Lookup */}
                <Card>
                    <CardHeader
                        title="ASN LOOKUP"
                        description="Query metadata for Autonomous Systems"
                    />

                    <form onSubmit={handleCheckASN} className="space-y-4">
                        <div className="flex gap-3">
                            <Input
                                placeholder="Enter ASN (e.g., 16509)"
                                value={checkASN}
                                onChange={(e) => setCheckASN(e.target.value)}
                                className="flex-1"
                            />
                            <Button type="submit" isLoading={checkingASN} variant="secondary">
                                <Search size={16} className="mr-2" />
                                LOOKUP
                            </Button>
                        </div>
                    </form>

                    {/* ASN Result */}
                    {asnResult && (
                        <div className="mt-6 border border-[#333] bg-[#0a0a0a] p-4">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="font-mono text-lg text-blue-400">AS{asnResult.asn}</span>
                                        {asnResult.isHosting && (
                                            <span className="text-[10px] px-2 py-0.5 border border-blue-800/50 text-blue-400 bg-blue-900/20 font-mono">
                                                HOSTING
                                            </span>
                                        )}
                                        {asnResult.isVPN && (
                                            <span className="text-[10px] px-2 py-0.5 border border-yellow-800/50 text-yellow-400 bg-yellow-900/20 font-mono">
                                                VPN
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-[#eee]">{asnResult.orgName}</p>
                                </div>
                            </div>

                            <div className="pt-3 border-t border-[#333]">
                                <div className="grid grid-cols-2 gap-y-2">
                                    <div className="text-[10px] text-[#555] uppercase">Country</div>
                                    <div className="text-[10px] text-[#888] font-mono">{asnResult.countryCode || 'Unknown'}</div>

                                    <div className="text-[10px] text-[#555] uppercase">Cache Expiry</div>
                                    <div className="text-[10px] text-[#888] font-mono">
                                        {formatDistanceToNow(new Date(asnResult.expiresAt), { addSuffix: true })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>

                {/* Manual Blocks */}
                <Card>
                    <CardHeader
                        title="MANUAL BLOCKS"
                        description="Admin-defined IP and ASN blocks"
                        action={
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowAddForm(!showAddForm)}
                            >
                                <Plus size={14} className="mr-1" />
                                ADD BLOCK
                            </Button>
                        }
                    />

                    {/* Add Block Form */}
                    {showAddForm && (
                        <form onSubmit={handleAddBlock} className="mb-6 p-4 border border-[#333] bg-[#0a0a0a] space-y-4">
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={newType === 'ip'}
                                        onChange={() => setNewType('ip')}
                                        className="accent-white"
                                    />
                                    IP Address
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={newType === 'asn'}
                                        onChange={() => setNewType('asn')}
                                        className="accent-white"
                                    />
                                    ASN
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={newType === 'range'}
                                        onChange={() => setNewType('range')}
                                        className="accent-white"
                                    />
                                    IP Range
                                </label>
                            </div>

                            <div>
                                <label className="block text-xs text-[#666] uppercase mb-1">
                                    {newType === 'ip' ? 'IP Address' : newType === 'asn' ? 'ASN Number' : 'IP Range (CIDR)'}
                                </label>
                                <Input
                                    placeholder={newType === 'ip' ? '192.168.1.1' : newType === 'asn' ? '16509' : '192.168.1.0/24'}
                                    value={newIdentifier}
                                    onChange={(e) => setNewIdentifier(e.target.value)}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-[#666] uppercase mb-1">Reason</label>
                                <Input
                                    placeholder="e.g., Suspicious activity"
                                    value={newReason}
                                    onChange={(e) => setNewReason(e.target.value)}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-[#666] uppercase mb-1">
                                    Duration (seconds, empty = permanent)
                                </label>
                                <Input
                                    type="number"
                                    placeholder="3600"
                                    value={newDuration}
                                    onChange={(e) => setNewDuration(Number(e.target.value) || '')}
                                    min={1}
                                />
                            </div>

                            <div className="flex gap-2">
                                <Button type="submit" variant="danger" isLoading={addingBlock}>
                                    <ShieldAlert size={14} className="mr-2" />
                                    BLOCK
                                </Button>
                                <Button type="button" variant="ghost" onClick={() => setShowAddForm(false)}>
                                    CANCEL
                                </Button>
                            </div>
                        </form>
                    )}

                    {/* Blocks List */}
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {loadingBlocks ? (
                            <div className="text-xs text-[#888] animate-pulse">LOADING BLOCKS...</div>
                        ) : blocks.length === 0 ? (
                            <div className="p-6 border border-dashed border-[#333] text-center text-[#666] text-sm">
                                NO MANUAL BLOCKS
                            </div>
                        ) : (
                            blocks.map((block) => (
                                <div
                                    key={`${block.type}-${block.identifier}`}
                                    className="border border-[#333] p-3 flex justify-between items-center group hover:border-red-900/50 transition-colors"
                                >
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-mono text-sm text-red-400">{block.identifier}</span>
                                            <span className="text-[10px] bg-[#222] text-[#888] px-1 uppercase">
                                                {block.type}
                                            </span>
                                            {block.isPermanent && (
                                                <span className="text-[10px] bg-red-900/30 text-red-500 px-1">
                                                    PERMANENT
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-[#666] font-mono">
                                            {block.reason}
                                            {block.expiresAt && (
                                                <span className="ml-2 text-[#555]">
                                                    · expires {formatDistanceToNow(new Date(block.expiresAt), { addSuffix: true })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveBlock(block.identifier, block.type)}
                                        className="text-[#555] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 size={14} />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </div>

            {/* Classification Breakdown */}
            {stats && (
                <Card>
                    <CardHeader
                        title="CLASSIFICATION BREAKDOWN"
                        description="Detection statistics for the last 30 days"
                    />

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <ClassificationStat
                            label="RESIDENTIAL"
                            value={stats.classifications.residential}
                            color="text-green-400"
                            bgColor="bg-green-900/20"
                        />
                        <ClassificationStat
                            label="VPN"
                            value={stats.classifications.vpn}
                            color="text-yellow-400"
                            bgColor="bg-yellow-900/20"
                        />
                        <ClassificationStat
                            label="PROXY"
                            value={stats.classifications.proxy}
                            color="text-orange-400"
                            bgColor="bg-orange-900/20"
                        />
                        <ClassificationStat
                            label="TOR"
                            value={stats.classifications.tor}
                            color="text-purple-400"
                            bgColor="bg-purple-900/20"
                        />
                        <ClassificationStat
                            label="HOSTING"
                            value={stats.classifications.hosting}
                            color="text-blue-400"
                            bgColor="bg-blue-900/20"
                        />
                        <ClassificationStat
                            label="UNKNOWN"
                            value={stats.classifications.unknown}
                            color="text-[#888]"
                            bgColor="bg-[#222]"
                        />
                    </div>
                </Card>
            )}

            {/* System Info */}
            {stats && (
                <div className="text-[10px] text-[#444] font-mono flex items-center gap-4">
                    <span>ASN CACHE: {stats.asnCacheSize.toLocaleString()} entries</span>
                    <span className="text-[#333]">|</span>
                    <span>TOR NODES: {stats.tor.nodeCount.toLocaleString()}</span>
                    {stats.tor.lastUpdate && (
                        <>
                            <span className="text-[#333]">|</span>
                            <span>LAST TOR UPDATE: {formatDistanceToNow(new Date(stats.tor.lastUpdate), { addSuffix: true })}</span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// Helper component for classification stats
function ClassificationStat({
    label,
    value,
    color,
    bgColor,
}: {
    label: string;
    value: number;
    color: string;
    bgColor: string;
}) {
    return (
        <div className={cn("border border-[#333] p-4 text-center", bgColor)}>
            <div className={cn("text-2xl font-light font-mono", color)}>
                {value.toLocaleString()}
            </div>
            <div className="text-[10px] text-[#666] uppercase mt-1">{label}</div>
        </div>
    );
}
