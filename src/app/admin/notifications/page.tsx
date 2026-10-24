'use client';

import React, { useState } from 'react';
import { BellRing, Send, Smartphone, Sparkles, MapPin, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getStore } from '@/lib/store/fidelizia-store';
import { soundEngine } from '@/lib/audio/sound-effects';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

export default function NotificationsPage() {
  const store = getStore();

  const [segment, setSegment] = useState<string>('all');
  const [title, setTitle] = useState('Hoy jueves 2x1 en Café de Especialidad');
  const [body, setBody] = useState('Pasa por tu sede favorita y duplica tus sellos de lealtad en tu orden.');
  const [isSending, setIsSending] = useState(false);

  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setIsSending(true);
    try {
      const response = await fetch('/api/v1/notifications/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segment,
          title: title.trim(),
          body: body.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al emitir campaña push');
      }

      soundEngine.playRedeemCelebration();
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.6 },
      });

      toast.success('¡Notificación Push Emitida con Éxito!', {
        description: `Se han actualizado ${data.recipientsCount || 0} tarjetas en Google Wallet y Apple Wallet. Mensaje enviado a la pantalla de bloqueo de los clientes.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al emitir campaña push';
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <BellRing className="w-6 h-6 text-brand-400" />
          Centro de Notificaciones & Geofencing Pasivo
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Envía mensajes directos a la pantalla de bloqueo de tus clientes mediante APNs (Apple) y Google Wallet REST API.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Redactor de Notificación */}
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
                <label className="text-xs font-mono text-zinc-300 block mb-1">
                  Segmento Destino
                </label>
                <select
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="all">Todos los Miembros ({store.customers.length} clientes)</option>
                  <option value="champion">Champions / VIPs ({store.customers.filter((c) => c.rfm_segment === 'champion').length} clientes)</option>
                  <option value="loyal">Clientes Leales ({store.customers.filter((c) => c.rfm_segment === 'loyal').length} clientes)</option>
                  <option value="at_risk">Clientes En Riesgo ({store.customers.filter((c) => c.rfm_segment === 'at_risk').length} clientes)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">
                  Título de la Notificación *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej: ¡2x1 en cócteles para miembros hoy!"
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">
                  Cuerpo del Mensaje *
                </label>
                <textarea
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
                  <strong>Cero Spam:</strong> Las notificaciones de Wallet tienen una tasa de apertura superior al 85% al no competir con bandejas de correo ni mensajes masivos de WhatsApp.
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSending}
                className="w-full"
              >
                <Send className="w-4 h-4 mr-2" />
                Enviar Notificación Push a la Wallet
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Simulador en Pantalla de Bloqueo Móvil */}
        <div className="flex flex-col items-center">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3">
            Simulador en Pantalla de Bloqueo
          </span>

          <div className="w-full max-w-xs rounded-[38px] border-4 border-zinc-700 bg-black p-4 shadow-2xl relative overflow-hidden text-left">
            {/* Notch superior */}
            <div className="w-24 h-4 bg-zinc-900 rounded-full mx-auto mb-6" />

            <div className="text-center mb-6">
              <span className="text-3xl font-light text-white font-sans">09:41</span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">Jueves, 22 de Octubre</span>
            </div>

            {/* Notificación Lockscreen de Apple Wallet */}
            <div className="bg-zinc-900/90 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 shadow-lg text-xs space-y-1 animate-in fade-in duration-300">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-brand-500 text-white flex items-center justify-center text-[9px] font-bold">
                    W
                  </div>
                  <span className="font-semibold text-zinc-200">WALLET · {store.merchant.name}</span>
                </div>
                <span>ahora</span>
              </div>
              <p className="font-bold text-white text-xs leading-snug">{title}</p>
              <p className="text-[11px] text-zinc-300 leading-snug">{body}</p>
            </div>

            {/* Geocerca Pasiva Alerta */}
            <div className="mt-4 bg-white/5 rounded-xl p-3 border border-white/5 text-[10px] text-zinc-400 flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
              <span>
                <strong>Geocerca activa:</strong> Disparo automático a 100m de {store.locations[0]?.address}.
              </span>
            </div>

            {/* Barra Home inferior */}
            <div className="w-28 h-1 bg-white/40 rounded-full mx-auto mt-8" />
          </div>
        </div>
      </div>
    </div>
  );
}
