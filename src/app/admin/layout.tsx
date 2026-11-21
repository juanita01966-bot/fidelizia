'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminNavbar } from '@/components/navigation/AdminNavbar';
import { AdminLogin } from '@/components/dashboard/AdminLogin';
import { getSessionManager } from '@/lib/store/auth-session';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionManager = getSessionManager();
  const [session, setSession] = useState(sessionManager.getSession());
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    const unsub = sessionManager.subscribe(() => {
      if (mounted) {
        setSession(sessionManager.getSession());
      }
    });

    sessionManager.refreshSession().finally(() => {
      if (mounted) {
        setSession(sessionManager.getSession());
        setIsChecking(false);
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [sessionManager]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-zinc-400 text-xs font-mono">
          <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
          <span>Verificando sesión segura...</span>
        </div>
      </div>
    );
  }

  if (!session.isAuthenticated) {
    return (
      <AdminLogin
        onLoginSuccess={() => {
          setSession(sessionManager.getSession());
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between overflow-x-hidden">
      <AdminNavbar />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">{children}</main>
      <footer className="border-t border-white/[0.06] bg-black/40 py-4 text-center text-xs text-zinc-500 font-mono">
        Fidelizia CRM Suite · Sesión Cifrada HTTP-Only · Multi-Tenant
      </footer>
    </div>
  );
}
