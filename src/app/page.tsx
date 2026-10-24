'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Sparkles, 
  Smartphone, 
  CheckCircle2, 
  Gift, 
  ShieldCheck, 
  ArrowRight,
  Download,
  Lock,
  QrCode,
  Maximize2,
  X,
  Copy,
  Bell,
  MessageSquare,
  Search,
  RefreshCw,
  Share2
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
  generateWhatsAppPassLink 
} from '@/lib/pwa/pwa-helper';
import { getStore, calculateCustomerTier } from '@/lib/store/fidelizia-store';
import { getSessionManager } from '@/lib/store/auth-session';
import { AdminLogin } from '@/components/dashboard/AdminLogin';
import { UnifiedDashboard } from '@/components/dashboard/UnifiedDashboard';
import { PosScanWorkspace } from '@/components/scanner/PosScanWorkspace';
import { soundEngine } from '@/lib/audio/sound-effects';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

function GoogleColorIcon({ className = "w-5 h-5" }: { className?: string }) {
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

export default function HomePage() {
  const store = getStore();
  const sessionManager = getSessionManager();

  const [hash, setHash] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);
  const [session, setSession] = useState(sessionManager.getSession());

  // Modo del Formulario: 'create' (nuevo) o 'recover' (ya tengo tarjeta)
  const [formMode, setFormMode] = useState<'create' | 'recover'>('create');
  const [recoverPhone, setRecoverPhone] = useState('');

  // Estado del Formulario de Onboarding Cliente (Inicia Limpio y Genérico)
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [selectedPassType, setSelectedPassType] = useState<'apple' | 'google'>('google');

  const [isRegistered, setIsRegistered] = useState(false);
  const [showMobilePassModal, setShowMobilePassModal] = useState(false);
  const [showGoogleWalletModal, setShowGoogleWalletModal] = useState(false);
  const [showSaveToPhoneModal, setShowSaveToPhoneModal] = useState(false);
  const [registeredData, setRegisteredData] = useState<{
    customerName: string;
    serialNumber: string;
    currentStamps: number;
  } | null>(null);

  // Estado para el Modal de Premio Desbloqueado en Vivo
  const [showPrizeUnlockedModal, setShowPrizeUnlockedModal] = useState(false);
  const [unlockedPrizeData, setUnlockedPrizeData] = useState<{
    reward: string;
    stamps: number;
  } | null>(null);
  const [hasAlertedPrize, setHasAlertedPrize] = useState(false);

  // Escuchar Hash en URL (#/dsb o #/admin) e inicializar PWA Local-First
  useEffect(() => {
    setIsMounted(true);

    // 1. Inicializar Service Worker para PWA y Notificaciones Push
    registerServiceWorker();

    // 2. Local-First: Verificar si hay una tarjeta guardada en este teléfono o en la URL
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlSerial = searchParams.get('serial');
      const activeSerial = urlSerial || getActivePassSerial();

      if (activeSerial) {
        const foundPass = store.passes.find((p) => p.pass_serial_number === activeSerial);
        if (foundPass) {
          const customer = store.customers.find((c) => c.id === foundPass.customer_id);
          if (customer) {
            setRegisteredData({
              customerName: customer.full_name,
              serialNumber: foundPass.pass_serial_number,
              currentStamps: foundPass.current_stamps || 1,
            });
            setIsRegistered(true);
            saveActivePassSerial(foundPass.pass_serial_number);
          }
        }
      }
    } catch (err) {
      console.warn('Error reading stored pass:', err);
    }

    const handleHashChange = () => {
      setHash(window.location.hash);
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    const unsubSession = sessionManager.subscribe(() => {
      setSession(sessionManager.getSession());
    });

    // Billetera Oficial Configurada: Google Wallet
    setSelectedPassType('google');

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      unsubSession();
    };
  }, [sessionManager, store]);

  // Sincronización Reactiva en Tiempo Real de Sellos y Premios (Polling cada 2.5s)
  useEffect(() => {
    const serial = registeredData?.serialNumber || getActivePassSerial();
    if (!serial) return;

    let isSubscribed = true;

    const checkPassStatus = async () => {
      try {
        const res = await fetch(`/api/v1/passes/status?serial=${encodeURIComponent(serial)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();

        if (!isSubscribed) return;

        // 1. Detección de Aumento de Sellos en Vivo
        if (registeredData && data.currentStamps > registeredData.currentStamps) {
          soundEngine.playStampEarned();
          if (typeof window !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate([80, 40, 80]); } catch {}
          }
          toast.success(`☕ ¡Nuevo sello registrado!`, {
            description: `Llevas ${data.currentStamps}/${data.stampsNeeded} sellos acumulados en Café Canelo.`,
          });
          setRegisteredData((prev) => prev ? { ...prev, currentStamps: data.currentStamps } : null);
        }

        // 2. Detección de Premio Desbloqueado en Vivo
        if (data.rewardUnlocked) {
          if (!hasAlertedPrize) {
            setHasAlertedPrize(true);
            setUnlockedPrizeData({
              reward: data.rewardDescription,
              stamps: data.stampsNeeded,
            });
            setShowPrizeUnlockedModal(true);
          }
        } else {
          // Si los sellos fueron canjeados o bajaron de la meta, resetear bandera
          if (hasAlertedPrize) {
            setHasAlertedPrize(false);
          }
        }
      } catch (err) {
        console.debug('Error in pass polling:', err);
      }
    };

    const interval = setInterval(checkPassStatus, 2500);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [registeredData, hasAlertedPrize]);

  // Si el usuario navegó a /#/scan -> Mostrar Escáner POS de Caja
  if (isMounted && hash === '#/scan') {
    return <PosScanWorkspace />;
  }

  // Si el usuario navegó a /#/dsb o /#/admin -> Mostrar Login / Dashboard Táctico
  if (isMounted && (hash === '#/dsb' || hash === '#/admin')) {
    if (!session.isAuthenticated) {
      return <AdminLogin onLoginSuccess={() => setSession(sessionManager.getSession())} />;
    }
    return <UnifiedDashboard />;
  }

  // Submit del Formulario de Registro Cliente (Nuevo Miembro)
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim() || fullName.length < 3) {
      toast.error('Ingresa tu nombre completo');
      return;
    }

    if (!phone.trim() || phone.length < 8) {
      toast.error('Ingresa un número de WhatsApp válido');
      return;
    }

    const formattedPhone = phone.startsWith('+') ? phone : `+57${phone.replace(/\D/g, '')}`;

    try {
      const { customer, pass } = store.registerCustomer({
        fullName: fullName.trim(),
        phone: formattedPhone,
        birthdate: birthdate || null,
        passType: selectedPassType,
      });

      // Sincronizar en la base de datos central del servidor para que el POS lo reconozca
      fetch('/api/v1/customers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: customer.full_name,
          phone: formattedPhone,
          birthdate: birthdate || null,
          passType: selectedPassType,
          serialNumber: pass.pass_serial_number,
        }),
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            if (data.pass?.pass_serial_number && data.pass.pass_serial_number !== pass.pass_serial_number) {
              saveActivePassSerial(data.pass.pass_serial_number);
              setRegisteredData((prev) => prev ? { ...prev, serialNumber: data.pass.pass_serial_number } : prev);
            }
          }
        })
        .catch((e) => console.debug('Sync register error:', e));

      // Anclar la tarjeta de forma permanente en este teléfono
      saveActivePassSerial(pass.pass_serial_number);

      setRegisteredData({
        customerName: customer.full_name,
        serialNumber: pass.pass_serial_number,
        currentStamps: pass.current_stamps || 1,
      });

      setIsRegistered(true);
      soundEngine.playRedeemCelebration();

      // Fanfarria visual de confeti
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#8b5cf6', '#d4a373', '#10b981'],
      });

      toast.success('¡Tarjeta digital anclada a tu teléfono!', {
        description: 'Hemos guardado tu tarjeta y sumado tu primer sello de cortesía.',
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar cliente');
    }
  };

  // Submit de Recuperación de Tarjeta Existente por WhatsApp
  const handleRecoverSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!recoverPhone.trim()) {
      toast.error('Ingresa tu número de WhatsApp registrado');
      return;
    }

    const cleanInput = recoverPhone.replace(/\D/g, '');
    const foundCustomer = store.customers.find((c) => {
      const cleanCustomerPhone = c.phone.replace(/\D/g, '');
      return cleanCustomerPhone.includes(cleanInput) || cleanInput.includes(cleanCustomerPhone);
    });

    if (!foundCustomer) {
      toast.error('No encontramos ninguna tarjeta activa con ese número', {
        description: 'Verifica tu número o regístrate en la pestaña "Nuevo Miembro".',
      });
      return;
    }

    const customerPass = store.passes.find((p) => p.customer_id === foundCustomer.id) || store.passes[0];
    
    // Guardar para futuros accesos
    saveActivePassSerial(customerPass.pass_serial_number);

    setRegisteredData({
      customerName: foundCustomer.full_name,
      serialNumber: customerPass.pass_serial_number,
      currentStamps: customerPass.current_stamps || 1,
    });

    setIsRegistered(true);
    soundEngine.playRedeemCelebration();

    toast.success(`¡Bienvenido de vuelta, ${foundCustomer.full_name}!`, {
      description: 'Tu tarjeta ha sido cargada y anclada a este teléfono.',
    });
  };

  // Desconectar o Cambiar de Cuenta
  const handleSwitchAccount = () => {
    clearActivePassSerial();
    setIsRegistered(false);
    setRegisteredData(null);
    setFormMode('create');
    toast.info('Sesión cerrada en este dispositivo. Puedes registrar o abrir otra tarjeta.');
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col justify-between text-left">
      {/* Luz Ambiental de Fondo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-brand-600/15 blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[300px] bg-champagne/10 blur-[130px] pointer-events-none rounded-full" />

      {/* Header Superior Limpio con Identidad del Negocio */}
      <header className="border-b border-white/[0.08] bg-surface-200/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-800 flex items-center justify-center shadow-glow-purple border border-brand-400/30">
              <Sparkles className="w-4 h-4 text-champagne" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                {store.merchant.name}
              </span>
              <span className="text-[10px] text-zinc-400 font-mono block">Club de Lealtad Digital</span>
            </div>
          </div>
        </div>
      </header>

      {/* CUERPO PRINCIPAL: FORMULARIO DE ALTA Y PREVIEW DE LA TARJETA EN VIVO */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* COLUMNA IZQUIERDA: Formulario de Registro o Descarga del Pase */}
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
                {/* Tabs: Nuevo Miembro vs Ya Tengo Tarjeta */}
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
                  <form onSubmit={handleRegisterSubmit} className="space-y-4 bg-surface-200/90 border border-white/10 rounded-2xl p-6 sm:p-7 shadow-doppelrand">
                    <div>
                      <label className="text-xs font-mono text-zinc-300 block mb-1">Nombre Completo *</label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ej: Carlos Mendoza"
                        className="w-full bg-surface-100 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-mono text-zinc-300 block mb-1">WhatsApp / Móvil *</label>
                      <input
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
                      <label className="text-xs font-mono text-zinc-300 block mb-1">Fecha de Cumpleaños (Opcional)</label>
                      <input
                        type="date"
                        value={birthdate}
                        onChange={(e) => setBirthdate(e.target.value)}
                        className="w-full bg-surface-100 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="flex items-start gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="terms"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-1 accent-brand-500"
                      />
                      <label htmlFor="terms" className="text-[11px] text-zinc-400">
                        Acepto los términos del programa de lealtad y el tratamiento de datos personales conforme a la Ley 1581.
                      </label>
                    </div>

                    <Button type="submit" variant="primary" size="lg" className="w-full mt-2 font-semibold">
                      <Sparkles className="w-4 h-4 mr-2 text-champagne" />
                      Obtener Mi Tarjeta Digital en 10s
                    </Button>
                  </form>
                ) : (
                  /* FORMULARIO DE RECUPERACIÓN RÁPIDA DE TARJETA CON WHATSAPP */
                  <form onSubmit={handleRecoverSubmit} className="space-y-4 bg-surface-200/90 border border-white/10 rounded-2xl p-6 sm:p-7 shadow-doppelrand animate-in fade-in duration-200">
                    <div>
                      <span className="text-sm font-bold text-white block mb-1">
                        Encuentra y Abre tu Tarjeta Existente
                      </span>
                      <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                        Ingresa el número de WhatsApp con el que te registraste. Cargaremos tu tarjeta de inmediato con todos tus sellos y rango guardados.
                      </p>
                      <label className="text-xs font-mono text-zinc-300 block mb-1">
                        Tu WhatsApp Registrado *
                      </label>
                      <input
                        type="tel"
                        required
                        value={recoverPhone}
                        onChange={(e) => setRecoverPhone(e.target.value)}
                        placeholder="Ej: 300 123 4567"
                        className="w-full bg-surface-100 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <Button type="submit" variant="primary" size="lg" className="w-full font-semibold">
                      <Search className="w-4 h-4 mr-2" />
                      Buscar y Cargar Mi Tarjeta
                    </Button>
                  </form>
                )}
              </div>
            ) : (
              /* ESTADO POST-REGISTRO EXITOSO / TARJETA ACTIVA EN EL TELÉFONO */
              <div className="space-y-4 bg-surface-200/95 border border-emerald-500/30 rounded-2xl p-6 sm:p-7 shadow-glow-purple animate-in fade-in duration-300">
                {/* Badge de Tarjeta Anclada y Opción de Cambio */}
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
                  {/* Botón Oficial Google Wallet con los 4 Colores */}
                  <button
                    type="button"
                    onClick={() => setShowGoogleWalletModal(true)}
                    className="w-full bg-white hover:bg-zinc-100 text-zinc-950 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] border border-white/20"
                  >
                    <GoogleColorIcon className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-semibold tracking-tight">Agregar a Google Wallet</span>
                  </button>

                  {/* Botón para Abrir la Tarjeta en Pantalla Completa Móvil */}
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => setShowMobilePassModal(true)}
                    className="w-full bg-surface-100 hover:bg-surface-50 border border-white/10 text-white font-medium py-2.5 text-xs flex items-center justify-center gap-2"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Ver en Pantalla Completa (Presentar en Caja)</span>
                  </Button>

                  {/* Respaldo Discreto en WhatsApp */}
                  <button
                    type="button"
                    onClick={() => {
                      const link = generateWhatsAppPassLink(
                        store.merchant.name, 
                        registeredData?.customerName || 'Cliente VIP', 
                        registeredData?.serialNumber || 'PASS-CANELO-001'
                      );
                      window.open(link, '_blank');
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

          {/* COLUMNA DERECHA: Renderizado de la Tarjeta en Tiempo Real con su QR y Sellos */}
          <div className="flex flex-col items-center justify-center">
            {(() => {
              const serial = registeredData?.serialNumber || 'PASS-CANELO-001';
              const pass = store.passes.find((p) => p.pass_serial_number === serial);
              const customer = pass ? store.customers.find((c) => c.id === pass.customer_id) : (registeredData ? null : store.customers[0]);
              // Un cliente recién registrado arranca en 'bronze', o el rango que le corresponda
              const tier = registeredData 
                ? 'bronze' 
                : (customer?.loyalty_tier || calculateCustomerTier(pass?.total_rewards_redeemed || 0, store.merchant.tier_config));

              return (
                <LivePassPreview
                  merchantName={store.merchant.name}
                  customerName={registeredData?.customerName || fullName || 'Carlos Mendoza'}
                  passSerialNumber={serial}
                  currentStamps={registeredData?.currentStamps || (customer ? (pass?.current_stamps || 1) : 1)}
                  totalNeeded={store.merchant.stamps_needed}
                  rewardDescription={store.merchant.reward_description}
                  passType={selectedPassType}
                  brandColor={store.merchant.brand_color}
                  loyaltyTier={tier}
                  totalRewardsRedeemed={registeredData ? 0 : (pass?.total_rewards_redeemed || 0)}
                  customReward={registeredData ? null : (customer?.custom_reward || null)}
                  discountPercentage={registeredData ? null : (customer?.discount_percentage || null)}
                  loyaltyProgramMode={store.merchant.loyalty_program_mode}
                  cardMorphology={store.merchant.card_morphology}
                  cardGradient={store.merchant.card_gradient}
                  rewardMilestones={store.merchant.reward_milestones}
                  cardPattern={store.merchant.card_pattern}
                  showEmvChip={store.merchant.show_emv_chip}
                  showHologram={store.merchant.show_hologram}
                />
              );
            })()}
          </div>
        </div>
      </main>

      {/* MODAL INMERSIVO DE PASE EN PANTALLA COMPLETA PARA MÓVILES */}
      {showMobilePassModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm relative">
            <button
              onClick={() => setShowMobilePassModal(false)}
              className="absolute -top-12 right-0 p-2 text-zinc-400 hover:text-white bg-white/10 rounded-full"
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
            {(() => {
              const serial = registeredData?.serialNumber || 'PASS-CANELO-001';
              const pass = store.passes.find((p) => p.pass_serial_number === serial);
              const customer = pass ? store.customers.find((c) => c.id === pass.customer_id) : (registeredData ? null : store.customers[0]);
              const tier = registeredData 
                ? 'bronze' 
                : (customer?.loyalty_tier || calculateCustomerTier(pass?.total_rewards_redeemed || 0, store.merchant.tier_config));

              return (
                <LivePassPreview
                  merchantName={store.merchant.name}
                  customerName={registeredData?.customerName || fullName || 'Carlos Mendoza'}
                  passSerialNumber={serial}
                  currentStamps={registeredData?.currentStamps || (customer ? (pass?.current_stamps || 1) : 1)}
                  totalNeeded={store.merchant.stamps_needed}
                  rewardDescription={store.merchant.reward_description}
                  passType={selectedPassType}
                  brandColor={store.merchant.brand_color}
                  loyaltyTier={tier}
                  totalRewardsRedeemed={registeredData ? 0 : (pass?.total_rewards_redeemed || 0)}
                  customReward={registeredData ? null : (customer?.custom_reward || null)}
                  discountPercentage={registeredData ? null : (customer?.discount_percentage || null)}
                  loyaltyProgramMode={store.merchant.loyalty_program_mode}
                  cardMorphology={store.merchant.card_morphology}
                  cardGradient={store.merchant.card_gradient}
                  rewardMilestones={store.merchant.reward_milestones}
                  cardPattern={store.merchant.card_pattern}
                  showEmvChip={store.merchant.show_emv_chip}
                  showHologram={store.merchant.show_hologram}
                />
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL OFICIAL / ASISTENTE DE GOOGLE WALLET */}
      <GoogleWalletSaveModal
        isOpen={showGoogleWalletModal}
        onClose={() => setShowGoogleWalletModal(false)}
        customerName={registeredData?.customerName || fullName || 'Carlos Mendoza'}
        serialNumber={registeredData?.serialNumber || 'PASS-CANELO-001'}
        currentStamps={registeredData?.currentStamps || 1}
        totalNeeded={store.merchant.stamps_needed}
        tierName="BRONCE"
        onOpenFullScreenPass={() => setShowMobilePassModal(true)}
      />

      {/* MODAL DE GUARDADO EN PANTALLA DE INICIO & NOTIFICACIONES PUSH */}
      <SavePassToPhoneModal
        isOpen={showSaveToPhoneModal}
        onClose={() => setShowSaveToPhoneModal(false)}
        customerName={registeredData?.customerName || fullName || 'Carlos Mendoza'}
        serialNumber={registeredData?.serialNumber || 'PASS-CANELO-001'}
        merchantName={store.merchant.name}
      />

      {/* MODAL DE PREMIO DESBLOQUEADO EN VIVO */}
      <PremioDesbloqueadoModal
        isOpen={showPrizeUnlockedModal}
        onClose={() => setShowPrizeUnlockedModal(false)}
        customerName={registeredData?.customerName || fullName || 'Cliente'}
        serialNumber={registeredData?.serialNumber || 'PASS-CANELO-001'}
        rewardDescription={unlockedPrizeData?.reward || store.merchant.reward_description}
        stampsCount={unlockedPrizeData?.stamps || store.merchant.stamps_needed}
        merchantName={store.merchant.name}
        onOpenMobilePass={() => setShowMobilePassModal(true)}
      />

      {/* Footer Minimalista 100% Comercial y Limpio (Sin accesos al DSB) */}
      <footer className="border-t border-white/[0.06] bg-black/40 py-4 text-center text-xs text-zinc-500 font-mono">
        <p>
          Café Canelo & Specialty Roasters · Club de Lealtad Digital · Google Wallet & Apple Wallet
        </p>
      </footer>
    </div>
  );
}
