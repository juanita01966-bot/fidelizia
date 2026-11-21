'use client';

import React, { useEffect, useState } from 'react';
import { BellRing, Send, Sparkles, MapPin } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { soundEngine } from '@/lib/audio/sound-effects';
import type { Customer, Location, Merchant } from '@/types/domain';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

export default function NotificationsPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [segment, setSegment] = useState<string>('all');
  const [title, setTitle] = useState('Hoy 2x1 para miembros VIP');
  const [body, setBody] = useState('Presenta tu tarjeta en caja hoy y recibe beneficio especial.');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/admin/overview', {
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.merchant) setMerchant(data.merchant);
        if (data.locations) setLocations(data.locations);
        if (data.customers) setCustomers(data.customers);
      })
      .catch(() => {
        // Ignore abort
      });
    return () => controller.abort();
  }, []);

  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setIsSending(true);
    try {
      const response = await fetch('/api/v1/notifications/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          segment,
          title: title.trim(),
          body: body.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'Error al emitir campaña push');
      }

      soundEngine.playRedeemCelebration();
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.6 },
      });

      toast.success('¡Notificación Push Emitida con Éxito!', {
        description: `Google Wallet: ${data.googleWalletDelivered || 0} · Apple Wallet: ${data.appleWalletDelivered || 0} (${data.recipientsCount || 0} pases).`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al emitir campaña push';
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  };

  const countBySegment = (seg: string) =>
    customers.filter((c) => c.rfm_segment === seg).length;

  return (
    <div className="space-y-6 text-left">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <BellRing className="w-6 h-6 text-brand-400" />
          Centro de Notificaciones &amp; Geofencing Pasivo
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Envía mensajes directos a la pantalla de bloqueo de tus clientes mediante APNs (Apple) y Google Wallet REST API.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <Card>
          <CardHeader>
            <CardTitle>Componer Mensaje Masivo</CardTitle>
            <CardDescription>
              El mensaje se proyectará de forma nativa en la tarjeta y en la pantalla de bloqueo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendPush} className="space-y-4">
              <div>
                <label htmlFor="push-segment" className="text-xs font-mono text-zinc-300 block mb-1">
                  Segmento Destino
                </label>
                <select
                  id="push-segment"
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="all">Todos los Miembros ({customers.length} clientes)</option>
                  <option value="champion">Champions / VIPs ({countBySegment('champion')} clientes)</option>
                  <option value="loyal">Clientes Leales ({countBySegment('loyal')} clientes)</option>
                  <option value="at_risk">Clientes En Riesgo ({countBySegment('at_risk')} clientes)</option>
                  <option value="birthday_month">Cumpleañeros del Mes</option>
                </select>
              </div>

              <div>
                <label htmlFor="push-title" className="text-xs font-mono text-zinc-300 block mb-1">
                  Título de la Notificación *
                </label>
                <input
                  id="push-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej: ¡2x1 en cócteles para miembros hoy!"
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label htmlFor="push-body" className="text-xs font-mono text-zinc-300 block mb-1">
                  Cuerpo del Mensaje *
                </label>
                <textarea
                  id="push-body"
                  required
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Redacta la oferta o beneficio..."
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 resize-none"
                />
              </div>

              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-200 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-champagne shrink-0 mt-0.5" />
                <span>
                  <strong>Entrega Nativa:</strong> Google Wallet utiliza <code>addMessage (TEXT_AND_NOTIFY)</code> respetando la cuota de 3 alertas/24h, y Apple Wallet envía APNs HTTP/2 con actualización del campo <code>changeMessage</code>.
                </span>
              </div>

              <Button type="submit" variant="primary" size="md" isLoading={isSending} className="w-full">
                <Send className="w-4 h-4 mr-2" />
                Enviar Notificación Push a la Wallet
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col items-center">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3">
            Simulador en Pantalla de Bloqueo
          </span>

          <div className="w-full max-w-xs rounded-[38px] border-4 border-zinc-700 bg-black p-4 shadow-2xl relative overflow-hidden text-left">
            <div className="w-24 h-4 bg-zinc-900 rounded-full mx-auto mb-6" />

            <div className="text-center mb-6">
              <span className="text-3xl font-light text-white font-sans">09:41</span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">Vista previa Lockscreen</span>
            </div>

            <div className="bg-zinc-900/90 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 shadow-lg text-xs space-y-1 animate-in fade-in duration-300">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-brand-500 text-white flex items-center justify-center text-[9px] font-bold">
                    W
                  </div>
                  <span className="font-semibold text-zinc-200">
                    WALLET · {merchant?.name || 'Fidelizia'}
                  </span>
                </div>
                <span>ahora</span>
              </div>
              <p className="font-bold text-white text-xs leading-snug">{title}</p>
              <p className="text-[11px] text-zinc-300 leading-snug">{body}</p>
            </div>

            <div className="mt-4 bg-white/5 rounded-xl p-3 border border-white/5 text-[10px] text-zinc-400 flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
              <span>
                <strong>Geocerca activa:</strong>{' '}
                {locations[0]?.address || 'Sede Principal autorizada'}
              </span>
            </div>

            <div className="w-28 h-1 bg-white/40 rounded-full mx-auto mt-8" />
          </div>
        </div>
      </div>
    </div>
  );
}
