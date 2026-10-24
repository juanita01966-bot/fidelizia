'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Sparkles, 
  Smartphone, 
  CheckCircle2, 
  Gift, 
  ShieldCheck, 
  ArrowRight,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LivePassPreview } from '@/components/passes/LivePassPreview';
import { getStore } from '@/lib/store/fidelizia-store';
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

export default function JoinPage() {
  const params = useParams();
  const slug = (params.merchantSlug as string) || 'cafe-canelo';
  const store = getStore();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [detectedOS, setDetectedOS] = useState<'apple' | 'google'>('google');
  const [selectedPassType, setSelectedPassType] = useState<'apple' | 'google'>('google');

  const [isRegistered, setIsRegistered] = useState(false);
  const [registeredData, setRegisteredData] = useState<{
    customerName: string;
    serialNumber: string;
    currentStamps: number;
  } | null>(null);

  // Billetera Oficial Configurada: Google Wallet y Sincronización de Merchant
  useEffect(() => {
    setSelectedPassType('google');

    fetch('/api/v1/merchant/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data?.merchant) {
          store.updateMerchantSettings(data.merchant);
        }
      })
      .catch((e) => console.warn('Error fetching merchant settings:', e));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim() || fullName.length < 3) {
      toast.error('Ingresa tu nombre completo');
      return;
    }

    if (!phone.trim() || phone.length < 8) {
      toast.error('Ingresa un número de WhatsApp válido');
      return;
    }

    // Asegurar formato E.164
    const formattedPhone = phone.startsWith('+') ? phone : `+57${phone.replace(/\D/g, '')}`;

    const executeRegistration = async () => {
      try {
        // 1. Petición al backend central conectado a Supabase
        const response = await fetch('/api/v1/customers/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: fullName.trim(),
            phone: formattedPhone,
            birthdate: birthdate || null,
            passType: selectedPassType,
            merchantSlug: slug,
          }),
        });

        let customerData: any;
        let passData: any;

        if (response.ok) {
          const resJson = await response.json();
          customerData = resJson.customer;
          passData = resJson.pass;
          // Sincronizar en el store local del cliente
          store.registerCustomer({
            fullName: customerData.full_name,
            phone: customerData.phone,
            birthdate: customerData.birthdate,
            passType: passData.pass_type,
          });
        } else {
          // Fallback a registro local si el endpoint falla
          const local = store.registerCustomer({
            fullName: fullName.trim(),
            phone: formattedPhone,
            birthdate: birthdate || null,
            passType: selectedPassType,
          });
          customerData = local.customer;
          passData = local.pass;
        }

        setRegisteredData({
          customerName: customerData.full_name,
          serialNumber: passData.pass_serial_number,
          currentStamps: passData.current_stamps || 1,
        });

        setIsRegistered(true);
        soundEngine.playRedeemCelebration();

        // Disparo de confeti de celebración
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#8b5cf6', '#d4a373', '#10b981'],
        });

        toast.success('¡Tarjeta digital generada con éxito!', {
          description: 'Hemos sumado tu primer sello de bienvenida.',
        });
      } catch (err: unknown) {
        // Fallback resiliente
        const local = store.registerCustomer({
          fullName: fullName.trim(),
          phone: formattedPhone,
          birthdate: birthdate || null,
          passType: selectedPassType,
        });

        setRegisteredData({
          customerName: local.customer.full_name,
          serialNumber: local.pass.pass_serial_number,
          currentStamps: local.pass.current_stamps || 1,
        });

        setIsRegistered(true);
        toast.success('¡Tarjeta digital generada con éxito!');
      }
    };

    executeRegistration();
  };

  return (
    <div className="min-h-screen bg-background py-10 px-4 sm:px-6 flex flex-col justify-center items-center relative overflow-hidden">
      {/* Luz Ambiental de Fondo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-brand-600/10 blur-[140px] pointer-events-none rounded-full" />

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center z-10">
        {/* COLUMNA IZQUIERDA: Formulario o Descarga */}
        <div className="text-left space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-xs text-purple-300 font-mono mb-3">
              <Gift className="w-3.5 h-3.5 text-champagne" />
              Primer Sello de Bienvenida de Regalo
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Únete al Club de Lealtad de{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-champagne-light">
                {store.merchant.name}
              </span>
            </h1>
            <p className="text-sm text-zinc-400 mt-2">
              Sin descargar aplicaciones. Tu tarjeta de lealtad vive de forma nativa en tu Apple Wallet o Google Wallet.
            </p>
          </div>

          {!isRegistered ? (
            <form onSubmit={handleSubmit} className="space-y-4 bg-surface-200/90 border border-white/10 rounded-xl p-6 shadow-doppelrand">
              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej: Carlos Mendoza"
                  className="w-full bg-surface-100 border border-white/10 rounded px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
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
                  className="w-full bg-surface-100 border border-white/10 rounded px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                />
                <span className="text-[10px] text-zinc-500 block mt-1">
                  Te avisaremos sobre sellos y recompensas ganadas.
                </span>
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">Fecha de Cumpleaños (Opcional)</label>
                <input
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  className="w-full bg-surface-100 border border-white/10 rounded px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                />
                <span className="text-[10px] text-zinc-500 block mt-1">
                  Recibe un sello de regalo y cortesía el día de tu cumpleaños.
                </span>
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
                  Acepto los términos del programa de lealtad y el tratamiento de mis datos personales según la Ley 1581.
                </label>
              </div>

              <Button type="submit" variant="primary" size="lg" className="w-full mt-2">
                <Sparkles className="w-4 h-4 mr-2 text-champagne" />
                Crear Mi Tarjeta Digital en 10s
              </Button>
            </form>
          ) : (
            /* Pantalla Posterior al Submit */
            <div className="space-y-4 bg-surface-200/90 border border-emerald-500/30 rounded-xl p-6 shadow-glow-purple">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-6 h-6 shrink-0" />
                <h3 className="text-base font-bold text-white">¡Tarjeta Creada Exitosamente!</h3>
              </div>
              <p className="text-xs text-zinc-300">
                Tu tarjeta ya tiene <strong>1 sello de bienvenida acumulado</strong>. Añádela a tu teléfono con un toque para recibir alertas de proximidad y no perderte ningún beneficio.
              </p>

              <div className="pt-2 space-y-2.5">
                <button
                  type="button"
                  onClick={async () => {
                    const serial = registeredData?.serialNumber || 'PASS-CANELO-001';
                    toast.info('Obteniendo pase oficial firmado de Google Wallet...');
                    try {
                      const res = await fetch('/api/v1/wallet/google/save-url', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ serialNumber: serial }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        if (data.saveUrl) {
                          window.open(data.saveUrl, '_blank');
                        }
                      }
                    } catch (e) {
                      console.error(e);
                      window.open(`/api/v1/wallet/google/save-url?serial=${serial}`, '_blank');
                    }
                  }}
                  className="w-full bg-white hover:bg-zinc-100 text-zinc-950 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] border border-white/20"
                >
                  <GoogleColorIcon className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-semibold tracking-tight">Agregar a Google Wallet</span>
                </button>

                <button
                  onClick={() => setIsRegistered(false)}
                  className="w-full text-xs text-zinc-500 hover:text-zinc-300 text-center block pt-2"
                >
                  Registrar otro cliente
                </button>
              </div>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: Previsualización en Vivo de la Tarjeta */}
        <div className="flex justify-center">
          <LivePassPreview
            merchantName={store.merchant.name}
            customerName={registeredData?.customerName || fullName || 'Carlos Mendoza'}
            passSerialNumber={registeredData?.serialNumber || 'PASS-CANELO-001'}
            currentStamps={registeredData?.currentStamps || 1}
            totalNeeded={store.merchant.stamps_needed}
            rewardDescription={store.merchant.reward_description}
            passType={selectedPassType}
            brandColor={store.merchant.brand_color}
            loyaltyProgramMode={store.merchant.loyalty_program_mode}
            cardMorphology={store.merchant.card_morphology}
            cardGradient={store.merchant.card_gradient}
            rewardMilestones={store.merchant.reward_milestones}
            cardPattern={store.merchant.card_pattern}
            showEmvChip={store.merchant.show_emv_chip}
            showHologram={store.merchant.show_hologram}
          />
        </div>
      </div>
    </div>
  );
}
