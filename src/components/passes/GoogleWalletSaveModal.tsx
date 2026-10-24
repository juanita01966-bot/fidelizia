'use client';

import React, { useState } from 'react';
import { 
  Smartphone, 
  CheckCircle2, 
  ExternalLink, 
  X, 
  ShieldCheck, 
  Sparkles,
  Info,
  Copy,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { soundEngine } from '@/lib/audio/sound-effects';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

interface GoogleWalletSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  serialNumber: string;
  currentStamps: number;
  totalNeeded: number;
  tierName?: string;
  onOpenFullScreenPass: () => void;
}

export function GoogleWalletSaveModal({
  isOpen,
  onClose,
  customerName,
  serialNumber,
  currentStamps,
  totalNeeded,
  tierName = 'BRONCE',
  onOpenFullScreenPass,
}: GoogleWalletSaveModalProps) {
  const [step, setStep] = useState<'save_prompt' | 'success' | 'dev_instructions'>('save_prompt');
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const handleSimulateSave = () => {
    soundEngine.playScanSuccess();
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#4285F4', '#34A853', '#FBBC05', '#EA4335'],
    });
    setStep('success');

    // Apertura directa sin bloqueo de popups
    const saveUrl = `/api/v1/wallet/google/save-url?serial=${encodeURIComponent(serialNumber)}&name=${encodeURIComponent(customerName)}&stamps=${currentStamps}`;
    window.open(saveUrl, '_blank');

    toast.success('¡Enlace de Google Wallet generado!', {
      description: 'Se abrió la pantalla oficial de Google Pay para guardar tu tarjeta.',
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 text-left">
      <div className="w-full max-w-md bg-surface-200 border border-white/15 rounded-2xl overflow-hidden shadow-2xl relative flex flex-col">
        
        {/* HEADER ESTILO GOOGLE WALLET */}
        <div className="bg-surface-100 border-b border-white/10 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Logo de 4 Colores Oficial de Google */}
            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center p-1 shadow-sm">
              <svg viewBox="0 0 24 24" className="w-4 h-4">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>
            <span className="font-sans font-semibold text-white text-sm">Google Wallet</span>
          </div>

          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CONTENIDO DEL MODAL */}
        <div className="p-5 sm:p-6 space-y-4">
          {step === 'save_prompt' && (
            <>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 block mb-1">
                  Pase de Fidelización Digital
                </span>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  ¿Guardar tarjeta en Google Wallet?
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Esta tarjeta te permitirá acumular sellos de visita y canjear recompensas en Café Canelo desde tu teléfono Android o cuenta de Google.
                </p>
              </div>

              {/* Tarjeta Resumen Preview */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 border border-white/10 shadow-inner flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest block">
                    Café Canelo & Roasters
                  </span>
                  <span className="text-sm font-bold text-white block mt-0.5">{customerName}</span>
                  <span className="text-[10px] font-mono text-amber-400 mt-1 block">
                    Nivel: {tierName} · {currentStamps} de {totalNeeded} sellos
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono text-zinc-400 block">{serialNumber}</span>
                  <span className="inline-flex items-center gap-1 text-[9px] font-mono text-emerald-400 mt-1">
                    <ShieldCheck className="w-3 h-3" />
                    Pase Activo
                  </span>
                </div>
              </div>

              {/* Cuenta de Google Vinculada */}
              <div className="p-2.5 rounded-lg bg-surface-100 border border-white/5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                    {customerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-zinc-200 block text-[11px] font-medium leading-none">
                      {customerName}
                    </span>
                    <span className="text-zinc-500 text-[10px] font-mono">
                      Cuenta Google Pay sincronizada
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-blue-400 font-semibold">Listo para vincular</span>
              </div>

              {/* Botones de Acción */}
              <div className="pt-2 space-y-2">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleSimulateSave}
                  className="w-full bg-white hover:bg-zinc-100 text-zinc-950 font-bold py-3.5 shadow-md flex items-center justify-center gap-2"
                >
                  <Smartphone className="w-4 h-4 text-blue-600" />
                  <span>Guardar en Google Wallet</span>
                </Button>

                <button
                  type="button"
                  onClick={() => setStep('dev_instructions')}
                  className="w-full text-center text-[11px] text-zinc-400 hover:text-white flex items-center justify-center gap-1.5 py-1.5 font-mono"
                >
                  <Info className="w-3.5 h-3.5 text-blue-400" />
                  <span>¿Cómo conectar el enlace oficial en producción?</span>
                </button>
              </div>
            </>
          )}

          {step === 'success' && (
            <div className="text-center py-2 space-y-4 animate-in fade-in duration-300">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center shadow-glow-emerald">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  ¡Tarjeta guardada en Google Wallet!
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed max-w-xs mx-auto">
                  Tu pase está listo. En tu teléfono Android puedes abrir la app <strong>Google Wallet</strong> o presentarla en pantalla completa desde este navegador.
                </p>
              </div>

              <div className="p-3 bg-surface-100 rounded-xl border border-white/5 text-left text-xs space-y-1">
                <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                  <span>Titular:</span>
                  <span className="text-white font-semibold">{customerName}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                  <span>Serial Único:</span>
                  <span className="font-mono text-purple-300">{serialNumber}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                  <span>Estado:</span>
                  <span className="text-emerald-400 font-bold">Activo en Billetera</span>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    onClose();
                    onOpenFullScreenPass();
                  }}
                  className="w-full font-bold shadow-glow-purple flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-champagne" />
                  <span>Ver Tarjeta en Pantalla Completa</span>
                </Button>

                <a
                  href={`/api/v1/wallet/google/save-url?serial=${encodeURIComponent(serialNumber)}&name=${encodeURIComponent(customerName)}&stamps=${currentStamps}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-3 rounded-lg bg-surface-100 hover:bg-surface-50 border border-white/10 text-white font-mono text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                  <span>Reabrir enlace oficial de Google Wallet</span>
                </a>

                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs text-zinc-500 hover:text-zinc-300 block w-full py-1 font-mono"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {step === 'dev_instructions' && (
            <div className="space-y-3.5 text-xs">
              <div className="border-b border-white/10 pb-2">
                <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-blue-400" />
                  <span>Cómo funciona Google Wallet en la realidad</span>
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Google Wallet <strong>NO utiliza archivos descargables</strong> (.json o .pdf). Funciona mediante un enlace web universal oficial de Google.
                </p>
              </div>

              <div className="space-y-2 font-mono text-[11px] text-zinc-300">
                <div className="p-2.5 rounded-lg bg-surface-100 border border-white/5">
                  <span className="text-blue-400 font-bold block mb-1">1. Formato Universal Oficial:</span>
                  <p className="text-zinc-400 text-[10px]">
                    El botón oficial de Google en producción abre un enlace firmado:
                  </p>
                  <code className="text-[9.5px] text-emerald-300 block mt-1 break-all bg-black/40 p-1.5 rounded border border-white/5">
                    https://pay.google.com/gp/v/save/eyJhbGciOiJSUzI1Ni...
                  </code>
                </div>

                <div className="p-2.5 rounded-lg bg-surface-100 border border-white/5">
                  <span className="text-amber-400 font-bold block mb-1">2. Pasos Gratuitos para Producción:</span>
                  <ul className="list-disc list-inside space-y-1 text-zinc-400 text-[10.5px]">
                    <li>Crear cuenta en <strong>Google Pay & Wallet Console</strong> (100% gratis).</li>
                    <li>Obtener tu <strong>Issuer ID</strong> (ID de Emisor de Google).</li>
                    <li>Crear una Cuenta de Servicio en Google Cloud con su clave RSA privada.</li>
                  </ul>
                </div>

                <div className="p-2.5 rounded-lg bg-surface-100 border border-white/5">
                  <span className="text-purple-400 font-bold block mb-1">3. Para Probar Hoy en tu Celular:</span>
                  <p className="text-zinc-400 text-[10.5px] leading-relaxed">
                    Usa el botón <strong>"Ver Mi Pase en Pantalla Completa"</strong> o pulsa los 3 puntos de tu navegador y selecciona <strong>"Añadir a pantalla de inicio"</strong>. Te quedará un icono idéntico a una app nativa con tu QR listo para escanear en caja.
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep('save_prompt')}
                className="w-full text-xs"
              >
                Volver al asistente de guardado
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
