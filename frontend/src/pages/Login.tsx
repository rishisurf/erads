import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Cpu, Lock } from 'lucide-react';

export default function Login() {
    const { login } = useAuth();
    const [secret, setSecret] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        const success = await login(secret);

        if (!success) {
            setError('Invalid credentials');
        }

        setLoading(false);
    }

    return (
        <div className="min-h-screen bg-black text-white font-mono flex items-center justify-center bg-grid">
            <div className="w-full max-w-md p-8">
                <div className="border border-[#333] bg-black p-8">
                    {/* Header */}
                    <div className="flex items-center justify-center mb-8">
                        <Cpu className="w-8 h-8 mr-3" />
                        <span className="text-2xl font-bold tracking-tight">ERADS_ADMIN</span>
                    </div>

                    <div className="text-center mb-8">
                        <div className="flex items-center justify-center mb-4">
                            <Lock className="w-12 h-12 text-[#444]" />
                        </div>
                        <p className="text-[#888] text-sm">AUTHENTICATION REQUIRED</p>
                    </div>

                    {/* Login Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-xs text-[#666] uppercase mb-2">ADMIN SECRET</label>
                            <Input
                                type="password"
                                value={secret}
                                onChange={e => setSecret(e.target.value)}
                                placeholder="Enter admin secret..."
                                autoFocus
                                required
                            />
                        </div>

                        {error && (
                            <div className="text-red-500 text-sm border border-red-900 p-3 bg-red-900/10">
                                {error}
                            </div>
                        )}

                        <Button type="submit" className="w-full" isLoading={loading}>
                            AUTHENTICATE
                        </Button>
                    </form>

                    <div className="mt-8 text-center text-[10px] text-[#444] leading-relaxed">
                        EDGE RATE-LIMITING &amp; ABUSE DETECTION<br />
                        ADMINISTRATIVE INTERFACE v1.0.0
                    </div>
                </div>
            </div>
        </div>
    );
}
