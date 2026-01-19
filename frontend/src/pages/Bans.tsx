import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Ban } from '../types';
import { Button } from '../components/Button';
import { Card, CardHeader } from '../components/Card';
import { Input } from '../components/Input';
import { Ban as BanIcon, Trash2, AlertOctagon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function Bans() {
    const [bans, setBans] = useState<Ban[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    // Form state
    const [identifier, setIdentifier] = useState('');
    const [type, setType] = useState<'ip' | 'api_key'>('ip');
    const [reason, setReason] = useState('');
    const [duration, setDuration] = useState<number | ''>('');

    async function loadBans() {
        try {
            const res = await api.getBans();
            setBans(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadBans();
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setCreating(true);
        try {
            await api.createBan({
                identifier,
                identifierType: type,
                reason,
                durationSeconds: duration ? Number(duration) : undefined
            });
            await loadBans();
            setIdentifier('');
            setReason('');
            setDuration('');
        } catch (e) {
            alert('Failed to ban: ' + e);
        } finally {
            setCreating(false);
        }
    }

    async function handleRemove(id: string) {
        if (!confirm('Lift this ban?')) return;
        try {
            await api.removeBan(id);
            loadBans();
        } catch (e) {
            alert(String(e));
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between pb-6 border-b border-[#333]">
                <h1 className="text-2xl font-light tracking-tight">ACTIVE RESTRICTIONS</h1>
                <div className="flex items-center gap-2 text-xs text-[#666] font-mono">
                    <AlertOctagon size={14} className="text-red-500" />
                    <span>{bans.length} ENTITIES BLOCKED</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Creation Form */}
                <div className="lg:col-span-1">
                    <Card className="sticky top-8 border-red-900/20">
                        <CardHeader title="IMPOSE BAN" description="Manual overrides" />
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="flex gap-4 mb-4">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="radio" checked={type === 'ip'} onChange={() => setType('ip')} className="accent-white" />
                                    IP Address
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="radio" checked={type === 'api_key'} onChange={() => setType('api_key')} className="accent-white" />
                                    API Key ID
                                </label>
                            </div>

                            <div>
                                <label className="block text-xs text-[#666] uppercase mb-1">Target Identifier</label>
                                <Input
                                    placeholder={type === 'ip' ? "192.168.x.x" : "Key ID"}
                                    value={identifier}
                                    onChange={e => setIdentifier(e.target.value)}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-[#666] uppercase mb-1">Reason</label>
                                <Input
                                    placeholder="e.g. Abuse detected"
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-[#666] uppercase mb-1">Duration (Seconds, empty = permanent)</label>
                                <Input
                                    type="number"
                                    value={duration}
                                    onChange={e => setDuration(Number(e.target.value))}
                                    min={1}
                                />
                            </div>

                            <Button type="submit" variant="danger" className="w-full" isLoading={creating}>
                                <BanIcon size={16} className="mr-2" />
                                BLOCK ENTITY
                            </Button>
                        </form>
                    </Card>
                </div>

                {/* Bans List */}
                <div className="lg:col-span-2 space-y-4">
                    {loading ? (
                        <div className="text-xs text-[#888]">LOADING BLACKLIST...</div>
                    ) : bans.length === 0 ? (
                        <div className="p-8 border border-dashed border-[#333] text-center text-[#666]">NO ACTIVE BANS</div>
                    ) : (
                        bans.map((ban) => (
                            <div key={ban.id} className="border border-[#333] bg-black p-4 flex justify-between items-center group hover:border-red-900/50 transition-colors">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="font-mono text-red-500">{ban.identifier}</span>
                                        <span className="text-[10px] bg-[#222] text-[#888] px-1 uppercase">{ban.identifierType}</span>
                                    </div>
                                    <div className="text-xs text-[#666] font-mono flex gap-3">
                                        <span>REASON: {ban.reason}</span>
                                        <span className="text-[#444]">|</span>
                                        <span>EXPIRES: {ban.expiresAt ? formatDistanceToNow(new Date(ban.expiresAt), { addSuffix: true }) : 'NEVER'}</span>
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => handleRemove(ban.id)} className="text-[#666] hover:text-white">
                                    <Trash2 size={14} />
                                    <span className="ml-2 text-xs">LIFT</span>
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
