'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { 
  Calendar, 
  Clock, 
  Users, 
  Sparkles, 
  CheckCircle2, 
  Smartphone, 
  ArrowRight,
  ShieldCheck 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LivePassPreview } from '@/components/passes/LivePassPreview';
import { getStore } from '@/lib/store/fidelizia-store';
import { soundEngine } from '@/lib/audio/sound-effects';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

export default function BookingPage() {
  const params = useParams();
  const slug = (params.merchantSlug as string) || 'cafe-canelo';
  const store = getStore();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [date, setDate] = useState('2026-10-24');
  const [time, setTime] = useState('19:30');
  const [guestsCount, setGuestsCount] = useState(2);
  const [notes, setNotes] = useState('');

  const [isBooked, setIsBooked] = useState(false);
  const [bookedDateTime, setBookedDateTime] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const fullIsoDate = new Date(`${date}T${time}:00`).toISOString();
      const res = store.createReservation({
        merchantSlug: slug,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        dateTime: fullIsoDate,
        guestsCount: Number(guestsCount),
        notes: notes.trim() || null,
      });

      setBookedDateTime(fullIsoDate);
      setIsBooked(true);

      soundEngine.playRedeemCelebration();
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#8b5cf6', '#d4a373', '#10b981'],
      });

      toast.success('¡Reserva Confirmada & Sincronizada!', {
        description: 'La tarjeta de fidelización se ha actualizado en primer plano.',
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al agendar reserva');
    }
  };

  return (
    <div className="min-h-screen bg-background py-10 px-4 sm:px-6 flex flex-col justify-center items-center relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-brand-600/10 blur-[140px] pointer-events-none rounded-full" />

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center z-10">
        {/* COLUMNA IZQUIERDA: Formulario de Reserva */}
        <div className="text-left space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-xs text-purple-300 font-mono mb-3">
              <Calendar className="w-3.5 h-3.5 text-champagne" />
              Sincronización Automática con Apple & Google Wallet
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Agenda tu Mesa en{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-champagne-light">
                {store.merchant.name}
              </span>
            </h1>
            <p className="text-sm text-zinc-400 mt-2">
              Al confirmar, tu tarjeta digital en el teléfono proyectará tu próxima reserva en primer plano y te alertará 2 horas antes de tu llegada.
            </p>
          </div>

          {!isBooked ? (
            <form onSubmit={handleSubmit} className="space-y-4 bg-surface-200/90 border border-white/10 rounded-xl p-6 shadow-doppelrand">
              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ej: Carlos Mendoza"
                  className="w-full bg-surface-100 border border-white/10 rounded px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">Teléfono / WhatsApp *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+573001234567"
                  className="w-full bg-surface-100 border border-white/10 rounded px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-zinc-300 block mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-zinc-300 block mb-1">Hora *</label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">Número de Comensales *</label>
                <div className="flex gap-2">
                  {[1, 2, 4, 6, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setGuestsCount(n)}
                      className={`flex-1 py-2 rounded border text-xs font-mono font-bold transition-all ${
                        guestsCount === n
                          ? 'bg-brand-500/30 border-brand-400 text-white shadow-glow-purple'
                          : 'bg-surface-100 border-white/5 text-zinc-400'
                      }`}
                    >
                      {n} {n === 1 ? 'persona' : 'personas'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">Notas u Ocasión Especial</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Mesa en terraza, aniversario, reunión..."
                  className="w-full bg-surface-100 border border-white/10 rounded px-3.5 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <Button type="submit" variant="primary" size="lg" className="w-full mt-2">
                <Sparkles className="w-4 h-4 mr-2 text-champagne" />
                Confirmar Reserva y Sincronizar Pase
              </Button>
            </form>
          ) : (
            <div className="space-y-4 bg-surface-200/90 border border-emerald-500/30 rounded-xl p-6 shadow-glow-purple">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-6 h-6 shrink-0" />
                <h3 className="text-base font-bold text-white">¡Reserva Confirmada Exitosamente!</h3>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Hemos reservado tu mesa para el día <strong>{new Date(bookedDateTime!).toLocaleDateString('es-CO', { dateStyle: 'full' })}</strong> a las <strong>{time}</strong> para <strong>{guestsCount} personas</strong>.
              </p>
              <div className="p-3 bg-black/40 rounded border border-white/10 text-xs font-mono text-zinc-400">
                <span>Estado: <strong className="text-emerald-400">CONFIRMADA EN WALLET</strong></span>
                <br />
                <span>Titular: <strong>{customerName}</strong></span>
              </div>
              <Button
                variant="outline"
                size="md"
                onClick={() => setIsBooked(false)}
                className="w-full"
              >
                Hacer otra reserva
              </Button>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: Pase con Sincronización en Tiempo Real */}
        <div className="flex justify-center">
          <LivePassPreview
            merchantName={store.merchant.name}
            customerName={customerName}
            passSerialNumber="PASS-CANELO-001"
            currentStamps={8}
            totalNeeded={store.merchant.stamps_needed}
            rewardDescription={store.merchant.reward_description}
            passType="apple"
            nextReservationDate={bookedDateTime}
          />
        </div>
      </div>
    </div>
  );
}
