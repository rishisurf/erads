import { cn } from '../lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
    label: string;
    value: string | number;
    subtext?: string;
    className?: string;
    icon?: LucideIcon;
}

export function StatCard({ label, value, subtext, className, icon: Icon }: StatCardProps) {
    return (
        <div className={cn("border border-[#333] bg-black p-6 flex flex-col justify-between h-full min-h-[120px] group hover:border-[#555] transition-colors", className)}>
            <div className="flex justify-between items-start mb-2">
                <span className="text-[#888] text-xs uppercase tracking-wider font-mono">{label}</span>
                {Icon && <Icon className="w-4 h-4 text-[#444] group-hover:text-[#666] transition-colors" />}
            </div>
            <div className="flex items-end justify-between">
                <span className="text-3xl font-light text-white font-mono tracking-tight">{value}</span>
                {subtext && <span className="text-[#666] text-xs font-mono">{subtext}</span>}
            </div>
        </div>
    );
}
