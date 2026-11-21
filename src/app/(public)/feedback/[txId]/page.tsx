'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Star,
  Sparkles,
  ExternalLink,
  Send,
  CheckCircle2,
  HeartHandshake,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { soundEngine } from '@/lib/audio/sound-effects';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizePhoneE164(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  return `+57${trimmed.replace(/\D/g, '')}`;
}

export default function ReviewGatePage() {
  const params = useParams();
  const txId = typeof params?.txId === 'string' ? params.txId : '';

  const [merchantId, setMerchantId] = useState<string>('00000000-0000-0000-0000-000000000001');
  const [merchantName, setMerchantName] = useState<string>('Café Canelo');
  const [hasValidTx, setHasValidTx] = useState<boolean>(false);

  const [customerPhone, setCustomerPhone] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [resultRedirect, setResultRedirect] = useState<{
    isPublic: boolean;
    googleUrl: string;
    ticketCode: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/feedback?txId=${encodeURIComponent(txId)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.merchantId) setMerchantId(data.merchantId);
        if (data.merchantName) setMerchantName(data.merchantName);
        setHasValidTx(Boolean(data.validTransaction));
      })
      .catch(() => {
        // Ignore abort
      });
    return () => controller.abort();
  }, [txId]);

  const handleRatingSelect = (star: number) => {
    setRating(star);
    soundEngine.playScanSuccess();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedPhone = normalizePhoneE164(customerPhone);
    if (!hasValidTx && !normalizedPhone) {
      toast.error('Ingresa tu número de WhatsApp para vincular tu valoración');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: UUID_REGEX.test(txId) ? txId : null,
          merchantId,
          customerPhone: normalizedPhone || null,
          rating,
          comments: comments.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'No pudimos guardar tu valoración');
      }

      const ticketCode = String(data.feedback?.id || 'FB0001')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 6)
        .toUpperCase();

      setResultRedirect({
        isPublic: Boolean(data.isPublicRedirect),
        googleUrl: data.redirectUrl || 'https://www.google.com/maps',
        ticketCode,
      });
      setIsSubmitted(true);

      if (data.isPublicRedirect) {
        soundEngine.playRedeemCelebration();
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#10b981', '#8b5cf6'],
        });
      } else {
        toast.info('Queja confidencial recibida', {
          description: 'La gerencia general ha sido notificada con máxima prioridad.',
        });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar valoración');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 flex flex-col justify-center items-center relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[550px] h-[300px] bg-amber-500/10 blur-[130px] pointer-events-none rounded-full" />

      <div className="w-full max-w-lg bg-surface-200/90 border border-white/10 shadow-doppelrand rounded-2xl p-6 sm:p-8 text-center relative z-10">
        {!isSubmitted ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-400/30 flex items-center justify-center mx-auto mb-3">
                <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                ¿Cómo estuvo tu experiencia en {merchantName}?
              </h1>
              <p className="text-xs text-zinc-400 mt-1.5">
                Tu opinión nos ayuda a mantener el más alto estándar de servicio.
              </p>
            </div>

            <div className="flex justify-center gap-2 sm:gap-3 py-2">
              {[1, 2, 3, 4, 5].map((star) => {
                const isLit = (hoverRating !== null ? hoverRating : rating) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    aria-label={`Calificar con ${star} estrella${star > 1 ? 's' : ''}`}
                    onClick={() => handleRatingSelect(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(null)}
                    className="p-1.5 transition-transform active:scale-90 hover:scale-110 focus:outline-none"
                  >
                    <Star
                      className={`w-9 h-9 sm:w-11 sm:h-11 transition-colors ${
                        isLit
                          ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]'
                          : 'text-zinc-600'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            <div className="text-center font-mono text-xs">
              {rating === 5 && <span className="text-emerald-400 font-bold">⭐⭐⭐⭐⭐ ¡Extraordinaria!</span>}
              {rating === 4 && <span className="text-emerald-300 font-bold">⭐⭐⭐⭐ Muy Buena</span>}
              {rating === 3 && <span className="text-amber-400 font-bold">⭐⭐⭐ Regular / Puede mejorar</span>}
              {rating <= 2 && <span className="text-rose-400 font-bold">⚠️ Experiencia Insatisfactoria</span>}
            </div>

            {!hasValidTx && (
              <div className="text-left">
                <label htmlFor="feedback-phone" className="text-xs font-mono text-zinc-300 block mb-1">
                  Tu WhatsApp Registrado *
                </label>
                <input
                  id="feedback-phone"
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Ej: +573001234567"
                  className="w-full bg-surface-100 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                />
              </div>
            )}

            {rating <= 3 && (
              <div className="text-left bg-surface-100 p-4 rounded-xl border border-amber-500/20 animate-in fade-in duration-300">
                <div className="flex items-center gap-2 mb-2 text-amber-300 text-xs font-semibold">
                  <HeartHandshake className="w-4 h-4" />
                  <span>Buzón Confidencial Directo con Gerencia</span>
                </div>
                <p className="text-[11px] text-zinc-400 mb-2">
                  Lamentamos mucho esto. Cuéntanos en detalle qué falló para que la administración tome medidas correctivas inmediatas:
                </p>
                <textarea
                  required
                  rows={3}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Por favor explícanos qué sucedió..."
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>
            )}

            {rating >= 4 && (
              <div className="text-left">
                <label htmlFor="feedback-comments" className="text-xs font-mono text-zinc-400 block mb-1">
                  ¿Qué fue lo que más te gustó? (Opcional)
                </label>
                <textarea
                  id="feedback-comments"
                  rows={2}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="La atención del equipo, la calidad del producto..."
                  className="w-full bg-surface-100 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500 resize-none"
                />
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting} className="w-full">
              <Send className="w-4 h-4 mr-2" />
              Enviar Mi Valoración
            </Button>
          </form>
        ) : (
          <div className="space-y-5 animate-in zoom-in-95 duration-300">
            {resultRedirect?.isPublic ? (
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center mx-auto text-amber-400">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-bold text-white">¡Muchas Gracias por tu Cariño!</h2>
                <p className="text-xs text-zinc-300 leading-relaxed max-w-sm mx-auto">
                  Clientes como tú hacen posible nuestra pasión. ¿Nos ayudarías compartiendo tu reseña de {rating} estrellas en nuestro perfil oficial de <strong>Google Maps</strong>?
                </p>

                <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-left text-xs text-zinc-300 font-mono">
                  <span className="text-[10px] text-zinc-500 block">Tu reseña preparada:</span>
                  <p className="italic text-amber-200 mt-1">
                    &quot;{comments || '¡Excelente servicio y calidad insuperable!'}&quot;
                  </p>
                </div>

                <a
                  href={resultRedirect.googleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block w-full"
                >
                  <Button variant="champagne" size="lg" className="w-full text-zinc-950 font-bold">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Publicar Reseña en Google Maps
                  </Button>
                </a>
              </div>
            ) : (
              <div className="space-y-4 text-left">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-white text-center">
                  Mensaje Entregado a Gerencia General
                </h2>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Apreciamos profundamente tu honestidad. Hemos registrado tu queja de forma confidencial y el gerente a cargo se pondrá en contacto contigo para ofrecerte una solución digna.
                </p>
                <div className="p-3 bg-black/40 rounded-lg border border-white/5 text-[11px] font-mono text-zinc-400">
                  <span>
                    Ticket de Incidencia: <strong>#FB-{resultRedirect?.ticketCode || 'CONFID'}</strong>
                  </span>
                  <br />
                  <span>
                    Estado: <strong>Escalado a Dirección General</strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
