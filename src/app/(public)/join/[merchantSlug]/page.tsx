'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Sparkles,
  Smartphone,
  CheckCircle2,
  Gift,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LivePassPreview } from '@/components/passes/LivePassPreview';
import { INITIAL_MERCHANT } from '@/lib/store/fidelizia-store';
import { saveActivePassSerial } from '@/lib/pwa/pwa-helper';
import { soundEngine } from '@/lib/audio/sound-effects';
import type { LoyaltyTier, Merchant } from '@/types/domain';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

function GoogleColorIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
  );
}

function normalizePhoneE164(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  return `+57${trimmed.replace(/\D/g, '')}`;
}

function normalizeReferralCodeClient(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase();
  return /^[A-Z0-9-]{3,24}$/.test(cleaned) ? cleaned : null;
}

function readCookieClient(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const pairs = document.cookie.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      const val = pair.slice(idx + 1).trim();
      try {
        return decodeURIComponent(val);
      } catch {
        return val;
      }
    }
  }
  return null;
}

export default function JoinPage() {
  const params = useParams();
  const slug =
    typeof params?.merchantSlug === 'string' && params.merchantSlug.trim()
      ? params.merchantSlug.trim().toLowerCase()
      : 'cafe-canelo';

  const [merchant, setMerchant] = useState<Merchant>(INITIAL_MERCHANT);
  const [merchantNotFound, setMerchantNotFound] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [selectedPassType, setSelectedPassType] = useState<'apple' | 'google'>('google');
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isRegistered, setIsRegistered] = useState(false);
  const [registeredData, setRegisteredData] = useState<{
    customerName: string;
    serialNumber: string;
    currentStamps: number;
    passType: 'apple' | 'google';
    loyaltyTier: LoyaltyTier;
  } | null>(null);

  useEffect(() => {
    const iosDetected =
      typeof navigator !== 'undefined' &&
      /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    setIsIosDevice(iosDetected);
    setSelectedPassType(iosDetected ? 'apple' : 'google');

    // First-touch precedence: prefer existing fidz_ref cookie, fallback to ?ref= query param
    const cookieRef = normalizeReferralCodeClient(readCookieClient('fidz_ref'));
    const queryRef =
      typeof window !== 'undefined'
        ? normalizeReferralCodeClient(new URLSearchParams(window.location.search).get('ref'))
        : null;
    const resolvedRef = cookieRef || queryRef;
    if (resolvedRef) {
      setReferralCode(resolvedRef);
    }

    const controller = new AbortController();
    fetch(`/api/v1/merchant/settings?slug=${encodeURIComponent(slug)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (res) => {
        if (res.status === 404) {
          setMerchantNotFound(true);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (data?.merchant) {
          setMerchant(data.merchant as Merchant);
        }
      })
      .catch(() => {
        // Ignore abort
      });

    return () => controller.abort();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!termsAccepted) {
      toast.error('Debes aceptar los términos y la política de tratamiento de datos para continuar');
      return;
    }

    if (!fullName.trim() || fullName.trim().length < 3) {
      toast.error('Ingresa tu nombre completo');
      return;
    }

    if (!phone.trim() || phone.replace(/\D/g, '').length < 7) {
      toast.error('Ingresa un número de WhatsApp válido');
      return;
    }

    const formattedPhone = normalizePhoneE164(phone);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/v1/customers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: formattedPhone,
          birthdate: birthdate || null,
          passType: selectedPassType,
          merchantSlug: slug,
          termsAccepted: true,
          ...(referralCode ? { referralCode } : {}),
        }),
      });

      const resJson = await response.json();
      if (!response.ok || !resJson.success) {
        toast.error('No pudimos completar tu registro', {
          description: resJson.message || 'Verifica los campos e intenta de nuevo.',
        });
        return;
      }

      const serial = resJson.pass.pass_serial_number as string;
      saveActivePassSerial(serial);

      setRegisteredData({
        customerName: resJson.customer.full_name,
        serialNumber: serial,
        currentStamps: resJson.pass.current_stamps ?? 1,
        passType: resJson.pass.pass_type === 'apple' ? 'apple' : 'google',
        loyaltyTier: (resJson.customer.loyalty_tier as LoyaltyTier) || 'bronze',
      });

      setIsRegistered(true);
      soundEngine.playRedeemCelebration();

      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#8b5cf6', '#d4a373', '#10b981'],
      });

      toast.success('¡Tarjeta digital generada con éxito!', {
        description: 'Hemos sumado tu primer sello de bienvenida.',
      });
    } catch {
      toast.error('Error de conexión con el servidor');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (merchantNotFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-surface-200 border border-white/10 rounded-2xl p-6 text-center space-y-3">
          <h1 className="text-lg font-bold text-white">Comercio no encontrado</h1>
          <p className="text-xs text-zinc-400">
            El enlace de registro <code className="font-mono text-zinc-200">/join/{slug}</code> no corresponde a un comercio activo.
          </p>
          <Link href="/" className="text-xs font-mono text-champagne hover:underline inline-block pt-2">
            Ir al inicio →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-10 px-4 sm:px-6 flex flex-col justify-center items-center relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-brand-600/10 blur-[140px] pointer-events-none rounded-full" />

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center z-10">
        <div className="text-left space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-xs text-purple-300 font-mono">
                <Gift className="w-3.5 h-3.5 text-champagne" />
                Primer Sello de Bienvenida de Regalo
              </div>
              {referralCode && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-champagne/10 border border-champagne/30 text-[11px] text-champagne font-mono">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span>Invitación VIP · Código: {referralCode}</span>
                </div>
              )}
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Únete al Club de Lealtad de{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-champagne-light">
                {merchant.name}
              </span>
            </h1>
            <p className="text-sm text-zinc-400 mt-2">
              Sin descargar aplicaciones. Tu tarjeta de lealtad vive de forma nativa en tu Apple Wallet o Google Wallet.
            </p>
          </div>

          {!isRegistered ? (
            <form
              onSubmit={handleSubmit}
              className="space-y-4 bg-surface-200/90 border border-white/10 rounded-xl p-6 shadow-doppelrand"
            >
              <div>
                <label htmlFor="join-full-name" className="text-xs font-mono text-zinc-300 block mb-1">
                  Nombre Completo *
                </label>
                <input
                  id="join-full-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej: Sofía Herrera"
                  className="w-full bg-surface-100 border border-white/10 rounded px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label htmlFor="join-phone" className="text-xs font-mono text-zinc-300 block mb-1">
                  WhatsApp / Móvil *
                </label>
                <input
                  id="join-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="300 123 4567"
                  className="w-full bg-surface-100 border border-white/10 rounded px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                />
                <span className="text-[10px] text-zinc-500 block mt-1">
                  Te avisaremos sobre sellos y recompensas ganadas.
                </span>
              </div>

              <div>
                <label htmlFor="join-birthdate" className="text-xs font-mono text-zinc-300 block mb-1">
                  Fecha de Cumpleaños (Opcional)
                </label>
                <input
                  id="join-birthdate"
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  className="w-full bg-surface-100 border border-white/10 rounded px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <span className="text-xs font-mono text-zinc-300 block mb-1.5">
                  Billetera Móvil
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPassType('google')}
                    className={`py-2 px-3 rounded-lg border text-xs font-mono flex items-center justify-center gap-2 transition-all ${
                      selectedPassType === 'google'
                        ? 'bg-brand-500/20 border-brand-400 text-white font-bold'
                        : 'bg-surface-100 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <GoogleColorIcon className="w-4 h-4" />
                    <span>Google Wallet</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPassType('apple')}
                    className={`py-2 px-3 rounded-lg border text-xs font-mono flex items-center justify-center gap-2 transition-all ${
                      selectedPassType === 'apple'
                        ? 'bg-brand-500/20 border-brand-400 text-white font-bold'
                        : 'bg-surface-100 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-champagne" />
                    <span>Apple Wallet</span>
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  id="terms"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 accent-brand-500"
                />
                <label htmlFor="terms" className="text-[11px] text-zinc-400 leading-relaxed">
                  Acepto los{' '}
                  <Link href="/terms" className="text-champagne hover:underline">
                    términos del programa
                  </Link>{' '}
                  y el{' '}
                  <Link href="/privacy" className="text-champagne hover:underline">
                    tratamiento de mis datos personales (Ley 1581)
                  </Link>
                  .
                </label>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isSubmitting}
                disabled={!termsAccepted || isSubmitting}
                className="w-full mt-2"
              >
                <Sparkles className="w-4 h-4 mr-2 text-champagne" />
                Crear Mi Tarjeta Digital en 10s
              </Button>
            </form>
          ) : (
            <div className="space-y-4 bg-surface-200/90 border border-emerald-500/30 rounded-xl p-6 shadow-glow-purple">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-6 h-6 shrink-0" />
                <h3 className="text-base font-bold text-white">¡Tarjeta Creada Exitosamente!</h3>
              </div>
              <p className="text-xs text-zinc-300">
                Tu tarjeta ya tiene <strong>1 sello de bienvenida acumulado</strong>. Añádela a tu teléfono para recibir alertas de sellos y promociones exclusivas.
              </p>

              <div className="pt-2 space-y-2.5">
                {(registeredData?.passType === 'apple' || isIosDevice) && (
                  <button
                    type="button"
                    onClick={async () => {
                      const serial = registeredData?.serialNumber || '';
                      const res = await fetch(
                        `/api/v1/wallet/apple/download?serial=${encodeURIComponent(serial)}`
                      );
                      if (!res.ok) {
                        const err = (await res.json().catch(() => ({}))) as { message?: string };
                        toast.error('Apple Wallet pendiente de certificados', {
                          description: err.message || 'Configura los certificados Apple en el servidor.',
                        });
                        return;
                      }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${serial}.pkpass`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                      toast.success('Archivo .pkpass listo para Apple Wallet');
                    }}
                    className="w-full bg-zinc-950 hover:bg-zinc-900 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 shadow-lg transition-all active:scale-[0.98] border border-white/25"
                  >
                    <Download className="w-5 h-5 text-champagne shrink-0" />
                    <span className="text-sm font-semibold tracking-tight">
                      Añadir a Apple Wallet (.pkpass)
                    </span>
                  </button>
                )}

                {(registeredData?.passType === 'google' || !isIosDevice) && (
                  <button
                    type="button"
                    onClick={async () => {
                      const serial = registeredData?.serialNumber || '';
                      toast.info('Obteniendo pase oficial firmado de Google Wallet...');
                      try {
                        const res = await fetch('/api/v1/wallet/google/save-url', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ serialNumber: serial }),
                        });
                        const data = await res.json();
                        if (res.ok && data.saveUrl) {
                          window.open(data.saveUrl, '_blank', 'noopener,noreferrer');
                        } else {
                          toast.error('Google Wallet no disponible', {
                            description: data.message || 'Verifica configuración del servidor.',
                          });
                        }
                      } catch {
                        toast.error('Error conectando con Google Wallet');
                      }
                    }}
                    className="w-full bg-white hover:bg-zinc-100 text-zinc-950 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] border border-white/20"
                  >
                    <GoogleColorIcon className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-semibold tracking-tight">Agregar a Google Wallet</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsRegistered(false)}
                  className="w-full text-xs text-zinc-500 hover:text-zinc-300 text-center block pt-2"
                >
                  Registrar otro cliente
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <LivePassPreview
            merchantName={merchant.name}
            customerName={registeredData?.customerName || fullName || 'Tu Nombre VIP'}
            passSerialNumber={registeredData?.serialNumber || 'PASS-PREVIEW-001'}
            currentStamps={registeredData?.currentStamps || 1}
            totalNeeded={merchant.stamps_needed}
            rewardDescription={merchant.reward_description}
            passType={registeredData?.passType ?? selectedPassType}
            brandColor={merchant.brand_color}
            loyaltyTier={registeredData?.loyaltyTier || 'bronze'}
            loyaltyProgramMode={merchant.loyalty_program_mode}
            cardMorphology={merchant.card_morphology}
            cardGradient={merchant.card_gradient}
            rewardMilestones={merchant.reward_milestones}
            cardPattern={merchant.card_pattern}
            showEmvChip={merchant.show_emv_chip}
            showHologram={merchant.show_hologram}
          />
        </div>
      </div>
    </div>
  );
}
