'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  TrendingUp,
  ShieldAlert,
  BellRing,
  Gift,
  Sparkles,
  Receipt,
  QrCode,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Trophy,
  ArrowRight,
  Crown,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { soundEngine } from '@/lib/audio/sound-effects';
import { formatCurrency } from '@/lib/utils';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import type { Customer, FraudAlert, Merchant, Transaction, WalletPass } from '@/types/domain';
import type { ReferralOverviewResponse } from '@/types/referrals';

export default function AdminDashboardPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [passes, setPasses] = useState<WalletPass[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fraudAlerts, setFraudAlerts] = useState<FraudAlert[]>([]);
  const [referralOverview, setReferralOverview] = useState<ReferralOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendingCampaign, setSendingCampaign] = useState<'at_risk' | 'birthday_month' | null>(null);

  const fetchReferralSummary = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/v1/admin/referrals', {
        cache: 'no-store',
        credentials: 'include',
        signal,
      });
      if (!res.ok) {
        setReferralOverview(null);
        return;
      }
      const data = await res.json();
      if (data?.success && data.campaign && data.summary) {
        setReferralOverview({
          campaign: data.campaign,
          merchant: data.merchant,
          summary: data.summary,
          promoters: data.promoters || [],
        });
      }
    } catch {
      // Fail silently if migration isn't applied yet or role lacks access
    }
  }, []);

  const fetchOverview = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/v1/admin/overview', {
        cache: 'no-store',
        credentials: 'include',
        signal,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'No se pudo cargar el dashboard');
      }
      setMerchant(data.merchant);
      setCustomers(data.customers || []);
      setPasses(data.passes || []);
      setTransactions(data.transactions || []);
      setFraudAlerts(data.fraudAlerts || []);
      setLoadError(null);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setLoadError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchOverview(controller.signal);
    void fetchReferralSummary(controller.signal);

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void fetchOverview(controller.signal);
        void fetchReferralSummary(controller.signal);
      }
    }, 6000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchOverview, fetchReferralSummary]);

  const deduplicatedCustomers = useMemo(() => {
    const cleanDigits = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
    const seen = new Set<string>();
    const result: Customer[] = [];
    for (const c of customers) {
      const phoneDigits = cleanDigits(c.phone);
      const key = phoneDigits.length >= 7 ? phoneDigits : c.id;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(c);
      }
    }
    return result;
  }, [customers]);

  const champions = deduplicatedCustomers.filter((c) => c.rfm_segment === 'champion');
  const loyal = deduplicatedCustomers.filter((c) => c.rfm_segment === 'loyal');
  const atRisk = deduplicatedCustomers.filter((c) => c.rfm_segment === 'at_risk');
  const hibernating = deduplicatedCustomers.filter((c) => c.rfm_segment === 'hibernating');

  const triggerSegmentPush = async (
    segment: 'at_risk' | 'birthday_month',
    title: string,
    body: string
  ) => {
    setSendingCampaign(segment);
    try {
      const res = await fetch('/api/v1/notifications/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ segment, title, body }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'No se pudo enviar la campaña');
      }
      soundEngine.playRedeemCelebration();
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
      toast.success('Campaña enviada a las billeteras móviles', {
        description: `Google Wallet: ${data.googleWalletDelivered || 0} · Apple Wallet: ${data.appleWalletDelivered || 0}`,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar campaña push');
    } finally {
      setSendingCampaign(null);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400 text-xs font-mono">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        <span>Cargando métricas del comercio...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 rounded-xl bg-surface-200 border border-red-500/30 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
        <p className="text-sm font-bold text-white">No pudimos cargar el CRM</p>
        <p className="text-xs text-zinc-400">{loadError}</p>
        <Button size="sm" variant="secondary" onClick={() => void fetchOverview()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const slug = merchant?.slug || 'cafe-canelo';
  const currentMonthName = new Date().toLocaleDateString('es-CO', { month: 'long' });

  return (
    <div className="space-y-8 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <Badge variant="tactical" className="mb-2">
            Panel Operativo de Fidelización
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Dashboard CRM &amp; Retención
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Supervisión 360° de {merchant?.name || 'tu comercio'}, sellos emitidos y candados antifraude.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/scanner/${slug}`}>
            <Button variant="primary" size="md">
              <QrCode className="w-4 h-4 mr-1.5" />
              Abrir Escáner POS
            </Button>
          </Link>
          <Link href={`/join/${slug}`} target="_blank">
            <Button variant="secondary" size="md">
              <Users className="w-4 h-4 mr-1.5 text-champagne" />
              Nuevo Cliente (10s)
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-surface-200/90">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Clientes Totales</span>
              <Users className="w-4 h-4 text-purple-400" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono text-white mt-1">
              {deduplicatedCustomers.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-zinc-500 font-mono">
            <span>{champions.length} VIPs · {atRisk.length} En Riesgo</span>
          </CardContent>
        </Card>

        <Card className="bg-surface-200/90">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Pases Activos</span>
              <Sparkles className="w-4 h-4 text-champagne" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono text-white mt-1">
              {passes.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-zinc-500 font-mono">
            <span>Apple &amp; Google Wallet</span>
          </CardContent>
        </Card>

        <Card className="bg-surface-200/90">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Facturas Selladas</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {transactions.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-zinc-500 font-mono">
            <span>100% tickets deduplicados</span>
          </CardContent>
        </Card>

        <Card className="bg-surface-200/90">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Alertas Antifraude</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono text-rose-400 mt-1">
              {fraudAlerts.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-zinc-500 font-mono">
            <span>Cooldown &amp; reuso bloqueados</span>
          </CardContent>
        </Card>
      </div>

      {referralOverview && (
        <Card className="border-champagne/25 bg-gradient-to-r from-surface-200/95 via-surface-200/90 to-champagne/[0.06] p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="gold">
                  <Trophy className="w-3 h-3 mr-1" />
                  Campaña Embajadores QR
                </Badge>
                <span className="text-[11px] font-mono text-zinc-400">
                  {referralOverview.summary.totalPromoters} embajadores
                </span>
              </div>
              <h2 className="text-base font-bold text-white truncate">
                {referralOverview.campaign.name}
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                Premio: <span className="text-champagne-light">{referralOverview.campaign.prize_description}</span>
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 lg:max-w-2xl">
              <div className="px-3 py-2 rounded-lg bg-surface-100/90 border border-white/[0.06]">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block">Visitas Únicas</span>
                <span className="text-lg font-mono font-bold text-brand-300">
                  {referralOverview.summary.totalUniqueVisits}
                </span>
              </div>
              <div className="px-3 py-2 rounded-lg bg-surface-100/90 border border-white/[0.06]">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block">Registros Nuevos</span>
                <span className="text-lg font-mono font-bold text-white">
                  {referralOverview.summary.totalNewCustomers}
                </span>
              </div>
              <div className="px-3 py-2 rounded-lg bg-surface-100/90 border border-white/[0.06]">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block">Calificados</span>
                <span className="text-lg font-mono font-bold text-emerald-400">
                  {referralOverview.summary.qualifiedCount}
                  <span className="text-xs text-zinc-500 font-normal">
                    /{referralOverview.summary.totalPromoters}
                  </span>
                </span>
              </div>
              <div className="px-3 py-2 rounded-lg bg-surface-100/90 border border-champagne/25">
                <span className="text-[10px] font-mono uppercase text-champagne-light flex items-center gap-1">
                  <Crown className="w-3 h-3 text-champagne" />
                  Top #1 Actual
                </span>
                {referralOverview.summary.topPromoter ? (
                  <div className="truncate mt-0.5">
                    <span className="text-xs font-bold text-white block truncate">
                      {referralOverview.summary.topPromoter.name}
                    </span>
                    <span className="text-[10px] font-mono text-champagne-light">
                      {referralOverview.summary.topPromoter.score} pts · {referralOverview.summary.topPromoter.code}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs font-mono text-zinc-500 block mt-1">Sin datos</span>
                )}
              </div>
            </div>

            <div className="shrink-0">
              <Link href="/admin/referrals">
                <Button variant="champagne" size="sm" className="w-full lg:w-auto">
                  <span>Ver Ranking QR</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Segmentación RFM Automática</CardTitle>
                <CardDescription>
                  Clasificación basada en Recencia, Frecuencia y Volumen de Visitas.
                </CardDescription>
              </div>
              <Badge variant="tactical">Algoritmo RFM</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg bg-surface-100 border border-purple-500/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-champagne" />
                    Champions / VIPs
                  </span>
                  <span className="text-xs font-mono font-bold text-white bg-purple-500/20 px-2 py-0.5 rounded">
                    {champions.length}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Clientes frecuentes de alto impacto y máxima recurrencia.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-surface-100 border border-emerald-500/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Clientes Leales
                  </span>
                  <span className="text-xs font-mono font-bold text-white bg-emerald-500/20 px-2 py-0.5 rounded">
                    {loyal.length}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Responden positivamente a recompensas y promociones recurrentes.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-surface-100 border border-amber-500/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    En Riesgo de Abandono
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded">
                    {atRisk.length}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Eran clientes asiduos y llevan más de 20 días sin visitar el local.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-surface-100 border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-zinc-400">Dormidos / Inactivos</span>
                  <span className="text-xs font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded">
                    {hibernating.length}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Más de 45 días sin consumo. Requieren incentivo de retorno.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle>Campañas de Retención en 1 Clic</CardTitle>
            <CardDescription>
              Disparo directo a pantalla de bloqueo vía APNs y Google Wallet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <span className="text-xs font-bold text-amber-300 block mb-1">
                Reactivar Segmento &quot;En Riesgo&quot;
              </span>
              <p className="text-[11px] text-zinc-300 mb-2.5">
                Envía una notificación push con beneficio de retorno a los {atRisk.length} clientes en riesgo.
              </p>
              <Button
                variant="champagne"
                size="sm"
                isLoading={sendingCampaign === 'at_risk'}
                disabled={sendingCampaign !== null}
                onClick={() =>
                  void triggerSegmentPush(
                    'at_risk',
                    `¡Te extrañamos en ${merchant?.name || 'nuestro club'}!`,
                    'Vuelve esta semana y recibe un beneficio especial en tu próxima visita.'
                  )
                }
                className="w-full text-zinc-950 font-bold text-xs"
              >
                <BellRing className="w-3.5 h-3.5 mr-1 text-zinc-950" />
                Disparar Push de Reactivación
              </Button>
            </div>

            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <span className="text-xs font-bold text-purple-300 block mb-1">Cumpleañeros del Mes</span>
              <p className="text-[11px] text-zinc-300 mb-2.5">
                Felicita a los cumpleañeros de {currentMonthName} con un sello doble hoy.
              </p>
              <Button
                variant="tactical"
                size="sm"
                isLoading={sendingCampaign === 'birthday_month'}
                disabled={sendingCampaign !== null}
                onClick={() =>
                  void triggerSegmentPush(
                    'birthday_month',
                    `🎂 ¡Feliz Cumpleaños de parte de ${merchant?.name || 'nosotros'}!`,
                    'Pasa esta semana y celebra con un beneficio especial en tu tarjeta.'
                  )
                }
                className="w-full text-xs"
              >
                <Gift className="w-3.5 h-3.5 mr-1 text-champagne" />
                Disparar Push de Cumpleaños
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Historial de Visitas Selladas</CardTitle>
                <CardDescription>Tickets registrados y validados en el POS.</CardDescription>
              </div>
              <Badge variant="default">{transactions.length} registros</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className="p-6 text-center text-zinc-500 text-xs font-mono">
                Aún no hay visitas registradas en el POS.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                {transactions.slice(0, 8).map((tx) => {
                  const customer = customers.find((c) => c.id === tx.customer_id);
                  return (
                    <div
                      key={tx.id}
                      className="p-3 bg-surface-100 rounded-lg border border-white/5 flex items-center justify-between text-xs font-mono"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Receipt className="w-3.5 h-3.5 text-brand-400" />
                          <span className="font-bold text-white">{tx.ticket_number}</span>
                          <span className="text-[10px] text-zinc-400">
                            {customer?.full_name || 'Cliente'}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 block mt-0.5">
                          {new Date(tx.created_at).toLocaleTimeString('es-CO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          · +{tx.stamps_awarded} sello (Balance: {tx.balance_after})
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-400">
                          {tx.amount > 0 ? formatCurrency(tx.amount) : 'Consumo base'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Monitor Antifraude en Vivo</CardTitle>
                <CardDescription>Intentos bloqueados de cooldown o tickets duplicados.</CardDescription>
              </div>
              <Badge variant="danger">{fraudAlerts.length} bloqueos</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
              {fraudAlerts.length === 0 ? (
                <div className="p-6 text-center text-zinc-500 text-xs font-mono">
                  No hay alertas de fraude recientes. El sistema opera seguro.
                </div>
              ) : (
                fraudAlerts.slice(0, 8).map((fa) => (
                  <div
                    key={fa.id}
                    className="p-3 bg-red-500/10 rounded-lg border border-red-500/20 text-xs font-mono text-left"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-red-300 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                        {fa.alert_type.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="text-[10px] text-red-400 uppercase font-bold">
                        Severidad {fa.severity}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 block">
                      {new Date(fa.created_at).toLocaleString('es-CO')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
