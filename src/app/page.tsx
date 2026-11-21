'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  CheckCircle2,
  Gift,
  Maximize2,
  X,
  MessageSquare,
  Search,
  Download,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LivePassPreview } from '@/components/passes/LivePassPreview';
import { GoogleWalletSaveModal } from '@/components/passes/GoogleWalletSaveModal';
import { SavePassToPhoneModal } from '@/components/passes/SavePassToPhoneModal';
import { PremioDesbloqueadoModal } from '@/components/passes/PremioDesbloqueadoModal';
import {
  registerServiceWorker,
  saveActivePassSerial,
  getActivePassSerial,
  clearActivePassSerial,
  generateWhatsAppPassLink,
} from '@/lib/pwa/pwa-helper';
import { INITIAL_MERCHANT } from '@/lib/store/fidelizia-store';
import { getSessionManager } from '@/lib/store/auth-session';
import { AdminLogin } from '@/components/dashboard/AdminLogin';
import { UnifiedDashboard } from '@/components/dashboard/UnifiedDashboard';
import { PosScanWorkspace } from '@/components/scanner/PosScanWorkspace';
import { soundEngine } from '@/lib/audio/sound-effects';
import type { LoyaltyTier, Merchant } from '@/types/domain';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

interface RegisteredCardState {
  customerName: string;
  serialNumber: string;
  currentStamps: number;
  stampsNeeded: number;
  passType: 'apple' | 'google';
  loyaltyTier: LoyaltyTier;
  totalRewardsRedeemed: number;
  customReward: string | null;
  discountPercentage: number | null;
}

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
  const digits = trimmed.replace(/\D/g, '');
  return `+57${digits}`;
}

