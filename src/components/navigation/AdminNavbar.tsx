'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  CreditCard, 
  Users, 
  ShieldAlert, 
  BellRing, 
  Calendar, 
  Settings, 
  QrCode, 
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

export function AdminNavbar() {
  const pathname = usePathname();
  const [currentRole, setCurrentRole] = useState<'admin' | 'staff'>('admin');

  const navLinks = [
    { href: '/admin/dashboard', label: 'CRM & Métricas', icon: LayoutDashboard },
    { href: '/admin/card-builder', label: 'Diseño Tarjeta', icon: CreditCard },
    { href: '/admin/customers', label: 'Clientes RFM', icon: Users },
    { href: '/admin/fraud-audit', label: 'Alertas Antifraude', icon: ShieldAlert },
    { href: '/admin/notifications', label: 'Push Wallet', icon: BellRing },
    { href: '/admin/bookings', label: 'Reservas', icon: Calendar },
    { href: '/admin/settings', label: 'Ajustes Local', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-surface-200/90 backdrop-blur-md border-b border-white/[0.08] shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Identidad de Marca */}
        <div className="flex items-center gap-4">
          <Link href="/admin/dashboard" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-md bg-gradient-to-br from-brand-500 to-purple-800 flex items-center justify-center shadow-glow-purple border border-purple-400/40">
              <Sparkles className="w-5 h-5 text-champagne" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                DYNAMIND <span className="text-brand-400 text-xs font-mono">SUITE</span>
              </span>
              <span className="text-[10px] text-zinc-400 block font-mono">Café Canelo & Roasters</span>
            </div>
          </Link>

          {/* Switch Rápido de Rol Táctico (Benchmark Quimbayas) */}
          <div className="hidden md:flex items-center gap-1 bg-surface-100 p-1 rounded border border-white/5 text-xs font-mono">
            <button
              onClick={() => setCurrentRole('admin')}
              className={cn(
                'px-2 py-0.5 rounded transition-colors',
                currentRole === 'admin'
                  ? 'bg-brand-500/20 text-purple-300 font-bold border border-purple-500/30'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              👑 Admin
            </button>
            <button
              onClick={() => setCurrentRole('staff')}
              className={cn(
                'px-2 py-0.5 rounded transition-colors',
                currentRole === 'staff'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              👤 Staff
            </button>
          </div>
        </div>

        {/* Enlaces de Navegación */}
        <nav className="hidden lg:flex items-center gap-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-white/10 text-white font-semibold shadow-inner'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-brand-400' : 'text-zinc-500')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Acceso Rápido al Escáner POS y Onboarding Cliente */}
        <div className="flex items-center gap-2">
          <Link
            href="/join/cafe-canelo"
            target="_blank"
            className="hidden sm:flex items-center gap-1 text-xs text-zinc-400 hover:text-champagne transition-colors px-2 py-1 bg-white/5 rounded"
          >
            <ExternalLink className="w-3 h-3 text-champagne" />
            <span>Ver Pase Cliente</span>
          </Link>
          <Link
            href="/scanner/cafe-canelo"
            className="flex items-center gap-1.5 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white px-3 py-1.5 rounded-md text-xs font-semibold shadow-glow-purple border border-purple-400/40 transition-all active:scale-95"
          >
            <QrCode className="w-4 h-4" />
            <span>Escáner POS</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
