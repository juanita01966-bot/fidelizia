'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  ExternalLink,
  Menu,
  X,
  LogOut,
  Trophy,
} from 'lucide-react';
import { getSessionManager } from '@/lib/store/auth-session';
import { cn } from '@/lib/utils';

export function AdminNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const sessionManager = getSessionManager();
  const [session, setSession] = useState(sessionManager.getSession());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setSession(sessionManager.getSession());
    return sessionManager.subscribe(() => {
      setSession(sessionManager.getSession());
    });
  }, [sessionManager]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const merchantSlug = session.merchantSlug || 'cafe-canelo';
  const canAccessSensitive =
    session.serverRole === 'admin' || session.serverRole === 'manager';

  const navLinks = [
    { href: '/admin/dashboard', label: 'CRM & Métricas', icon: LayoutDashboard, adminOnly: false },
    { href: '/admin/card-builder', label: 'Diseño Tarjeta', icon: CreditCard, adminOnly: false },
    { href: '/admin/customers', label: 'Clientes RFM', icon: Users, adminOnly: false },
    { href: '/admin/referrals', label: 'Embajadores QR', icon: Trophy, adminOnly: true },
    { href: '/admin/fraud-audit', label: 'Alertas Antifraude', icon: ShieldAlert, adminOnly: true },
    { href: '/admin/notifications', label: 'Push Wallet', icon: BellRing, adminOnly: false },
    { href: '/admin/bookings', label: 'Reservas', icon: Calendar, adminOnly: false },
    { href: '/admin/settings', label: 'Ajustes Local', icon: Settings, adminOnly: true },
  ].filter((item) => !item.adminOnly || canAccessSensitive);

  const handleLogout = async () => {
    await sessionManager.logoutAsync();
    router.push('/dsb');
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-surface-200/90 backdrop-blur-md border-b border-white/[0.08] shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
            aria-expanded={mobileMenuOpen}
            className="lg:hidden p-2 rounded-lg bg-surface-100 border border-white/10 text-zinc-300 hover:text-white transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link href="/admin/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-md bg-gradient-to-br from-brand-500 to-purple-800 flex items-center justify-center shadow-glow-purple border border-purple-400/40 shrink-0">
              <Sparkles className="w-5 h-5 text-champagne" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5 truncate">
                FIDELIZIA <span className="text-brand-400 text-xs font-mono">SUITE</span>
              </span>
              <span className="text-[10px] text-zinc-400 block font-mono truncate">
                {session.operatorName || merchantSlug}
              </span>
            </div>
          </Link>

          {canAccessSensitive && (
            <div className="hidden xl:flex items-center gap-1 bg-surface-100 p-1 rounded border border-white/5 text-xs font-mono">
              <button
                type="button"
                onClick={() => sessionManager.switchRole('admin')}
                className={cn(
                  'px-2 py-0.5 rounded transition-colors',
                  session.role === 'admin'
                    ? 'bg-brand-500/20 text-purple-300 font-bold border border-purple-500/30'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => sessionManager.switchRole('staff')}
                className={cn(
                  'px-2 py-0.5 rounded transition-colors',
                  session.role === 'staff'
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Staff
              </button>
            </div>
          )}
        </div>

        <nav className="hidden lg:flex items-center gap-1" aria-label="Navegación administrativa">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
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

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/join/${merchantSlug}`}
            target="_blank"
            className="hidden sm:flex items-center gap-1 text-xs text-zinc-400 hover:text-champagne transition-colors px-2 py-1 bg-white/5 rounded"
          >
            <ExternalLink className="w-3 h-3 text-champagne" />
            <span>Pase Cliente</span>
          </Link>
          <Link
            href={`/scanner/${merchantSlug}`}
            className="flex items-center gap-1.5 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white px-3 py-1.5 rounded-md text-xs font-semibold shadow-glow-purple border border-purple-400/40 transition-all active:scale-95"
          >
            <QrCode className="w-4 h-4" />
            <span className="hidden sm:inline">Escáner POS</span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="hidden sm:inline-flex p-1.5 rounded-md bg-surface-100 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-white/[0.08] bg-surface-200 px-4 py-3 space-y-1.5 animate-in fade-in duration-150">
          <nav className="flex flex-col gap-1" aria-label="Navegación móvil administrativa">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-brand-500/15 text-white font-semibold border border-brand-500/30'
                      : 'text-zinc-300 hover:bg-white/5'
                  )}
                >
                  <Icon className={cn('w-4 h-4', isActive ? 'text-brand-400' : 'text-zinc-500')} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="pt-2 mt-2 border-t border-white/[0.08] flex items-center justify-between gap-2">
            <Link
              href={`/join/${merchantSlug}`}
              target="_blank"
              className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-champagne px-3 py-2 bg-surface-100 rounded-lg border border-white/10"
            >
              <ExternalLink className="w-3.5 h-3.5 text-champagne" />
              <span>Ver Pase Cliente</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-red-300 hover:text-red-200 px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
