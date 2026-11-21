'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Download,
  Copy,
  Check,
  MessageSquare,
  QrCode,
  ExternalLink,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';

export interface PromoterQrCardTarget {
  id: string;
  name: string;
  code: string;
  alias?: string | null;
  phone?: string | null;
}

export interface PromoterQrCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  promoter: PromoterQrCardTarget | null;
  merchantName: string;
  campaignName?: string;
  prizeDescription?: string;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  initialSize: number,
  minSize: number,
  weight: string,
  family: string
): number {
  let size = initialSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function sanitizePhoneForWhatsApp(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

export function PromoterQrCardModal({
  isOpen,
  onClose,
  promoter,
  merchantName,
  campaignName,
  prizeDescription,
}: PromoterQrCardModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cardDataUrl, setCardDataUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    if (!promoter) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/r/${encodeURIComponent(promoter.code)}`;
  }, [promoter]);

  useEffect(() => {
    if (!isOpen || !promoter || !shareUrl) {
      setCardDataUrl(null);
      return;
    }

    let cancelled = false;

    async function renderCard() {
      if (!promoter) return;
      setIsRendering(true);

      try {
        const width = 900;
        const height = 1200;
        const canvas = canvasRef.current ?? document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 1. Base luxury dark background
        ctx.fillStyle = '#08080a';
        ctx.fillRect(0, 0, width, height);

        // Ambient brand purple glow top
        const topGlow = ctx.createRadialGradient(width / 2, 120, 40, width / 2, 160, 560);
        topGlow.addColorStop(0, 'rgba(139, 92, 246, 0.30)');
        topGlow.addColorStop(0.55, 'rgba(139, 92, 246, 0.08)');
        topGlow.addColorStop(1, 'rgba(8, 8, 10, 0)');
        ctx.fillStyle = topGlow;
        ctx.fillRect(0, 0, width, height);

        // Ambient champagne glow bottom
        const bottomGlow = ctx.createRadialGradient(width / 2, height - 100, 30, width / 2, height - 120, 480);
        bottomGlow.addColorStop(0, 'rgba(212, 163, 115, 0.20)');
        bottomGlow.addColorStop(1, 'rgba(8, 8, 10, 0)');
        ctx.fillStyle = bottomGlow;
        ctx.fillRect(0, 0, width, height);

        // 2. Outer frame (doppelrand style)
        drawRoundedRect(ctx, 36, 36, width - 72, height - 72, 32);
        ctx.fillStyle = 'rgba(14, 14, 17, 0.88)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.stroke();

        // Inner hairline gold frame
        drawRoundedRect(ctx, 52, 52, width - 104, height - 104, 24);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(212, 163, 115, 0.25)';
        ctx.stroke();

        // 3. Top badge pill
        const badgeText = 'EMBAJADOR OFICIAL QR';
        ctx.font = '700 20px ui-monospace, SFMono-Regular, Menlo, monospace';
        const badgeMetrics = ctx.measureText(badgeText);
        const badgeW = badgeMetrics.width + 56;
        const badgeH = 44;
        const badgeX = (width - badgeW) / 2;
        const badgeY = 92;

        drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 22);
        ctx.fillStyle = 'rgba(212, 163, 115, 0.14)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(212, 163, 115, 0.45)';
        ctx.stroke();

        ctx.fillStyle = '#e9c49a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, width / 2, badgeY + badgeH / 2 + 1);

        // 4. Merchant Name & Subtitle
        const safeMerchant = (merchantName || 'FIDELIZIA').trim();
        const merchantSize = fitText(
          ctx,
          safeMerchant,
          width - 160,
          50,
          28,
          '800',
          'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
        );
        ctx.font = `800 ${merchantSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(safeMerchant, width / 2, 192);

        ctx.font = '500 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = '#a1a1aa';
        const subtitle = campaignName?.trim()
          ? campaignName.trim().slice(0, 48)
          : 'Escanea para unirte al Club VIP';
        ctx.fillText(subtitle, width / 2, 240);

        // 5. Crisp White QR Container
        const qrBoxSize = 468;
        const qrBoxX = (width - qrBoxSize) / 2;
        const qrBoxY = 286;

        // Soft purple halo under QR box
        ctx.save();
        ctx.shadowColor = 'rgba(139, 92, 246, 0.32)';
        ctx.shadowBlur = 42;
        ctx.shadowOffsetY = 12;
        drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 28);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();

        // Generate crisp QR on offscreen canvas
        const qrCanvas = document.createElement('canvas');
        const qrRenderSize = 412;
        await QRCode.toCanvas(qrCanvas, shareUrl, {
          width: qrRenderSize,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#09090b',
            light: '#ffffff',
          },
        });

        const qrOffset = (qrBoxSize - qrRenderSize) / 2;
        ctx.drawImage(qrCanvas, qrBoxX + qrOffset, qrBoxY + qrOffset, qrRenderSize, qrRenderSize);

        // 6. Promoter Identity Section
        const nameY = 824;
        const promoterDisplay = promoter.name.trim();
        const nameSize = fitText(
          ctx,
          promoterDisplay,
          width - 160,
          42,
          24,
          '800',
          'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
        );
        ctx.font = `800 ${nameSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = '#f4f4f5';
        ctx.fillText(promoterDisplay, width / 2, nameY);

        if (promoter.alias) {
          ctx.font = '500 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillStyle = '#a78bfa';
          ctx.fillText(promoter.alias.trim().slice(0, 42), width / 2, nameY + 42);
        }

        // 7. Code Pill
        const codeY = promoter.alias ? 904 : 882;
        const codeText = `CÓDIGO · ${promoter.code}`;
        ctx.font = '700 26px ui-monospace, SFMono-Regular, Menlo, monospace';
        const codeW = Math.max(300, ctx.measureText(codeText).width + 64);
        const codeH = 58;
        const codeX = (width - codeW) / 2;

        drawRoundedRect(ctx, codeX, codeY, codeW, codeH, 14);
        ctx.fillStyle = 'rgba(139, 92, 246, 0.16)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.5)';
        ctx.stroke();

        ctx.fillStyle = '#ede9fe';
        ctx.fillText(codeText, width / 2, codeY + codeH / 2 + 1);

        // 8. Short URL display
        const displayUrl = shareUrl.replace(/^https?:\/\//i, '');
        const urlSize = fitText(
          ctx,
          displayUrl,
          width - 160,
          20,
          14,
          '500',
          'ui-monospace, SFMono-Regular, Menlo, monospace'
        );
        ctx.font = `500 ${urlSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillStyle = '#a1a1aa';
        ctx.fillText(displayUrl, width / 2, codeY + codeH + 44);

        // 9. Footer Divider & Branding
        ctx.beginPath();
        ctx.moveTo(110, height - 118);
        ctx.lineTo(width - 110, height - 118);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = '#d4a373';
        ctx.fillText('FIDELIZIA SUITE · ESCANEA Y GANA', width / 2, height - 82);

        if (!cancelled) {
          setCardDataUrl(canvas.toDataURL('image/png'));
        }
      } catch {
        if (!cancelled) {
          toast.error('No pudimos renderizar la tarjeta QR.');
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    void renderCard();

    return () => {
      cancelled = true;
    };
  }, [isOpen, promoter, shareUrl, merchantName, campaignName]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !promoter) return null;

  const handleDownloadPng = () => {
    if (!cardDataUrl) return;
    const link = document.createElement('a');
    const cleanName = promoter.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    link.download = `QR-${promoter.code}-${cleanName || 'embajador'}.png`;
    link.href = cardDataUrl;
    link.click();
    toast.success(`Tarjeta PNG descargada (${promoter.code})`);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Enlace copiado al portapapeles', {
        description: shareUrl,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  const handleWhatsAppShare = () => {
    const waPhone = sanitizePhoneForWhatsApp(promoter.phone);
    const prizeLine = prizeDescription ? `\n🏆 Premio: ${prizeDescription}` : '';
    const message = [
      `¡Hola ${promoter.name}! ✨`,
      `Aquí tienes tu enlace personal de Embajador QR de *${merchantName}*.`,
      `Compártelo con tus amigos para sumar visitas y registros a tu marcador:${prizeLine}`,
      ``,
      `🔗 ${shareUrl}`,
      `🏷️ Tu código: *${promoter.code}*`,
    ].join('\n');

    const waUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-card-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-surface-200 border border-white/10 rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto custom-scrollbar shadow-2xl text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between bg-surface-100/70 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="qr-card-modal-title" className="text-sm font-bold text-white truncate">
                Tarjeta QR · {promoter.name}
              </h3>
              <p className="text-[11px] text-zinc-400 font-mono truncate">
                Código {promoter.code} · Lista para imprimir o enviar por WhatsApp
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar tarjeta QR"
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Card Preview */}
          <div className="flex flex-col items-center">
            <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
            <div className="relative w-full max-w-[280px] aspect-[3/4] rounded-xl overflow-hidden border border-white/10 bg-surface-300 shadow-glow-purple flex items-center justify-center">
              {isRendering || !cardDataUrl ? (
                <div className="flex flex-col items-center gap-2 text-zinc-400 text-xs font-mono">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                  <span>Generando tarjeta HD...</span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cardDataUrl}
                  alt={`Tarjeta QR de ${promoter.name}`}
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            <span className="text-[10px] font-mono text-zinc-500 mt-2">
              PNG Alta Resolución · 900 × 1200 px
            </span>
          </div>

          {/* Controls & Share info */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Badge variant="gold">
                <Sparkles className="w-3 h-3 mr-1" />
                Enlace de Atribución Único
              </Badge>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Cada escaneo suma visitas únicas y atribuye automáticamente los registros nuevos de clientes a{' '}
                <strong className="text-white">{promoter.name}</strong>.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-surface-100 border border-white/[0.08] space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
                URL Corta del QR
              </span>
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-mono text-brand-300 truncate">{shareUrl}</code>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-white shrink-0"
                  title="Probar enlace en nueva pestaña"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <Button
                type="button"
                variant="champagne"
                size="md"
                onClick={handleDownloadPng}
                disabled={!cardDataUrl || isRendering}
                className="w-full"
              >
                <Download className="w-4 h-4" />
                Descargar Tarjeta PNG
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => void handleCopyLink()}
                className="w-full"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    Enlace Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-brand-400" />
                    Copiar Enlace Directo
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleWhatsAppShare}
                className="w-full bg-emerald-600 hover:bg-emerald-500 border-emerald-400/30 shadow-glow-emerald"
              >
                <MessageSquare className="w-4 h-4" />
                {promoter.phone ? 'Enviar por WhatsApp al Promotor' : 'Compartir por WhatsApp'}
              </Button>
            </div>

            {promoter.phone && (
              <p className="text-[11px] font-mono text-zinc-500">
                WhatsApp destino: <span className="text-zinc-300">{promoter.phone}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
