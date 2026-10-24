'use client';

import React, { useState } from 'react';
import { Lock, Sparkles, ShieldCheck, KeyRound, User, ArrowRight, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getSessionManager } from '@/lib/store/auth-session';
import { soundEngine } from '@/lib/audio/sound-effects';
import { toast } from 'sonner';

interface AdminLoginProps {
  onLoginSuccess: () => void;
}

export function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const sessionManager = getSessionManager();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = sessionManager.login(username, password);
    if (res.success) {
      soundEngine.playScanSuccess();
      toast.success('Sesión iniciada con éxito');
      onLoginSuccess();
    } else {
      soundEngine.playFraudAlert();
      setError(res.error || 'Credenciales inválidas');
    }
  };

  const handleQuickLogin = (role: 'admin' | 'staff') => {
    sessionManager.switchRole(role);
    soundEngine.playScanSuccess();
    toast.success(`Acceso rápido autorizado como ${role === 'admin' ? '👑 Admin Master' : '👤 Staff Recepción'}`);
    onLoginSuccess();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Luz Ambiental de Fondo */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-brand-600/15 blur-[140px] pointer-events-none rounded-full" />

      <div className="w-full max-w-md bg-surface-200/95 border border-white/10 shadow-doppelrand rounded-2xl p-6 sm:p-8 text-center relative z-10">
        {/* Monograma de la Suite */}
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-500 to-purple-800 flex items-center justify-center mx-auto mb-4 shadow-glow-purple border border-brand-400/40">
          <Sparkles className="w-7 h-7 text-champagne" />
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          Panel Administrativo <span className="text-brand-400">DSB</span>
        </h2>
        <p className="text-xs text-zinc-400 mt-1 mb-6">
          Ingresa tus credenciales para acceder a la suite de Café Canelo & Roasters.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-center gap-2 text-left">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Formulario de Login */}
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="text-xs font-mono text-zinc-300 block mb-1">
              Usuario / Rol
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                placeholder="admin o staff"
                className="w-full bg-surface-100 border border-white/10 rounded pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-300 block mb-1">
              Contraseña o PIN de 4 dígitos
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="12345678 (admin) o 1234 (staff)"
                className="w-full bg-surface-100 border border-white/10 rounded pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <Button type="submit" variant="primary" size="lg" className="w-full mt-2">
            <Lock className="w-4 h-4 mr-2" />
            Iniciar Sesión
          </Button>
        </form>

        {/* Separador */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase font-mono">
            <span className="bg-surface-200 px-2 text-zinc-500">O ingresa rápido en 1 clic</span>
          </div>
        </div>

        {/* Botones de Acceso Rápido para Pruebas Demo */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleQuickLogin('admin')}
            className="p-3 rounded-lg bg-surface-100 hover:bg-surface-50 border border-purple-500/30 hover:border-purple-500/60 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-purple-300">👑 Admin Master</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-purple-300 transition-colors" />
            </div>
            <p className="text-[10px] text-zinc-400">Acceso total a finanzas, CRM y seguridad.</p>
          </button>

          <button
            type="button"
            onClick={() => handleQuickLogin('staff')}
            className="p-3 rounded-lg bg-surface-100 hover:bg-surface-50 border border-amber-500/30 hover:border-amber-500/60 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-amber-300">👤 Staff POS</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-300 transition-colors" />
            </div>
            <p className="text-[10px] text-zinc-400">Ceguera financiera. Operación y escáner.</p>
          </button>
        </div>

        <div className="mt-6 text-[11px] text-zinc-500 font-mono">
          <a href="/" className="hover:text-zinc-300 transition-colors">
            ← Volver al portal comercial
          </a>
        </div>
      </div>
    </div>
  );
}
