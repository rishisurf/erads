import type { HTMLAttributes } from 'react';
import { cn } from '../lib/utils';

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("border border-[#333] bg-black p-6", className)} {...props}>
            {children}
        </div>
    );
}

export function CardHeader({ title, description, action }: { title: string, description?: string, action?: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between mb-6">
            <div>
                <h3 className="text-lg font-medium text-white tracking-tight">{title}</h3>
                {description && <p className="text-sm text-[#888] mt-1">{description}</p>}
            </div>
            {action && <div>{action}</div>}
        </div>
    );
}
