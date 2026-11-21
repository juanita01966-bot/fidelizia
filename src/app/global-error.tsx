'use client';

import './globals.css';
import { useEffect } from 'react';
import { ShieldAlert, RotateCcw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Global Error Boundary]', error);
  }, [error]);

  return (
    <html lang="es" className="dark">
      <body className="bg-[#08080a] text-[#f4f4f5] min-h-screen antialiased flex items-center justify-center p-4 selection:bg-brand-500/30 selection:text-white">
        <main className="max-w-md w-full bg-[#0e0e11]/95 backdrop-blur-md border border-white/[0.08] shadow-doppelrand rounded-md p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-[#8b5cf6]/15 border border-[#a78bfa]/30 flex items-center justify-center text-[#a78bfa] shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-[#d4a373]">
                Fallo crítico del sistema
              </p>
              <h1 className="text-lg font-semibold text-zinc-100">
                No pudimos cargar la aplicación
              </h1>
            </div>
          </div>

          <p className="text-sm text-zinc-400 leading-relaxed">
            El entorno encontró una interrupción inesperada. Recarga la
            aplicación para restablecer la sesión de trabajo de forma segura.
          </p>

          {error.digest && (
            <div className="rounded-sm bg-[#121215] border border-white/[0.08] px-3 py-2 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                Referencia
              </span>
              <span className="font-mono text-xs text-[#d4a373]">
                {error.digest}
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 rounded bg-[#8b5cf6] hover:bg-[#7c3aed] text-white border border-[#a78bfa]/30 shadow-glow-purple transition-all w-full sm:flex-1 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              Recargar aplicación
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 rounded bg-[#18181b] hover:bg-[#121215] text-zinc-200 border border-white/10 shadow-doppelrand transition-all w-full sm:flex-1"
            >
              <Home className="h-4 w-4" />
              Ir al inicio
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
