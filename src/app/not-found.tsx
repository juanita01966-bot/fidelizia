import Link from 'next/link';
import { Compass, Home, QrCode } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4 py-12 bg-background text-foreground">
      <section className="max-w-md w-full bg-surface-200/90 backdrop-blur-md border border-white/[0.08] shadow-doppelrand rounded-md p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-sm bg-champagne/10 border border-champagne/30 font-mono text-xs uppercase tracking-widest text-champagne">
            Error 404
          </span>
          <Compass className="h-5 w-5 text-brand-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-zinc-100">
            Página no encontrada
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            La ruta solicitada no existe o fue movida. Verifica el enlace de tu
            comercio o regresa al portal principal de Fidelizia.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 rounded bg-brand-500 hover:bg-brand-600 text-white border border-brand-400/30 shadow-glow-purple transition-all w-full sm:flex-1"
          >
            <Home className="h-4 w-4" />
            Volver al inicio
          </Link>
          <Link
            href="/dsb"
            className="inline-flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 rounded bg-surface-50 hover:bg-surface-100 text-zinc-200 border border-white/10 shadow-doppelrand transition-all w-full sm:flex-1"
          >
            <QrCode className="h-4 w-4 text-champagne" />
            Portal Staff
          </Link>
        </div>
      </section>
    </main>
  );
}
