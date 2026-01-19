import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ApiKey } from '../types';
import { Button } from '../components/Button';
import { Card, CardHeader } from '../components/Card';
import { Input } from '../components/Input';
import { Copy, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';

export default function ApiKeys() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newKey, setNewKey] = useState<{ id: string; key: string } | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [rateLimit, setRateLimit] = useState(100);
    const [windowSeconds, setWindowSeconds] = useState(60);

    async function loadKeys() {
        try {
            const res = await api.getKeys();
            setKeys(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadKeys();
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setCreating(true);
        try {
            const res = await api.createKey({ name, rateLimit, windowSeconds });
            setNewKey({ id: res.id, key: res.key });
            await loadKeys();
            // Reset form
            setName('');
        } catch (e) {
            alert('Failed to create key: ' + e);
        } finally {
            setCreating(false);
        }
    }

    async function handleRevoke(id: string) {
        if (!confirm('Are you sure you want to revoke this key? This cannot be undone.')) return;
        try {
            await api.revokeKey(id);
            loadKeys();
        } catch (e) {
            alert(String(e));
        }
    }

    async function handleRotate(id: string) {
        if (!confirm('Rotate this key? The old key will stop working immediately.')) return;
        try {
            const res = await api.rotateKey(id);
            setNewKey({ id, key: res.newKey });
            loadKeys();
        } catch (e) {
            alert(String(e));
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between pb-6 border-b border-[#333]">
                <h1 className="text-2xl font-light tracking-tight">ACCESS CREDENTIALS</h1>
                <div className="text-xs text-[#666] font-mono">{keys.length} ACTIVE KEYS</div>
            </div>

            {newKey && (
                <div className="bg-[#111] border border-white p-6 mb-8 relative animate-in fade-in slide-in-from-top-4 duration-300">
                    <button
                        onClick={() => setNewKey(null)}
                        className="absolute top-4 right-4 text-[#666] hover:text-white"
                    >
                        <X size={16} />
                    </button>
                    <h3 className="text-white text-lg mb-2 font-mono">NEW KEY GENERATED</h3>
                    <p className="text-[#888] text-sm mb-4">This key will only be shown once. Copy it now.</p>
                    <div className="flex gap-2">
                        <code className="flex-1 bg-black border border-[#333] p-3 font-mono text-green-400 text-sm overflow-x-auto whitespace-nowrap">
                            {newKey.key}
                        </code>
                        <Button onClick={() => navigator.clipboard.writeText(newKey.key)}>
                            <Copy size={16} />
                        </Button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Creation Form */}
                <div className="lg:col-span-1">
                    <Card className="sticky top-8">
                        <CardHeader title="PROVISION NEW KEY" />
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-xs text-[#666] uppercase mb-1">Key Name</label>
                                <Input
                                    placeholder="e.g. Production Service A"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-[#666] uppercase mb-1">Limit (Reqs)</label>
                                    <Input
                                        type="number"
                                        value={rateLimit}
                                        onChange={e => setRateLimit(Number(e.target.value))}
                                        min={1}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-[#666] uppercase mb-1">Window (Sec)</label>
                                    <Input
                                        type="number"
                                        value={windowSeconds}
                                        onChange={e => setWindowSeconds(Number(e.target.value))}
                                        min={1}
                                    />
                                </div>
                            </div>
                            <Button type="submit" className="w-full" isLoading={creating}>
                                <Plus size={16} className="mr-2" />
                                GENERATE KEY
                            </Button>
                        </form>
                    </Card>
                </div>

                {/* Keys List */}
                <div className="lg:col-span-2 space-y-4">
                    {loading ? (
                        <div className="text-xs text-[#888]">LOADING REGISTRY...</div>
                    ) : keys.length === 0 ? (
                        <div className="p-8 border border-dashed border-[#333] text-center text-[#666]">NO ACTIVE KEYS FOUND</div>
                    ) : (
                        keys.map((key) => (
                            <div key={key.id} className="border border-[#333] bg-black p-4 transition-colors hover:border-[#555] group">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-mono text-white text-lg">{key.name}</span>
                                            {!key.isActive && <span className="bg-red-900/20 text-red-500 text-[10px] px-1 py-0.5 border border-red-900/50">INACTIVE</span>}
                                        </div>
                                        <div className="text-xs text-[#666] font-mono space-x-3">
                                            <span>ID: {key.id.slice(0, 8)}...</span>
                                            <span className="text-[#888]">|</span>
                                            <span>LIMIT: {key.rateLimit}/{key.windowSeconds}s</span>
                                            <span className="text-[#888]">|</span>
                                            <span>CREATED: {format(new Date(key.createdAt), 'yyyy-MM-dd')}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="sm" onClick={() => handleRotate(key.id)} title="Rotate Key">
                                            <RefreshCw size={14} />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleRevoke(key.id)} title="Revoke Key" className="text-red-500 hover:text-red-400 hover:border-red-900/50">
                                            <Trash2 size={14} />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
