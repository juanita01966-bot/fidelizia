'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Trophy,
  QrCode,
  Users,
  Activity,
  ShieldAlert,
  CheckCircle2,
  Ban,
  RotateCcw,
  Loader2,
  AlertCircle,
  Save,
  Store,
  Clock,
  Smartphone,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import type {
  PromoterComputedStatus,
  PromoterDetailResponse,
  PromoterPrizeStatus,
} from '@/types/referrals';

export interface PromoterDetailDrawerProps {
  promoterId: string | null;
  onClose: () => void;
  onUpdated: () => void;
  onOpenQrCard: (promoter: {
    id: string;
    name: string;
    code: string;
    alias?: string | null;
    phone?: string | null;
  }) => void;
}

function getStatusBadgeMeta(status: PromoterComputedStatus): {
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'tactical' | 'gold' | 'default';
} {
  switch (status) {
    case 'awarded':
      return { label: '✅ Entregado', variant: 'success' };
    case 'qualified':
      return { label: '🏆 Calificado', variant: 'gold' };
    case 'almost':
      return { label: '🔥 Cerca', variant: 'tactical' };
    case 'flagged':
      return { label: '⚠️ Revisar', variant: 'warning' };
    case 'disqualified':
      return { label: '🚫 Descalificado', variant: 'danger' };
    default:
      return { label: '⏳ En progreso', variant: 'default' };
  }
}

function formatDeviceHint(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  const lower = ua.toLowerCase();
  if (lower.includes('iphone') || lower.includes('ipad')) return 'iOS · Safari/Mobile';
  if (lower.includes('android')) return 'Android · Mobile';
  if (lower.includes('mac os') || lower.includes('macintosh')) return 'macOS · Desktop';
  if (lower.includes('windows')) return 'Windows · Desktop';
  return ua.slice(0, 32);
}

