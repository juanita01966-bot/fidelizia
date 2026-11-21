import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';

export const metadata = {
  title: 'Política de Privacidad · Fidelizia',
  description: 'Política de tratamiento de datos personales conforme a la Ley 1581 de 2012.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[260px] bg-champagne/10 blur-[140px] pointer-events-none rounded-full" />

      <div className="max-w-3xl mx-auto relative z-10 space-y-8">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-champagne/15 border border-champagne/30 flex items-center justify-center text-champagne">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Política de Privacidad y Tratamiento de Datos
              </h1>
              <p className="text-xs font-mono text-zinc-400">Marco Legal: Ley 1581 de 2012 (Colombia)</p>
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
            <h2 className="text-base font-bold text-white">1. Datos Recopilados</h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              Para emitir tu tarjeta digital de lealtad y gestionar tus sellos, recopilamos tu nombre completo, número de teléfono móvil (WhatsApp) y, de forma opcional, tu fecha de nacimiento para beneficios de cumpleaños.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white">2. Finalidad del Tratamiento</h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              Tus datos se utilizan exclusivamente para: (a) emitir y actualizar tu pase en Apple Wallet o Google Wallet, (b) registrar visitas y canjes de recompensas, (c) enviar notificaciones sobre tu progreso, reservas y promociones autorizadas del comercio.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white">3. Derechos del Titular (Habeas Data)</h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              Conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013, puedes solicitar en cualquier momento la consulta, actualización, rectificación o supresión de tus datos personales comunicándote directamente con el comercio emisor.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white">4. Seguridad y Resguardo</h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              Las comunicaciones viajan cifradas bajo HTTPS y los tokens de autenticación de tarjetas utilizan control de acceso estricto por comercio en la base de datos.
            </p>
          </section>

          <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-zinc-400">
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              Protección de datos certificada
            </span>
            <Link href="/terms" className="text-champagne hover:underline">
              Ver Términos del Servicio →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
