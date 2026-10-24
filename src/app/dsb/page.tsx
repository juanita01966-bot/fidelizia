'use client';

import React, { useState, useEffect } from 'react';
import { getSessionManager } from '@/lib/store/auth-session';
import { AdminLogin } from '@/components/dashboard/AdminLogin';
import { UnifiedDashboard } from '@/components/dashboard/UnifiedDashboard';

export default function DsbPage() {
  const sessionManager = getSessionManager();
  const [session, setSession] = useState(sessionManager.getSession());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return sessionManager.subscribe(() => {
      setSession(sessionManager.getSession());
    });
  }, [sessionManager]);

  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!session.isAuthenticated) {
    return <AdminLogin onLoginSuccess={() => setSession(sessionManager.getSession())} />;
  }

  return <UnifiedDashboard />;
}