export function PromoterDetailDrawer({
  promoterId,
  onClose,
  onUpdated,
  onOpenQrCard,
}: PromoterDetailDrawerProps) {
  const [detail, setDetail] = useState<PromoterDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'customers' | 'visits'>('customers');
  const [notesDraft, setNotesDraft] = useState('');
  const [isMutating, setIsMutating] = useState(false);

  const fetchDetail = useCallback(async (id: string, signal?: AbortSignal) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/v1/admin/referrals/${encodeURIComponent(id)}`, {
        cache: 'no-store',
        credentials: 'include',
        signal,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'No se pudo cargar el detalle del embajador');
      }
      const payload: PromoterDetailResponse = {
        campaign: data.campaign,
        metrics: data.metrics,
        referredCustomers: data.referredCustomers || [],
        recentVisits: data.recentVisits || [],
      };
      setDetail(payload);
      setNotesDraft(payload.metrics.promoter.notes || '');
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setLoadError(err instanceof Error ? err.message : 'Error al consultar el embajador');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!promoterId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    void fetchDetail(promoterId, controller.signal);
    return () => controller.abort();
  }, [promoterId, fetchDetail]);

  useEffect(() => {
    if (!promoterId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [promoterId, onClose]);

  if (!promoterId) return null;

  const patchPromoter = async (
    patch: { prize_status?: PromoterPrizeStatus; is_active?: boolean; notes?: string | null },
    successMessage: string,
    celebrate = false
  ) => {
    setIsMutating(true);
    try {
      const res = await fetch(`/api/v1/admin/referrals/${encodeURIComponent(promoterId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'No se pudo actualizar el embajador');
      }
      if (celebrate) {
        confetti({ particleCount: 55, spread: 65, origin: { y: 0.65 } });
      }
      toast.success(successMessage);
      await fetchDetail(promoterId);
      onUpdated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar');
    } finally {
      setIsMutating(false);
    }
  };

  const metrics = detail?.metrics;
  const promoter = metrics?.promoter;
  const statusMeta = metrics ? getStatusBadgeMeta(metrics.computedStatus) : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promoter-drawer-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface-200 border-l border-white/10 h-full overflow-y-auto custom-scrollbar shadow-2xl flex flex-col text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] bg-surface-100/90 sticky top-0 z-10 backdrop-blur-md flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {metrics && (
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  #{metrics.rank}
                </span>
              )}
              <h3 id="promoter-drawer-title" className="text-base font-bold text-white truncate">
                {promoter?.name || 'Detalle de Embajador'}
              </h3>
              {statusMeta && <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>}
            </div>
            {promoter && (
              <div className="flex items-center gap-2 mt-1 text-xs font-mono text-zinc-400 flex-wrap">
                <span className="text-champagne-light">{promoter.code}</span>
                {promoter.alias && <span>· {promoter.alias}</span>}
                {promoter.phone && <span>· {promoter.phone}</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {promoter && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  onOpenQrCard({
                    id: promoter.id,
                    name: promoter.name,
                    code: promoter.code,
                    alias: promoter.alias,
                    phone: promoter.phone,
                  })
                }
              >
                <QrCode className="w-3.5 h-3.5 text-brand-400" />
                QR
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar panel de detalle"
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 flex-1">
          {isLoading && !detail ? (
            <div className="py-20 flex flex-col items-center gap-3 text-zinc-400 text-xs font-mono">
              <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
              <span>Cargando auditoría del embajador...</span>
            </div>
          ) : loadError ? (
            <div className="p-5 rounded-xl bg-red-500/10 border border-red-500/30 text-center space-y-3">
              <AlertCircle className="w-7 h-7 text-red-400 mx-auto" />
              <p className="text-xs text-red-200">{loadError}</p>
              <Button size="sm" variant="secondary" onClick={() => void fetchDetail(promoterId)}>
                Reintentar
              </Button>
            </div>
          ) : detail && metrics && promoter ? (
            <>
              {/* Funnel Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-lg bg-surface-100 border border-white/[0.06]">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Escaneos</span>
                  <span className="text-lg font-mono font-bold text-white">{metrics.totalScans}</span>
                </div>
                <div className="p-3 rounded-lg bg-surface-100 border border-white/[0.06]">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Únicos</span>
                  <span className="text-lg font-mono font-bold text-brand-300">{metrics.uniqueVisits}</span>
                </div>
                <div className="p-3 rounded-lg bg-surface-100 border border-white/[0.06]">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Registros</span>
                  <span className="text-lg font-mono font-bold text-champagne-light">
                    {metrics.newCustomers}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-surface-100 border border-white/[0.06]">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">En Tienda</span>
                  <span className="text-lg font-mono font-bold text-emerald-400">
                    {metrics.posVerifiedVisits}
                  </span>
                </div>
              </div>

              {/* Goal Progress Bar */}
              <div className="p-3.5 rounded-lg bg-surface-100 border border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-400">
                    Progreso hacia meta ({detail.campaign.win_mode === 'goal' ? 'Meta Fija' : `Top ${detail.campaign.top_n}`})
                  </span>
                  <span className="text-white font-bold">
                    {metrics.score} / {metrics.target} ({metrics.progressPct}%) · Conv {metrics.conversionRate}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-300 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      metrics.computedStatus === 'awarded'
                        ? 'bg-emerald-400'
                        : metrics.computedStatus === 'qualified'
                          ? 'bg-champagne'
                          : metrics.computedStatus === 'flagged'
                            ? 'bg-amber-400'
                            : 'bg-brand-500'
                    }`}
                    style={{ width: `${Math.min(100, metrics.progressPct)}%` }}
                  />
                </div>
              </div>

              {/* Anti-Fraud Warnings */}
              {metrics.isSuspicious && metrics.suspiciousReasons.length > 0 && (
                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Alerta Antifraude Detectada — Revisar antes de entregar premio</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-amber-200/90 space-y-0.5 pl-1">
                    {metrics.suspiciousReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Quick Prize & Status Controls */}
              <div className="p-4 rounded-lg bg-surface-100 border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                    Acciones de Premio y Estado
                  </span>
                  {promoter.prize_awarded_at && (
                    <span className="text-[10px] font-mono text-emerald-400">
                      Entregado: {new Date(promoter.prize_awarded_at).toLocaleDateString('es-CO')}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {promoter.prize_status !== 'awarded' ? (
                    <Button
                      type="button"
                      variant="champagne"
                      size="sm"
                      disabled={isMutating}
                      onClick={() =>
                        void patchPromoter(
                          { prize_status: 'awarded' },
                          `¡Premio entregado a ${promoter.name}!`,
                          true
                        )
                      }
                    >
                      <Trophy className="w-3.5 h-3.5" />
                      Marcar Premio Entregado
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isMutating}
                      onClick={() =>
                        void patchPromoter(
                          { prize_status: 'pending' },
                          'Estado de premio revertido a pendiente'
                        )
                      }
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Revertir Entrega
                    </Button>
                  )}

                  {promoter.prize_status !== 'disqualified' ? (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={isMutating}
                      onClick={() =>
                        void patchPromoter(
                          { prize_status: 'disqualified' },
                          `${promoter.name} marcado como descalificado`
                        )
                      }
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Descalificar
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isMutating}
                      onClick={() =>
                        void patchPromoter(
                          { prize_status: 'pending' },
                          `${promoter.name} rehabilitado en el ranking`
                        )
                      }
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Rehabilitar
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isMutating}
                    onClick={() =>
                      void patchPromoter(
                        { is_active: !promoter.is_active },
                        promoter.is_active ? 'QR pausado temporalmente' : 'QR reactivado'
                      )
                    }
                  >
                    {promoter.is_active ? 'Pausar QR' : 'Reactivar QR'}
                  </Button>
                </div>

                {/* Notes editor */}
                <div className="pt-2 border-t border-white/[0.06] space-y-2">
                  <label htmlFor="drawer-notes" className="text-[11px] font-mono text-zinc-400 block">
                    Notas de auditoría / entrega
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="drawer-notes"
                      type="text"
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Ej: Entregado bono en caja el viernes..."
                      className="flex-1 bg-surface-200 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isMutating || notesDraft === (promoter.notes || '')}
                      onClick={() =>
                        void patchPromoter(
                          { notes: notesDraft.trim() || null },
                          'Notas actualizadas'
                        )
                      }
                    >
                      <Save className="w-3.5 h-3.5" />
                      Guardar
                    </Button>
                  </div>
                </div>
              </div>

              {/* Drill-down Tabs */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 rounded-lg bg-surface-100 p-1 border border-white/[0.08] text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setActiveTab('customers')}
                    className={`py-2 px-3 rounded flex items-center justify-center gap-1.5 transition-colors ${
                      activeTab === 'customers'
                        ? 'bg-brand-500/20 text-brand-300 font-bold border border-brand-500/30'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Referidos ({detail.referredCustomers.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('visits')}
                    className={`py-2 px-3 rounded flex items-center justify-center gap-1.5 transition-colors ${
                      activeTab === 'visits'
                        ? 'bg-brand-500/20 text-brand-300 font-bold border border-brand-500/30'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Escaneos ({detail.recentVisits.length})</span>
                  </button>
                </div>

                {activeTab === 'customers' ? (
                  detail.referredCustomers.length === 0 ? (
                    <div className="p-8 rounded-lg bg-surface-100/50 border border-white/[0.06] text-center text-xs font-mono text-zinc-500">
                      Este embajador aún no tiene clientes nuevos atribuidos.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {detail.referredCustomers.map((cust) => (
                        <div
                          key={cust.id}
                          className="p-3 rounded-lg bg-surface-100 border border-white/[0.06] flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-white truncate">
                                {cust.full_name}
                              </span>
                              {cust.isPosVerified ? (
                                <Badge variant="success">
                                  <Store className="w-3 h-3 mr-1" />
                                  POS ({cust.transactionsCount})
                                </Badge>
                              ) : (
                                <Badge variant="default">Registro web</Badge>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-zinc-400 mt-0.5 flex items-center gap-2">
                              <span>{cust.phone}</span>
                              <span>·</span>
                              <span>
                                {new Date(cust.referred_at || cust.created_at).toLocaleDateString('es-CO', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 font-mono">
                            <span className="text-xs font-bold text-champagne-light block">
                              {cust.totalVisits} visitas
                            </span>
                            <span className="text-[10px] text-zinc-500 uppercase">
                              {cust.loyalty_tier}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : detail.recentVisits.length === 0 ? (
                  <div className="p-8 rounded-lg bg-surface-100/50 border border-white/[0.06] text-center text-xs font-mono text-zinc-500">
                    Aún no hay escaneos registrados para este código QR.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detail.recentVisits.map((visit) => (
                      <div
                        key={visit.id}
                        className="p-3 rounded-lg bg-surface-100 border border-white/[0.06] flex items-center justify-between gap-3 text-xs font-mono"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Clock className="w-3 h-3 text-zinc-500" />
                            <span className="text-white">
                              {new Date(visit.created_at).toLocaleString('es-CO', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {visit.is_unique_daily ? (
                              <Badge variant="tactical">Único</Badge>
                            ) : (
                              <Badge variant="default">Repetido</Badge>
                            )}
                            {visit.converted_customer_id && (
                              <Badge variant="success">Convertido</Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 flex items-center gap-2">
                            <Smartphone className="w-3 h-3 shrink-0" />
                            <span className="truncate">{formatDeviceHint(visit.user_agent)}</span>
                            {visit.ip_prefix && (
                              <span className="text-zinc-600">· IP {visit.ip_prefix}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
