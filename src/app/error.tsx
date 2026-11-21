'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[App Error Boundary]', error);
  }, [error]);

  return (
    <main className="min-h-[75vh] flex items-center justify-center px-4 py-12 bg-background text-foreground">
      <section className="max-w-md w-full bg-surface-200/90 backdrop-blur-md border border-white/[0.08] shadow-doppelrand rounded-md p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-brand-500/15 border border-brand-400/30 flex items-center justify-center text-brand-400 shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-champagne">
              Error de aplicación
            </p>
            <h1 className="text-lg font-semibold text-zinc-100">
              Algo salió mal
            </h1>
          </div>
        </div>

        <p className="text-sm text-zinc-400 leading-relaxed">
          Ocurrió un inconveniente inesperado al procesar esta vista. Puedes
          intentar recargar la sección o regresar al inicio de Fidelizia.
        </p>

        {error.digest && (
          <div className="rounded-sm bg-surface-100 border border-white/[0.08] px-3 py-2 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
              Referencia
            </span>
            <span className="font-mono text-xs text-champagne">
              {error.digest}
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <Button
            type="button"
            variant="primary"
            className="w-full sm:flex-1"
            onClick={() => reset()}
          >
            <RotateCcw className="h-4 w-4" />
            Reintentar
          </Button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 rounded bg-surface-50 hover:bg-surface-100 text-zinc-200 border border-white/10 shadow-doppelrand transition-all w-full sm:flex-1"
          >
            <Home className="h-4 w-4" />
            Volver al inicio
          </Link>
        </div>
      </section>
    </main>
  );
}
