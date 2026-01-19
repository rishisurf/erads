import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Stats } from '../types';
import { StatCard } from '../components/StatCard';
import { Card, CardHeader } from '../components/Card';
import { Activity, Shield, Key as KeyIcon, Server } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function load() {
            try {
                const data = await api.getStats();
                setStats(data);
            } catch (err) {
                setError(String(err));
            } finally {
                setLoading(false);
            }
        }
        load();
        const interval = setInterval(load, 5000); // 5s refresh
        return () => clearInterval(interval);
    }, []);

    if (loading && !stats) return <div className="text-xs text-[#888] animate-pulse">BOOTING SYSTEM...</div>;
    if (error) return <div className="text-xs text-red-500 border border-red-900 p-4">SYSTEM ERROR: {error}</div>;

    // Format timeseries data for the chart
    const chartData = (stats?.timeSeries || []).map(item => ({
        time: new Date(item.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        requests: item.requests,
    }));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between pb-6 border-b border-[#333]">
                <h1 className="text-2xl font-light tracking-tight">SYSTEM OVERVIEW</h1>
                <div className="flex items-center space-x-2 text-xs text-[#888]">
                    <span className="w-2 h-2 bg-green-500 inline-block"></span>
                    <span>LIVE STREAMING</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    label="Total Requests"
                    value={stats?.requests.total.toLocaleString() ?? 0}
                    subtext="LAST 24H"
                    icon={Activity}
                />
                <StatCard
                    label="Blocked"
                    value={stats?.requests.blocked.toLocaleString() ?? 0}
                    subtext={`${((stats?.requests.blocked || 0) / (stats?.requests.total || 1) * 100).toFixed(1)}% REJECTION RATE`}
                    className="border-white/20"
                    icon={Shield}
                />
                <StatCard
                    label="Active Bans"
                    value={stats?.activeBans ?? 0}
                    subtext="CURRENTLY ENFORCED"
                    icon={Server}
                />
                <StatCard
                    label="Active Keys"
                    value={stats?.activeApiKeys ?? 0}
                    subtext="PROVISIONED"
                    icon={KeyIcon}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 min-h-[400px]">
                    <CardHeader title="TRAFFIC VOLUME" description="REQUESTS PER HOUR (LIVE)" />
                    <div className="h-[300px] w-full mt-4">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                                    <XAxis dataKey="time" stroke="#444" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#444" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
                                        itemStyle={{ color: '#fff', fontSize: '12px', fontFamily: 'monospace' }}
                                        labelStyle={{ display: 'none' }}
                                    />
                                    <Area type="step" dataKey="requests" stroke="#fff" strokeWidth={1} fill="rgba(255,255,255,0.05)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-[#444] text-sm">
                                NO TRAFFIC DATA YET
                            </div>
                        )}
                    </div>
                </Card>

                <Card>
                    <CardHeader title="ENFORCEMENT" description="BLOCK REASONS" />
                    <div className="space-y-4 mt-6">
                        {Object.entries(stats?.requests.byReason || {}).map(([reason, count]) => (
                            <div key={reason} className="flex items-center justify-between group cursor-default">
                                <span className="text-sm text-[#888] font-mono group-hover:text-white transition-colors uppercase">{reason.replace(/_/g, ' ')}</span>
                                <span className="text-sm font-mono">{count}</span>
                            </div>
                        ))}
                        {Object.keys(stats?.requests.byReason || {}).length === 0 && (
                            <div className="text-sm text-[#444] py-8 text-center italic">NO BLOCKED REQUESTS LOGGED</div>
                        )}
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader title="TOP IDENTIFIERS" description="MOST ACTIVE CLIENTS" />
                    <div className="space-y-3">
                        {stats?.topIdentifiers?.slice(0, 5).map((item, i) => (
                            <div key={i} className="flex justify-between items-center text-sm border-b border-[#222] pb-2 last:border-0">
                                <span className="font-mono text-[#ddd]">{item.identifier}</span>
                                <span className="text-[#666]">{item.count.toLocaleString()} REQ</span>
                            </div>
                        ))}
                        {!stats?.topIdentifiers?.length && <div className="text-[#444] text-sm">NO DATA AVAILABLE</div>}
                    </div>
                </Card>

                <Card>
                    <CardHeader title="TOP PATHS" description="MOST ACCESSED RESOURCES" />
                    <div className="space-y-3">
                        {stats?.topPaths?.slice(0, 5).map((item, i) => (
                            <div key={i} className="flex justify-between items-center text-sm border-b border-[#222] pb-2 last:border-0">
                                <span className="font-mono text-[#ddd]">{item.path}</span>
                                <span className="text-[#666]">{item.count.toLocaleString()} REQ</span>
                            </div>
                        ))}
                        {!stats?.topPaths?.length && <div className="text-[#444] text-sm">NO DATA AVAILABLE</div>}
                    </div>
                </Card>
            </div>
        </div>
    );
}
