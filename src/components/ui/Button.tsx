'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tactical' | 'champagne' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, disabled, children, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none';

    const variants = {
      primary:
        'bg-brand-500 hover:bg-brand-600 text-white shadow-glow-purple border border-brand-400/30',
      secondary:
        'bg-surface-50 hover:bg-surface-100 text-zinc-200 border border-white/10 shadow-doppelrand',
      tactical:
        'bg-zinc-900 hover:bg-zinc-800 text-purple-300 border border-purple-500/30 shadow-doppelrand hover:border-purple-500/60',
      champagne:
        'bg-champagne hover:bg-champagne-dark text-zinc-950 font-semibold shadow-glow-gold border border-champagne-light/40',
      outline:
        'bg-transparent hover:bg-white/5 text-zinc-300 border border-zinc-700/60 hover:border-zinc-500',
      ghost: 'bg-transparent hover:bg-white/5 text-zinc-400 hover:text-white',
      danger:
        'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50',
    };

    const sizes = {
      sm: 'text-xs px-3 py-1.5 rounded-sm gap-1.5',
      md: 'text-sm px-4 py-2 rounded gap-2',
      lg: 'text-base px-6 py-3 rounded-md gap-2.5',
      icon: 'h-10 w-10 rounded-sm p-0',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
