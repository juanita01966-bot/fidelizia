'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Sparkles, KeyRound, User, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getSessionManager } from '@/lib/store/auth-session';
import { soundEngine } from '@/lib/audio/sound-effects';
import { toast } from 'sonner';

interface AdminLoginProps {
  onLoginSuccess: () => void;
  defaultMerchantSlug?: string;
}

export function AdminLogin({
  onLoginSuccess,
  defaultMerchantSlug = 'cafe-canelo',
}: AdminLoginProps) {
  const router = useRouter();
  const sessionManager = getSessionManager();

  const [merchantSlug, setMerchantSlug] = useState(defaultMerchantSlug);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await sessionManager.loginAsync({
        merchantSlug: merchantSlug.trim() || 'cafe-canelo',
        identifier: username,
        secret: password,
      });

      if (res.success) {
        soundEngine.playScanSuccess();
        toast.success('Sesión iniciada con éxito');
        onLoginSuccess();

        if (typeof window !== 'undefined') {
          const nextParam = new URLSearchParams(window.location.search).get('next');
          if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
            router.push(nextParam);
          }
        }
      } else {
        soundEngine.playFraudAlert();
        setError(res.error || 'Credenciales inválidas');
      }
    } catch {
      soundEngine.playFraudAlert();
      setError('No se pudo conectar con el servidor de autenticación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-brand-600/15 blur-[140px] pointer-events-none rounded-full" />

      <div className="w-full max-w-md bg-surface-200/95 border border-white/10 shadow-doppelrand rounded-2xl p-6 sm:p-8 text-center relative z-10">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-500 to-purple-800 flex items-center justify-center mx-auto mb-4 shadow-glow-purple border border-brand-400/40">
          <Sparkles className="w-7 h-7 text-champagne" />
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          Panel Administrativo <span className="text-brand-400">Fidelizia</span>
        </h2>
        <p className="text-xs text-zinc-400 mt-1 mb-6">
          Ingresa tus credenciales autorizadas para acceder a la consola operativa.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-center gap-2 text-left">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label htmlFor="login-slug" className="text-xs font-mono text-zinc-300 block mb-1">
              Identificador del Comercio
            </label>
            <input
              id="login-slug"
              type="text"
              required
              value={merchantSlug}
              onChange={(e) => {
                setMerchantSlug(e.target.value);
                setError(null);
              }}
              placeholder="Ej: cafe-canelo"
              className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label htmlFor="login-identifier" className="text-xs font-mono text-zinc-300 block mb-1">
              Usuario, Email o Nombre
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                id="login-identifier"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                placeholder="usuario o correo electrónico"
                className="w-full bg-surface-100 border border-white/10 rounded pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-secret" className="text-xs font-mono text-zinc-300 block mb-1">
              Contraseña o PIN de Operador
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                id="login-secret"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="••••••••"
                className="w-full bg-surface-100 border border-white/10 rounded pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSubmitting}
            className="w-full mt-2"
          >
            <Lock className="w-4 h-4 mr-2" />
            Iniciar Sesión
          </Button>
        </form>

        <div className="mt-6 text-[11px] text-zinc-500 font-mono">
          <Link href="/" className="hover:text-zinc-300 transition-colors">
            ← Volver al portal comercial
          </Link>
        </div>
      </div>
    </div>
  );
}
