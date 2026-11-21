// src/components/passes/PremioDesbloqueadoModal.tsx
'use client';

import React, { useEffect } from 'react';
import { Trophy, Sparkles, X, Gift, CheckCircle2, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import { soundEngine } from '@/lib/audio/sound-effects';
import { RealQrCode } from './RealQrCode';

interface PremioDesbloqueadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  serialNumber: string;
  rewardDescription: string;
  stampsCount: number;
  merchantName: string;
  onOpenMobilePass?: () => void;
}

export function PremioDesbloqueadoModal({
  isOpen,
  onClose,
  customerName,
  serialNumber,
  rewardDescription,
  stampsCount,
  merchantName,
  onOpenMobilePass,
}: PremioDesbloqueadoModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    soundEngine.playRedeemCelebration();

    let cancelled = false;
    let rafId = 0;
    const end = Date.now() + 1500;

    const frame = () => {
      if (cancelled) return;
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#8b5cf6', '#d4a373', '#10b981'],
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#8b5cf6', '#d4a373', '#10b981'],
      });
      if (!cancelled && Date.now() < end) {
        rafId = requestAnimationFrame(frame);
      }
    };
    rafId = requestAnimationFrame(frame);

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([150, 70, 150, 70, 300]);
      } catch {
        // Ignorar si el navegador bloquea la vibración
      }
    }

    return () => {
      cancelled = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
      <div
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar bg-surface-200 border border-champagne/40 rounded-2xl shadow-2xl p-6 sm:p-7 text-left"
        style={{
          boxShadow: '0 0 50px -10px rgba(212, 163, 115, 0.3), 0 25px 50px -12px rgba(0, 0, 0, 0.9)',
        }}
      >
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 bg-champagne/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 right-0 w-60 h-60 bg-brand-600/20 rounded-full blur-3xl pointer-events-none" />

        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar modal"
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center pt-2 pb-4 relative z-10">
          <div className="relative mb-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-champagne/30 via-brand-600/30 to-purple-900/40 border border-champagne/50 flex items-center justify-center shadow-lg">
              <Trophy className="w-9 h-9 text-champagne animate-bounce" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white border-2 border-surface-200">
              <Sparkles className="w-3 h-3" />
            </div>
          </div>

          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-champagne font-bold">
            ¡Meta Alcanzada · {stampsCount} Sellos!
          </span>
          <h2 className="text-2xl font-extrabold text-white tracking-tight mt-1">
            ¡PREMIO DESBLOQUEADO!
          </h2>
          <p className="text-xs text-zinc-300 mt-1.5 max-w-xs">
            ¡Felicitaciones, <strong>{customerName}</strong>! Has completado tu tarjeta de lealtad en {merchantName}.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-gradient-to-br from-surface-100 via-surface-100 to-amber-950/20 border border-champagne/30 relative overflow-hidden my-3 z-10">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-champagne/15 border border-champagne/30 text-champagne shrink-0 mt-0.5">
              <Gift className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
                Tu Recompensa en Caja
              </span>
              <h3 className="text-base font-bold tracking-tight mt-0.5 text-champagne">
                {rewardDescription}
              </h3>
              <p className="text-[11px] text-zinc-300 mt-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Disponible de inmediato para canjear</span>
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-100 border border-white/10 flex items-center gap-4 my-3 relative z-10">
          <div className="p-1.5 bg-white rounded-lg shrink-0">
            <RealQrCode value={serialNumber} size={68} />
          </div>
          <div>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
              Código de Canje
            </span>
            <span className="text-xs font-mono font-bold text-white tracking-wider block mt-0.5">
              {serialNumber}
            </span>
            <p className="text-[10px] text-zinc-400 mt-1 leading-snug">
              Presenta este código al barista o cajero para validar tu premio de cortesía.
            </p>
          </div>
        </div>

        <div className="space-y-2 pt-2 relative z-10">
          {onOpenMobilePass && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenMobilePass();
              }}
              className="w-full bg-champagne hover:bg-amber-400 text-zinc-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] text-xs uppercase tracking-wider"
            >
              <span>Presentar en Pantalla Completa</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full bg-surface-100 hover:bg-surface-50 border border-white/10 text-zinc-300 hover:text-white font-medium py-2.5 px-4 rounded-xl text-xs transition-colors"
          >
            Entendido, lo reclamaré ahora
          </button>
        </div>
      </div>
    </div>
  );
}