export default function HomePage() {
  const sessionManager = getSessionManager();

  const [merchant, setMerchant] = useState<Merchant>(INITIAL_MERCHANT);
  const [hash, setHash] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);
  const [session, setSession] = useState(sessionManager.getSession());
  const [isIosDevice, setIsIosDevice] = useState(false);

  const [formMode, setFormMode] = useState<'create' | 'recover'>('create');
  const [recoverPhone, setRecoverPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [selectedPassType, setSelectedPassType] = useState<'apple' | 'google'>('google');

  const [isRegistered, setIsRegistered] = useState(false);
  const [showMobilePassModal, setShowMobilePassModal] = useState(false);
  const [showGoogleWalletModal, setShowGoogleWalletModal] = useState(false);
  const [showSaveToPhoneModal, setShowSaveToPhoneModal] = useState(false);
  const [registeredData, setRegisteredData] = useState<RegisteredCardState | null>(null);

  const [showPrizeUnlockedModal, setShowPrizeUnlockedModal] = useState(false);
  const [unlockedPrizeData, setUnlockedPrizeData] = useState<{
    reward: string;
    stamps: number;
  } | null>(null);
  const hasAlertedPrizeRef = useRef(false);
  const registeredDataRef = useRef<RegisteredCardState | null>(null);

  useEffect(() => {
    registeredDataRef.current = registeredData;
  }, [registeredData]);

  useEffect(() => {
    setIsMounted(true);
    registerServiceWorker();

    const iosDetected =
      typeof navigator !== 'undefined' &&
      /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    setIsIosDevice(iosDetected);
    setSelectedPassType(iosDetected ? 'apple' : 'google');

    const controller = new AbortController();

    fetch('/api/v1/merchant/settings?slug=cafe-canelo', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.merchant) {
          setMerchant(data.merchant as Merchant);
        }
      })
      .catch(() => {
        // Ignore abort / network errors on initial public config load
      });

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlSerial = searchParams.get('serial');
      const activeSerial = urlSerial || getActivePassSerial();

      if (activeSerial) {
        fetch(`/api/v1/passes/status?serial=${encodeURIComponent(activeSerial)}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (!data?.serial) return;
            setRegisteredData({
              customerName: data.customerName,
              serialNumber: data.serial,
              currentStamps: data.currentStamps ?? 1,
              stampsNeeded: data.stampsNeeded ?? 10,
              passType: data.passType === 'apple' ? 'apple' : 'google',
              loyaltyTier: (data.loyaltyTier as LoyaltyTier) || 'bronze',
              totalRewardsRedeemed: data.totalRewardsRedeemed ?? 0,
              customReward: data.customReward ?? null,
              discountPercentage: data.discountPercentage ?? null,
            });
            setSelectedPassType(data.passType === 'apple' ? 'apple' : 'google');
            setIsRegistered(true);
            saveActivePassSerial(data.serial);
          })
          .catch(() => {
            // Keep clean onboarding form if serial no longer exists
          });
      }
    } catch {
      // Ignore storage errors
    }

    const handleHashChange = () => {
      setHash(window.location.hash);
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    const unsubSession = sessionManager.subscribe(() => {
      setSession(sessionManager.getSession());
    });

    return () => {
      controller.abort();
      window.removeEventListener('hashchange', handleHashChange);
      unsubSession();
    };
  }, [sessionManager]);

  const activeSerial = registeredData?.serialNumber || null;

  useEffect(() => {
    if (!activeSerial) return;

    let isSubscribed = true;
    let activeAbort: AbortController | null = null;

    const checkPassStatus = async () => {
      activeAbort?.abort();
      activeAbort = new AbortController();
      try {
        const res = await fetch(
          `/api/v1/passes/status?serial=${encodeURIComponent(activeSerial)}`,
          { cache: 'no-store', signal: activeAbort.signal }
        );
        if (!res.ok || !isSubscribed) return;
        const data = await res.json();
        if (!isSubscribed) return;

        const currentState = registeredDataRef.current;
        if (currentState && data.currentStamps > currentState.currentStamps) {
          soundEngine.playStampEarned();
          if (typeof window !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate([80, 40, 80]);
            } catch {
              // ignore
            }
          }
          toast.success('¡Nuevo sello registrado!', {
            description: `Llevas ${data.currentStamps}/${data.stampsNeeded} sellos acumulados en ${data.merchantName || merchant.name}.`,
          });
        }

        setRegisteredData((prev) =>
          prev
            ? {
                ...prev,
                currentStamps: data.currentStamps ?? prev.currentStamps,
                stampsNeeded: data.stampsNeeded ?? prev.stampsNeeded,
                loyaltyTier: (data.loyaltyTier as LoyaltyTier) || prev.loyaltyTier,
                totalRewardsRedeemed: data.totalRewardsRedeemed ?? prev.totalRewardsRedeemed,
                customReward: data.customReward ?? prev.customReward,
                discountPercentage: data.discountPercentage ?? prev.discountPercentage,
              }
            : prev
        );

        if (data.rewardUnlocked) {
          if (!hasAlertedPrizeRef.current) {
            hasAlertedPrizeRef.current = true;
            setUnlockedPrizeData({
              reward: data.rewardDescription,
              stamps: data.stampsNeeded,
            });
            setShowPrizeUnlockedModal(true);
          }
        } else {
          hasAlertedPrizeRef.current = false;
        }
      } catch {
        // Ignore polling errors / aborts
      }
    };

    const interval = setInterval(() => {
      void checkPassStatus();
    }, 3000);

    return () => {
      isSubscribed = false;
      activeAbort?.abort();
      clearInterval(interval);
    };
  }, [activeSerial, merchant.name]);

  if (isMounted && hash === '#/scan') {
    return <PosScanWorkspace merchantSlug={merchant.slug} />;
  }

  if (isMounted && (hash === '#/dsb' || hash === '#/admin')) {
    if (!session.isAuthenticated) {
      return <AdminLogin onLoginSuccess={() => setSession(sessionManager.getSession())} />;
    }
    return <UnifiedDashboard />;
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!termsAccepted) {
      toast.error('Debes aceptar los términos y la política de privacidad para continuar');
      return;
    }

    if (!fullName.trim() || fullName.trim().length < 3) {
      toast.error('Ingresa tu nombre completo (mínimo 3 caracteres)');
      return;
    }

    if (!phone.trim() || phone.replace(/\D/g, '').length < 7) {
      toast.error('Ingresa un número de WhatsApp válido');
      return;
    }

    const formattedPhone = normalizePhoneE164(phone);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/v1/customers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: formattedPhone,
          birthdate: birthdate || null,
          passType: selectedPassType,
          merchantSlug: merchant.slug,
          termsAccepted: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error('No se pudo crear tu tarjeta', {
          description: data.message || 'Verifica los datos ingresados e intenta de nuevo.',
        });
        return;
      }

      const serial = data.pass.pass_serial_number as string;
      saveActivePassSerial(serial);

      setRegisteredData({
        customerName: data.customer.full_name,
        serialNumber: serial,
        currentStamps: data.pass.current_stamps ?? 1,
        stampsNeeded: data.merchant?.stamps_needed ?? merchant.stamps_needed,
        passType: data.pass.pass_type === 'apple' ? 'apple' : 'google',
        loyaltyTier: (data.customer.loyalty_tier as LoyaltyTier) || 'bronze',
        totalRewardsRedeemed: data.customer.total_rewards_redeemed ?? 0,
        customReward: data.customer.custom_reward ?? null,
        discountPercentage: data.customer.discount_percentage ?? null,
      });

      setIsRegistered(true);
      soundEngine.playRedeemCelebration();

      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#8b5cf6', '#d4a373', '#10b981'],
      });

      toast.success('¡Tarjeta digital anclada a tu teléfono!', {
        description: 'Hemos guardado tu tarjeta y sumado tu primer sello de cortesía.',
      });
    } catch {
      toast.error('Error de conexión al registrar tu tarjeta');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recoverPhone.trim() || recoverPhone.replace(/\D/g, '').length < 7) {
      toast.error('Ingresa tu número de WhatsApp registrado');
      return;
    }

    const formattedPhone = normalizePhoneE164(recoverPhone);
    setIsSubmitting(true);

    try {
      const res = await fetch(
        `/api/v1/passes/status?phone=${encodeURIComponent(formattedPhone)}&merchantSlug=${encodeURIComponent(merchant.slug)}`,
        { cache: 'no-store' }
      );
      const data = await res.json();

      if (!res.ok || !data.serial) {
        toast.error('No encontramos ninguna tarjeta activa con ese número', {
          description: 'Verifica tu número o regístrate en la pestaña "Nuevo Miembro".',
        });
        return;
      }

      saveActivePassSerial(data.serial);
      setSelectedPassType(data.passType === 'apple' ? 'apple' : 'google');
      setRegisteredData({
        customerName: data.customerName,
        serialNumber: data.serial,
        currentStamps: data.currentStamps ?? 1,
        stampsNeeded: data.stampsNeeded ?? merchant.stamps_needed,
        passType: data.passType === 'apple' ? 'apple' : 'google',
        loyaltyTier: (data.loyaltyTier as LoyaltyTier) || 'bronze',
        totalRewardsRedeemed: data.totalRewardsRedeemed ?? 0,
        customReward: data.customReward ?? null,
        discountPercentage: data.discountPercentage ?? null,
      });

      setIsRegistered(true);
      soundEngine.playRedeemCelebration();

      toast.success(`¡Bienvenido de vuelta, ${data.customerName}!`, {
        description: 'Tu tarjeta ha sido cargada y anclada a este teléfono.',
      });
    } catch {
      toast.error('No fue posible consultar tu tarjeta en este momento');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchAccount = () => {
    clearActivePassSerial();
    hasAlertedPrizeRef.current = false;
    setIsRegistered(false);
    setRegisteredData(null);
    setFormMode('create');
    toast.info('Sesión cerrada en este dispositivo. Puedes registrar o abrir otra tarjeta.');
  };

  const handleDownloadApplePass = async () => {
    const serial = registeredData?.serialNumber;
    if (!serial) return;
    try {
      const res = await fetch(`/api/v1/wallet/apple/download?serial=${encodeURIComponent(serial)}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error('Apple Wallet pendiente de certificados', {
          description:
            data.message ||
            'Puedes usar tu tarjeta en pantalla completa o guardarla en pantalla de inicio mientras se cargan los certificados de Apple.',
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
      toast.success('Pase Apple Wallet (.pkpass) descargado');
    } catch {
      toast.error('Error al descargar el pase de Apple Wallet');
    }
  };

  const previewSerial = registeredData?.serialNumber || 'PASS-PREVIEW-001';
  const previewName = registeredData?.customerName || fullName.trim() || 'Tu Nombre VIP';
  const previewStamps = registeredData?.currentStamps ?? 1;
  const previewTier: LoyaltyTier = registeredData?.loyaltyTier || 'bronze';
  const previewRedeemed = registeredData?.totalRewardsRedeemed ?? 0;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col justify-between text-left">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-brand-600/15 blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[300px] bg-champagne/10 blur-[130px] pointer-events-none rounded-full" />

      <header className="border-b border-white/[0.08] bg-surface-200/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-800 flex items-center justify-center shadow-glow-purple border border-brand-400/30">
              <Sparkles className="w-4 h-4 text-champagne" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                {merchant.name}
              </span>
              <span className="text-[10px] text-zinc-400 font-mono block">Club de Lealtad Digital</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 flex flex-col justify-center relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className="space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-xs text-purple-300 font-mono mb-3">
                <Gift className="w-3.5 h-3.5 text-champagne" />
                1 Sello de Bienvenida de Regalo
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                Tu Tarjeta de Lealtad Digital
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 mt-2 leading-relaxed">
                Sin descargar apps pesadas ni cargar cartones. Completa tu registro en 10 segundos y recibe tu tarjeta digital lista para acumular sellos en cada visita.
              </p>
            </div>

            {!isRegistered ? (
              <div className="space-y-4">
                <div className="flex rounded-xl bg-surface-100/90 p-1 border border-white/10">
                  <button
                    type="button"
                    onClick={() => setFormMode('create')}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      formMode === 'create'
                        ? 'bg-brand-600 text-white shadow-sm font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Nuevo Miembro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormMode('recover')}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      formMode === 'recover'
                        ? 'bg-brand-600 text-white shadow-sm font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>¿Ya tienes Tarjeta?</span>
                  </button>
                </div>

                {formMode === 'create' ? (
                  <form
                    onSubmit={handleRegisterSubmit}
                    className="space-y-4 bg-surface-200/90 border border-white/10 rounded-2xl p-6 sm:p-7 shadow-doppelrand"
                  >
                    <div>
                      <label htmlFor="home-full-name" className="text-xs font-mono text-zinc-300 block mb-1">
                        Nombre Completo *
                      </label>
                      <input
                        id="home-full-name"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ej: Sofía Herrera"
                        className="w-full bg-surface-100 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="home-phone" className="text-xs font-mono text-zinc-300 block mb-1">
                        WhatsApp / Móvil *
                      </label>
                      <input
                        id="home-phone"
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="300 123 4567"
                        className="w-full bg-surface-100 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                      />
                      <span className="text-[10px] text-zinc-500 block mt-1">
                        Te notificaremos cuando ganes sellos y reclames recompensas.
                      </span>
                    </div>

                    <div>
                      <label htmlFor="home-birthdate" className="text-xs font-mono text-zinc-300 block mb-1">
                        Fecha de Cumpleaños (Opcional)
                      </label>
                      <input
                        id="home-birthdate"
                        type="date"
                        value={birthdate}
                        onChange={(e) => setBirthdate(e.target.value)}
                        className="w-full bg-surface-100 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div>
                      <span className="text-xs font-mono text-zinc-300 block mb-1.5">
                        Billetera Móvil Preferida
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
                          tratamiento de datos personales (Ley 1581)
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
                      className="w-full mt-2 font-semibold"
                    >
                      <Sparkles className="w-4 h-4 mr-2 text-champagne" />
                      Obtener Mi Tarjeta Digital en 10s
                    </Button>
                  </form>
                ) : (
                  <form
                    onSubmit={handleRecoverSubmit}
                    className="space-y-4 bg-surface-200/90 border border-white/10 rounded-2xl p-6 sm:p-7 shadow-doppelrand animate-in fade-in duration-200"
                  >
                    <div>
                      <span className="text-sm font-bold text-white block mb-1">
                        Encuentra y Abre tu Tarjeta Existente
                      </span>
                      <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                        Ingresa el número de WhatsApp con el que te registraste. Cargaremos tu tarjeta de inmediato con todos tus sellos y rango guardados.
                      </p>
                      <label htmlFor="home-recover-phone" className="text-xs font-mono text-zinc-300 block mb-1">
                        Tu WhatsApp Registrado *
                      </label>
                      <input
                        id="home-recover-phone"
                        type="tel"
                        required
                        value={recoverPhone}
                        onChange={(e) => setRecoverPhone(e.target.value)}
                        placeholder="Ej: 300 123 4567"
                        className="w-full bg-surface-100 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      isLoading={isSubmitting}
                      className="w-full font-semibold"
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Buscar y Cargar Mi Tarjeta
                    </Button>
                  </form>
                )}
              </div>
            ) : (
              <div className="space-y-4 bg-surface-200/95 border border-emerald-500/30 rounded-2xl p-6 sm:p-7 shadow-glow-purple animate-in fade-in duration-300">
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-white block">
                        Tarjeta Activa en este Teléfono
                      </span>
                      <span className="text-[11px] text-zinc-400 font-mono">
                        {registeredData?.customerName} · {registeredData?.serialNumber}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSwitchAccount}
                    className="text-[11px] text-zinc-400 hover:text-white underline font-mono ml-2 shrink-0"
                    title="Cerrar sesión o cambiar de tarjeta"
                  >
                    Cambiar
                  </button>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed">
                  Tu tarjeta está lista para presentar en caja y acumular sellos en cada compra.
                </p>

                <div className="pt-2 space-y-3">
                  {(registeredData?.passType === 'apple' || isIosDevice) && (
                    <button
                      type="button"
                      onClick={handleDownloadApplePass}
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
                      onClick={() => setShowGoogleWalletModal(true)}
                      className="w-full bg-white hover:bg-zinc-100 text-zinc-950 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] border border-white/20"
                    >
                      <GoogleColorIcon className="w-5 h-5 shrink-0" />
                      <span className="text-sm font-semibold tracking-tight">Agregar a Google Wallet</span>
                    </button>
                  )}

                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => setShowMobilePassModal(true)}
                    className="w-full bg-surface-100 hover:bg-surface-50 border border-white/10 text-white font-medium py-2.5 text-xs flex items-center justify-center gap-2"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Ver en Pantalla Completa (Presentar en Caja)</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowSaveToPhoneModal(true)}
                    className="w-full text-xs flex items-center justify-center gap-2"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-brand-400" />
                    <span>Guardar en Pantalla de Inicio</span>
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      const link = generateWhatsAppPassLink(
                        merchant.name,
                        registeredData?.customerName || 'Cliente VIP',
                        registeredData?.serialNumber || ''
                      );
                      window.open(link, '_blank', 'noopener,noreferrer');
                    }}
                    className="w-full py-1 text-center text-xs text-zinc-400 hover:text-emerald-400 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Guardar respaldo en WhatsApp</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center justify-center">
            <LivePassPreview
              merchantName={merchant.name}
              customerName={previewName}
              passSerialNumber={previewSerial}
              currentStamps={previewStamps}
              totalNeeded={registeredData?.stampsNeeded ?? merchant.stamps_needed}
              rewardDescription={merchant.reward_description}
              passType={registeredData?.passType ?? selectedPassType}
              brandColor={merchant.brand_color}
              loyaltyTier={previewTier}
              totalRewardsRedeemed={previewRedeemed}
              customReward={registeredData?.customReward ?? null}
              discountPercentage={registeredData?.discountPercentage ?? null}
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
      </main>

      {showMobilePassModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto custom-scrollbar relative pt-10">
            <button
              type="button"
              onClick={() => setShowMobilePassModal(false)}
              aria-label="Cerrar vista de pantalla completa"
              className="absolute top-0 right-0 p-2 text-zinc-400 hover:text-white bg-white/10 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="mb-3 text-center">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest block">
                Tarjeta de Fidelidad Digital Activa
              </span>
              <span className="text-[11px] text-zinc-500">
                Presenta este código en el mostrador para sumar sellos o canjear
              </span>
            </div>
            <LivePassPreview
              merchantName={merchant.name}
              customerName={previewName}
              passSerialNumber={previewSerial}
              currentStamps={previewStamps}
              totalNeeded={registeredData?.stampsNeeded ?? merchant.stamps_needed}
              rewardDescription={merchant.reward_description}
              passType={registeredData?.passType ?? selectedPassType}
              brandColor={merchant.brand_color}
              loyaltyTier={previewTier}
              totalRewardsRedeemed={previewRedeemed}
              customReward={registeredData?.customReward ?? null}
              discountPercentage={registeredData?.discountPercentage ?? null}
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
      )}

      <GoogleWalletSaveModal
        isOpen={showGoogleWalletModal}
        onClose={() => setShowGoogleWalletModal(false)}
        customerName={previewName}
        serialNumber={previewSerial}
        currentStamps={previewStamps}
        totalNeeded={registeredData?.stampsNeeded ?? merchant.stamps_needed}
        merchantName={merchant.name}
        tierName={previewTier.toUpperCase()}
        onOpenFullScreenPass={() => setShowMobilePassModal(true)}
      />

      <SavePassToPhoneModal
        isOpen={showSaveToPhoneModal}
        onClose={() => setShowSaveToPhoneModal(false)}
        customerName={previewName}
        serialNumber={previewSerial}
        merchantName={merchant.name}
      />

      <PremioDesbloqueadoModal
        isOpen={showPrizeUnlockedModal}
        onClose={() => setShowPrizeUnlockedModal(false)}
        customerName={previewName}
        serialNumber={previewSerial}
        rewardDescription={unlockedPrizeData?.reward || merchant.reward_description}
        stampsCount={unlockedPrizeData?.stamps || merchant.stamps_needed}
        merchantName={merchant.name}
        onOpenMobilePass={() => setShowMobilePassModal(true)}
      />

      <footer className="border-t border-white/[0.06] bg-black/40 py-4 px-4 text-center text-xs text-zinc-500 font-mono relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>{merchant.name} · Club de Lealtad Digital · Google Wallet &amp; Apple Wallet</p>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-zinc-300">
              Términos
            </Link>
            <Link href="/privacy" className="hover:text-zinc-300">
              Privacidad
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
