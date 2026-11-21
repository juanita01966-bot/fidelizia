'use client';

import React, { useEffect, useState } from 'react';
import { Lock, Delete, ShieldAlert, X } from 'lucide-react';
import { soundEngine } from '@/lib/audio/sound-effects';
import { cn } from '@/lib/utils';

interface PinPadModalProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  description?: string;
  onSuccess?: (pin: string) => void;
  onSubmit?: (pin: string) => void;
  onCancel?: () => void;
  onClose?: () => void;
  error?: string | null;
  errorMessage?: string | null;
  isSubmitting?: boolean;
}

export function PinPadModal({
  isOpen,
  title = 'Autenticación de Personal',
  subtitle,
  description,
  onSuccess,
  onSubmit,
  onCancel,
  onClose,
  error,
  errorMessage,
  isSubmitting = false,
}: PinPadModalProps) {
  const [pin, setPin] = useState('');

  const effectiveSubtitle =
    subtitle || description || 'Ingresa tu PIN personal de 4 dígitos para habilitar el escáner';
  const effectiveError = error || errorMessage;

  useEffect(() => {
    if (!isOpen || effectiveError) {
      setPin('');
    }
  }, [isOpen, effectiveError]);

  useEffect(() => {
    if (!isOpen || pin.length < 4 || isSubmitting) return;
    const timer = setTimeout(() => {
      setPin('');
    }, 350);
    return () => clearTimeout(timer);
  }, [isOpen, pin, isSubmitting]);

  const handleSuccess = (completedPin: string) => {
    if (onSuccess) onSuccess(completedPin);
    if (onSubmit) onSubmit(completedPin);
  };

  const handleClose = () => {
    setPin('');
    if (onCancel) onCancel();
    if (onClose) onClose();
  };

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (isSubmitting) return;
    const base = pin.length >= 4 ? '' : pin;
    const nextPin = base + digit;
    setPin(nextPin);
    soundEngine.playScanSuccess();
    if (nextPin.length === 4) {
      handleSuccess(nextPin);
    }
  };

  const handleDelete = () => {
    if (isSubmitting) return;
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (isSubmitting) return;
    setPin('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xs max-h-[90vh] overflow-y-auto custom-scrollbar bg-surface-200 border border-white/10 shadow-doppelrand rounded-xl p-6 text-center relative">
        {(onCancel || onClose) && (
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar teclado de PIN"
            className="absolute top-3 right-3 p-1 text-zinc-400 hover:text-white rounded-md hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto mb-3">
          <Lock className="w-6 h-6 text-purple-400" />
        </div>

        <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
        <p className="text-xs text-zinc-400 mt-1 mb-5">{effectiveSubtitle}</p>

        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={cn(
                'w-4 h-4 rounded-full border transition-all duration-200',
                pin.length > idx
                  ? 'bg-brand-500 border-brand-400 shadow-glow-purple scale-110'
                  : 'bg-zinc-800 border-zinc-700'
              )}
            />
          ))}
        </div>

        {effectiveError && (
          <div className="mb-4 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300 flex items-center justify-center gap-1.5 animate-shake">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>{effectiveError}</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              disabled={isSubmitting}
              onClick={() => handleDigit(d)}
              className="h-13 w-full rounded-lg bg-surface-100 hover:bg-surface-50 border border-white/5 active:scale-95 text-xl font-mono font-medium text-white transition-all flex items-center justify-center shadow-sm disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleClear}
            aria-label="Limpiar PIN"
            className="h-13 w-full rounded-lg bg-surface-100/40 hover:bg-white/5 border border-white/5 text-xs text-zinc-400 font-mono flex items-center justify-center disabled:opacity-50"
          >
            C
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleDigit('0')}
            className="h-13 w-full rounded-lg bg-surface-100 hover:bg-surface-50 border border-white/5 active:scale-95 text-xl font-mono font-medium text-white transition-all flex items-center justify-center shadow-sm disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleDelete}
            aria-label="Borrar último dígito"
            className="h-13 w-full rounded-lg bg-surface-100 hover:bg-surface-50 border border-white/5 active:scale-95 text-zinc-300 flex items-center justify-center disabled:opacity-50"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {(onCancel || onClose) && (
          <button
            type="button"
            onClick={handleClose}
            className="mt-5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
