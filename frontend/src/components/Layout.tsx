import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Key, BarChart3, ShieldAlert, Cpu } from 'lucide-react';
import { cn } from '../lib/utils';

interface LayoutProps {
    children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
    const [location] = useLocation();

    const navItems = [
        { href: '/', label: 'Overview', icon: LayoutDashboard },
        { href: '/analytics', label: 'Analytics', icon: BarChart3 },
        { href: '/keys', label: 'API Keys', icon: Key },
        { href: '/bans', label: 'Bans', icon: ShieldAlert },
    ];

    return (
        <div className="flex min-h-screen bg-black text-white font-mono selection:bg-white selection:text-black">
            {/* Sidebar */}
            <aside className="w-64 border-r border-[#333] fixed h-full bg-black z-10 hidden md:flex flex-col">
                <div className="h-16 flex items-center px-6 border-b border-[#333]">
                    <Cpu className="w-5 h-5 mr-3" />
                    <span className="font-bold tracking-tight">ERADS_ADMIN</span>
                </div>

                <nav className="p-4 space-y-1 flex-1">
                    {navItems.map((item) => (
                        <Link key={item.href} href={item.href}>
                            <a className={cn(
                                "flex items-center px-3 py-2 text-sm transition-colors border border-transparent",
                                location === item.href
                                    ? "bg-white text-black border-white"
                                    : "text-[#888] hover:text-white hover:border-[#333]"
                            )}>
                                <item.icon className="w-4 h-4 mr-3" />
                                {item.label}
                            </a>
                        </Link>
                    ))}
                </nav>

                <div className="p-6 border-t border-[#333]">
                    <div className="text-[10px] text-[#444] leading-relaxed">
                        SYSTEM STATUS: ONLINE<br />
                        VERSION: 1.0.0<br />
                        REGION: EDGE
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 min-h-screen bg-grid">
                <div className="max-w-7xl mx-auto p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
