import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, FileText } from 'lucide-react';

export const metadata = {
  title: 'Términos del Servicio · Fidelizia',
  description: 'Términos y condiciones de uso del programa de lealtad digital Fidelizia.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[260px] bg-brand-600/10 blur-[140px] pointer-events-none rounded-full" />

      <div className="max-w-3xl mx-auto relative z-10 space-y-8">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-500/15 border border-brand-400/30 flex items-center justify-center text-champagne">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Términos y Condiciones del Servicio
              </h1>
              <p className="text-xs font-mono text-zinc-400">Programa de Lealtad Digital · Fidelizia</p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 border border-white/10 text-xs font-mono text-zinc-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver
          </Link>
        </div>

        <div className="bg-surface-200/90 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-doppelrand space-y-6 text-sm text-zinc-300 leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-base font-bold text-white">1. Naturaleza del Pase Digital</h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              La tarjeta de lealtad emitida a través de Fidelizia para Apple Wallet, Google Wallet o acceso web es personal e intransferible. Permite acumular sellos digitales y acceder a beneficios definidos por el comercio emisor.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white">2. Acumulación de Sellos y Antiaudit</h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              Cada comercio establece las reglas de acumulación por factura o visita, incluyendo tiempos mínimos entre visitas (cooldown) y validación presencial en punto de venta. Los sellos no tienen valor monetario ni son canjeables por dinero en efectivo.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white">3. Canje de Recompensas</h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              Al completar la meta de sellos configurada por el comercio, podrás reclamar la recompensa vigente presentando el código QR oficial de tu pase en caja. Todo canje es autorizado por personal del establecimiento.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white">4. Uso Correcto y Suspensión</h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              El comercio se reserva el derecho de anular sellos obtenidos mediante duplicación de tickets, uso fraudulento o incumplimiento de estas condiciones.
            </p>
          </section>

          <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-zinc-400">
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              Cumplimiento normativo de fidelización
            </span>
            <Link href="/privacy" className="text-champagne hover:underline">
              Ver Política de Privacidad (Ley 1581) →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
