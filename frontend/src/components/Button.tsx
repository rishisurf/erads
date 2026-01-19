import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
    className,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    children,
    ...props
}, ref) => {
    return (
        <button
            ref={ref}
            className={cn(
                "inline-flex items-center justify-center font-mono transition-none focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
                "border border-white/20 hover:border-white active:translate-y-[1px]",
                {
                    'bg-white text-black hover:bg-gray-200 border-transparent': variant === 'primary',
                    'bg-black text-white': variant === 'secondary',
                    'bg-black text-red-500 border-red-900/50 hover:border-red-500 hover:text-red-400': variant === 'danger',
                    'bg-transparent border-transparent hover:bg-white/10 hover:border-transparent': variant === 'ghost',

                    'h-8 px-3 text-xs': size === 'sm',
                    'h-10 px-4 text-sm': size === 'md',
                    'h-12 px-6 text-base': size === 'lg',
                },
                className
            )}
            disabled={isLoading || props.disabled}
            {...props}
        >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {children}
        </button>
    );
});

Button.displayName = 'Button';
