import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'tactical' | 'gold';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-zinc-800 text-zinc-300 border-zinc-700/50',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    danger: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    tactical: 'bg-purple-500/10 text-purple-300 border-purple-500/30 shadow-doppelrand',
    gold: 'bg-champagne/10 text-champagne-light border-champagne/30',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-sm border transition-colors',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
