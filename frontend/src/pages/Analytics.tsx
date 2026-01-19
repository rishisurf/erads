import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Stats } from '../types';
import { Card, CardHeader } from '../components/Card';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend } from 'recharts';

export default function Analytics() {
    const [stats, setStats] = useState<Stats | null>(null);

    // Mock timeseries data
    const data = [
        { name: '00:00', allowed: 400, blocked: 24 },
        { name: '04:00', allowed: 300, blocked: 10 },
        { name: '08:00', allowed: 1200, blocked: 50 },
        { name: '12:00', allowed: 2400, blocked: 120 },
        { name: '16:00', allowed: 1800, blocked: 80 },
        { name: '20:00', allowed: 900, blocked: 40 },
    ];

    useEffect(() => {
        api.getStats().then(setStats);
    }, []);

    return (
        <div className="space-y-6">
            <div className="pb-6 border-b border-[#333]">
                <h1 className="text-2xl font-light tracking-tight">TRAFFIC ANALYTICS</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="min-h-[400px]">
                    <CardHeader title="TRAFFIC COMPOSITION" description="ALLOWED VS BLOCKED" />
                    <div className="h-[300px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                                <XAxis dataKey="name" stroke="#444" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#444" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
                                    itemStyle={{ fontSize: '12px', fontFamily: 'monospace' }}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="allowed" stackId="1" stroke="none" fill="#333" />
                                <Area type="monotone" dataKey="blocked" stackId="1" stroke="none" fill="#fff" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card className="min-h-[400px]">
                    <CardHeader title="BLOCK REASONS DISTRIBUTION" />
                    <div className="h-[300px] w-full mt-4 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={Object.entries(stats?.requests.byReason || {}).map(([k, v]) => ({ name: k, value: v }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                                <XAxis dataKey="name" stroke="#444" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#444" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{ fill: '#111' }} contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }} />
                                <Bar dataKey="value" fill="#fff" barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>
        </div>
    );
}
