'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Trophy,
  QrCode,
  UserPlus,
  Users,
  Settings2,
  Download,
  RefreshCw,
  Search,
  Eye,
  CheckCircle2,
  RotateCcw,
  Ban,
  Trash2,
  AlertTriangle,
  Database,
  Sparkles,
  TrendingUp,
  Store,
  ScanLine,
  Award,
  Loader2,
  AlertCircle,
  Copy,
  Target,
  Crown,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CampaignConfigPanel } from '@/components/referrals/CampaignConfigPanel';
import { PromoterQrCardModal, type PromoterQrCardTarget } from '@/components/referrals/PromoterQrCardModal';
import { PromoterDetailDrawer } from '@/components/referrals/PromoterDetailDrawer';
import { AddPromotersModal } from '@/components/referrals/AddPromotersModal';
import {
  REFERRAL_MIGRATION_FILE,
  REFERRAL_MIGRATION_REQUIRED_CODE,
  type PromoterComputedStatus,
  type PromoterMetricsRow,
  type PromoterPrizeStatus,
  type ReferralCampaign,
  type ReferralMetricType,
  type ReferralOverviewResponse,
} from '@/types/referrals';

type FilterTab = 'all' | 'qualified' | 'almost' | 'flagged' | 'awarded';

function getMetricLabel(metric: ReferralMetricType): string {
  switch (metric) {
    case 'unique_visits':
      return 'Visitas únicas';
    case 'pos_verified_visits':
      return 'Visitas en tienda (POS)';
    default:
      return 'Registros nuevos';
  }
}

function getMetricShortLabel(metric: ReferralMetricType): string {
  switch (metric) {
    case 'unique_visits':
      return 'únicos';
    case 'pos_verified_visits':
      return 'en tienda';
    default:
      return 'registros';
  }
}

function getStatusDisplay(status: PromoterComputedStatus): {
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

function getBarColorClass(status: PromoterComputedStatus): string {
  switch (status) {
    case 'awarded':
      return 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-glow-emerald';
    case 'qualified':
      return 'bg-gradient-to-t from-champagne-dark to-champagne-light shadow-glow-gold';
    case 'almost':
      return 'bg-gradient-to-t from-brand-600 to-brand-400 shadow-glow-purple';
    case 'flagged':
      return 'bg-gradient-to-t from-amber-600 to-amber-400';
    case 'disqualified':
      return 'bg-rose-500/40';
    default:
      return 'bg-gradient-to-t from-zinc-700 to-zinc-500';
  }
}

export default function AdminReferralsPage() {
  const [overview, setOverview] = useState<ReferralOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState<{
    message: string;
    migrationFile: string;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals / Drawers
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [addModalState, setAddModalState] = useState<{
    open: boolean;
    mode: 'single' | 'batch';
  }>({ open: false, mode: 'single' });
  const [qrTarget, setQrTarget] = useState<PromoterQrCardTarget | null>(null);
  const [detailPromoterId, setDetailPromoterId] = useState<string | null>(null);

  // Inline action states
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const fetchOverview = useCallback(async (silent = false, signal?: AbortSignal) => {
    try {
      if (!silent) setIsSyncing(true);
      const res = await fetch('/api/v1/admin/referrals', {
        cache: 'no-store',
        credentials: 'include',
        signal,
      });
      const data = await res.json();

      if (res.status === 503 || data?.error === REFERRAL_MIGRATION_REQUIRED_CODE) {
        setMigrationRequired({
          message:
            data?.message ||
            'Aplica la migración SQL de Embajadores QR en Supabase para habilitar este módulo.',
          migrationFile: data?.migrationFile || REFERRAL_MIGRATION_FILE,
        });
        setLoadError(null);
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'No se pudo cargar el tablero de embajadores');
      }

      setMigrationRequired(null);
      setLoadError(null);
      setOverview({
        campaign: data.campaign,
        merchant: data.merchant,
        summary: data.summary,
        promoters: data.promoters || [],
      });
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setLoadError(err instanceof Error ? err.message : 'Error al conectar con el servidor');
    } finally {
      setIsLoading(false);
      if (!silent) setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchOverview(true, controller.signal);

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void fetchOverview(true, controller.signal);
      }
    }, 10000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchOverview]);

  const promoters = useMemo(() => overview?.promoters ?? [], [overview]);
  const campaign = overview?.campaign ?? null;
  const summary = overview?.summary ?? null;
  const merchantName = overview?.merchant?.name || 'Fidelizia';

  // Top 3 active non-disqualified promoters for the podium
  const podiumPromoters = useMemo(() => {
    return promoters
      .filter((row) => row.promoter.is_active && row.computedStatus !== 'disqualified')
      .slice(0, 3);
  }, [promoters]);

  // Filter counts
  const filterCounts = useMemo(() => {
    const counts = {
      all: promoters.length,
      qualified: 0,
      almost: 0,
      flagged: 0,
      awarded: 0,
    };
    for (const row of promoters) {
      if (row.computedStatus === 'qualified' || row.computedStatus === 'awarded' || row.isWinner) {
        counts.qualified += 1;
      }
      if (row.computedStatus === 'almost') counts.almost += 1;
      if (row.computedStatus === 'flagged' || row.isSuspicious) counts.flagged += 1;
      if (row.computedStatus === 'awarded') counts.awarded += 1;
    }
    return counts;
  }, [promoters]);

  // Filtered ranking table rows
  const filteredPromoters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return promoters.filter((row) => {
      if (activeFilter === 'qualified') {
        if (
          row.computedStatus !== 'qualified' &&
          row.computedStatus !== 'awarded' &&
          !row.isWinner
        ) {
          return false;
        }
      } else if (activeFilter === 'almost') {
        if (row.computedStatus !== 'almost') return false;
      } else if (activeFilter === 'flagged') {
        if (row.computedStatus !== 'flagged' && !row.isSuspicious) return false;
      } else if (activeFilter === 'awarded') {
        if (row.computedStatus !== 'awarded') return false;
      }

      if (!q) return true;
      return (
        row.promoter.name.toLowerCase().includes(q) ||
        row.promoter.code.toLowerCase().includes(q) ||
        (row.promoter.alias && row.promoter.alias.toLowerCase().includes(q)) ||
        (row.promoter.phone && row.promoter.phone.toLowerCase().includes(q))
      );
    });
  }, [promoters, activeFilter, searchQuery]);

  // Chart scale calculations
  const chartScale = useMemo(() => {
    const goal = campaign?.goal_target ?? 10;
    const maxScore = promoters.reduce((acc, r) => Math.max(acc, r.score), 0);
    const ceiling = Math.max(goal, maxScore, 1);
    const niceMax = Math.ceil(ceiling * 1.15);
    const goalPct = Math.min(96, Math.max(4, (goal / niceMax) * 100));
    return { niceMax, goal, goalPct };
  }, [campaign, promoters]);

  const handlePrizeStatusChange = async (
    row: PromoterMetricsRow,
    nextStatus: PromoterPrizeStatus,
    message: string,
    celebrate = false
  ) => {
    setMutatingId(row.promoter.id);
    try {
      const res = await fetch(`/api/v1/admin/referrals/${encodeURIComponent(row.promoter.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prize_status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'No se pudo actualizar el estado');
      }
      if (celebrate) {
        confetti({ particleCount: 55, spread: 65, origin: { y: 0.65 } });
      }
      toast.success(message);
      await fetchOverview(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar estado del premio');
    } finally {
      setMutatingId(null);
    }
  };

  const handleDeletePromoter = async (row: PromoterMetricsRow) => {
    setMutatingId(row.promoter.id);
    try {
      const res = await fetch(`/api/v1/admin/referrals/${encodeURIComponent(row.promoter.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'No se pudo eliminar el embajador');
      }
      toast.success(`Embajador ${row.promoter.name} eliminado`);
      setConfirmDeleteId(null);
      await fetchOverview(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar embajador');
    } finally {
      setMutatingId(null);
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/v1/admin/referrals/export', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('No se pudo generar el archivo CSV');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `embajadores-qr-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Ranking exportado a CSV');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al exportar CSV');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCampaignSaved = (updated: ReferralCampaign) => {
    setOverview((prev) => (prev ? { ...prev, campaign: updated } : prev));
    void fetchOverview(true);
  };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-zinc-400 text-xs font-mono">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        <span>Cargando métricas de Embajadores QR...</span>
      </div>
    );
  }

  if (migrationRequired) {
    return (
      <div className="max-w-2xl mx-auto py-10 text-left">
        <Card className="border-amber-500/40 bg-amber-500/[0.06]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <Badge variant="warning" className="mb-1">
                  Migración SQL Pendiente
                </Badge>
                <CardTitle className="text-lg">
                  Activa las tablas de Embajadores QR en Supabase
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-zinc-300 leading-relaxed">{migrationRequired.message}</p>

            <div className="p-3.5 rounded-lg bg-surface-100 border border-white/10 space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block">
                Archivo de migración a ejecutar en Supabase SQL Editor
              </span>
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-mono text-amber-300 break-all">
                  {migrationRequired.migrationFile}
                </code>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(migrationRequired.migrationFile);
                    toast.success('Ruta copiada');
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar
                </Button>
              </div>
            </div>

            <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside">
              <li>Abre tu proyecto en Supabase → <strong className="text-zinc-200">SQL Editor</strong>.</li>
              <li>Pega y ejecuta el contenido completo de <code className="text-amber-300">{migrationRequired.migrationFile}</code>.</li>
              <li>Haz clic en <strong className="text-zinc-200">Verificar nuevamente</strong> para activar tu campaña de ~20 embajadores.</li>
            </ol>

            <div className="pt-2">
              <Button
                type="button"
                variant="champagne"
                size="md"
                isLoading={isSyncing}
                onClick={() => void fetchOverview(false)}
              >
                <RefreshCw className="w-4 h-4" />
                Verificar nuevamente
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError || !overview || !campaign || !summary) {
    return (
      <div className="p-6 rounded-xl bg-surface-200 border border-red-500/30 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
        <p className="text-sm font-bold text-white">No pudimos cargar Embajadores QR</p>
        <p className="text-xs text-zinc-400">{loadError || 'Error desconocido'}</p>
        <Button size="sm" variant="secondary" onClick={() => void fetchOverview(false)}>
          Reintentar
        </Button>
      </div>
    );
  }

  const qualifiedTotal = summary.qualifiedCount;
  const metricLabel = getMetricLabel(campaign.metric_type);
  const metricShort = getMetricShortLabel(campaign.metric_type);

  return (
    <div className="space-y-6 text-left">
      {/* Header & Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">
              <Trophy className="w-3 h-3 mr-1" />
              Campaña Embajadores QR
            </Badge>
            <Badge variant={campaign.is_active ? 'success' : 'warning'}>
              {campaign.is_active ? 'Activa' : 'Pausada'}
            </Badge>
            <Badge variant="tactical">
              {campaign.win_mode === 'goal'
                ? `Meta: ${campaign.goal_target} ${metricShort}`
                : `Top ${campaign.top_n} · ${metricLabel}`}
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {campaign.name}
          </h1>
          <p className="text-xs text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-champagne-light font-medium">
              🏆 Premio: {campaign.prize_description}
            </span>
            <span className="text-zinc-600">·</span>
            <span>Métrica ganadora: <strong className="text-zinc-200">{metricLabel}</strong></span>
            {campaign.ends_at && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="font-mono">
                  Cierra: {new Date(campaign.ends_at).toLocaleDateString('es-CO')}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="champagne"
            size="sm"
            onClick={() => setAddModalState({ open: true, mode: 'batch' })}
          >
            <UserPlus className="w-3.5 h-3.5" />
            + Agregar Promotores (1 o Lote)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsConfigOpen(true)}
          >
            <Settings2 className="w-3.5 h-3.5 text-champagne" />
            Configurar Premio
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            isLoading={isExporting}
            disabled={promoters.length === 0}
            onClick={() => void handleExportCsv()}
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSyncing}
            onClick={() => void fetchOverview(false)}
            title="Actualizar métricas"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-brand-400' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
        </div>
      </div>

      {/* 1. Top KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card className="p-4 bg-surface-200/90">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Escaneos QR</span>
            <ScanLine className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">{summary.totalScans}</div>
          <div className="text-[11px] text-zinc-500 font-mono mt-1">
            {summary.activePromoters} embajadores activos
          </div>
        </Card>

        <Card className="p-4 bg-surface-200/90">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Visitas Únicas</span>
            <QrCode className="w-4 h-4 text-brand-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-brand-300 mt-2">
            {summary.totalUniqueVisits}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono mt-1">Deduplicadas por día</div>
        </Card>

        <Card className="p-4 bg-surface-200/90">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Registros Nuevos</span>
            <Users className="w-4 h-4 text-champagne" />
          </div>
          <div className="text-2xl font-bold font-mono text-champagne-light mt-2">
            {summary.totalNewCustomers}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono mt-1">
            Conv. global: {summary.overallConversionRate}%
          </div>
        </Card>

        <Card className="p-4 bg-surface-200/90">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Visitas en Tienda</span>
            <Store className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-2">
            {summary.totalPosVerifiedVisits}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono mt-1">Sellados en POS</div>
        </Card>

        <Card className="p-4 bg-surface-200/90 border-champagne/25 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-champagne-light">
            <span className="text-[11px] font-mono uppercase tracking-wider">Calificados</span>
            <Award className="w-4 h-4 text-champagne" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">
            {qualifiedTotal}{' '}
            <span className="text-sm text-zinc-500 font-normal">/ {summary.totalPromoters}</span>
          </div>
          <div className="text-[11px] text-zinc-400 font-mono mt-1">
            {summary.awardedCount} entregados · {summary.almostCount} cerca
          </div>
        </Card>
      </div>

      {/* Empty Onboarding State when 0 promoters */}
      {promoters.length === 0 ? (
        <Card className="p-8 sm:p-12 text-center border-dashed border-champagne/30 bg-gradient-to-b from-surface-200/95 to-brand-950/20">
          <div className="w-14 h-14 rounded-2xl bg-champagne/15 border border-champagne/35 flex items-center justify-center mx-auto mb-4 shadow-glow-gold">
            <Sparkles className="w-7 h-7 text-champagne" />
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            Agrega tus 20 embajadores en lote en 10 segundos
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto mt-2 leading-relaxed">
            Cada embajador recibe un enlace corto único (<code className="text-brand-300 font-mono">/r/CODIGO</code>)
            y una tarjeta QR descargable en alta definición lista para WhatsApp. Aquí verás en vivo quién alcanza la
            meta del premio.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <Button
              type="button"
              variant="champagne"
              size="lg"
              onClick={() => setAddModalState({ open: true, mode: 'batch' })}
            >
              <Users className="w-4 h-4" />
              Pegar Lista en Lote (hasta 50)
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => setAddModalState({ open: true, mode: 'single' })}
            >
              <UserPlus className="w-4 h-4 text-brand-400" />
              Agregar 1 Embajador
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* 2. Podio Top 3 */}
          {podiumPromoters.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {podiumPromoters.map((row, idx) => {
                const medalStyles = [
                  {
                    place: '1° LUGAR · ORO',
                    border: 'border-champagne/50 shadow-glow-gold',
                    bg: 'bg-gradient-to-br from-champagne/[0.12] via-surface-200 to-surface-200',
                    accent: 'text-champagne-light',
                    pill: 'bg-champagne/20 text-champagne-light border-champagne/40',
                  },
                  {
                    place: '2° LUGAR · PLATA',
                    border: 'border-zinc-400/35',
                    bg: 'bg-gradient-to-br from-zinc-400/[0.08] via-surface-200 to-surface-200',
                    accent: 'text-zinc-200',
                    pill: 'bg-zinc-400/15 text-zinc-200 border-zinc-400/30',
                  },
                  {
                    place: '3° LUGAR · BRONCE',
                    border: 'border-amber-700/45',
                    bg: 'bg-gradient-to-br from-amber-700/[0.10] via-surface-200 to-surface-200',
                    accent: 'text-amber-400',
                    pill: 'bg-amber-700/20 text-amber-300 border-amber-600/35',
                  },
                ][idx];
                const statusBadge = getStatusDisplay(row.computedStatus);

                return (
                  <div
                    key={row.promoter.id}
                    className={`rounded-lg border p-5 transition-all hover:border-white/25 ${medalStyles.border} ${medalStyles.bg}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${medalStyles.pill}`}
                      >
                        <Crown className="w-3 h-3" />
                        {medalStyles.place}
                      </span>
                      <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                    </div>

                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-extrabold text-white truncate">
                          {row.promoter.name}
                        </h3>
                        <p className="text-xs font-mono text-zinc-400 truncate mt-0.5">
                          {row.promoter.code}
                          {row.promoter.alias ? ` · ${row.promoter.alias}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-2xl font-mono font-extrabold leading-none ${medalStyles.accent}`}>
                          {row.score}
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400 uppercase">
                          {metricShort}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                        <span>
                          Meta: {row.score}/{row.target} ({row.progressPct}%)
                        </span>
                        <span>Conv: {row.conversionRate}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-surface-300 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            idx === 0 ? 'bg-champagne' : idx === 1 ? 'bg-zinc-300' : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(100, row.progressPct)}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-zinc-500">
                        {row.uniqueVisits} únicos · {row.posVerifiedVisits} POS
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setQrTarget({
                              id: row.promoter.id,
                              name: row.promoter.name,
                              code: row.promoter.code,
                              alias: row.promoter.alias,
                              phone: row.promoter.phone,
                            })
                          }
                          className="h-7 px-2 text-[11px]"
                        >
                          <QrCode className="w-3.5 h-3.5 text-brand-400" />
                          QR
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setDetailPromoterId(row.promoter.id)}
                          className="h-7 px-2.5 text-[11px]"
                        >
                          Ver detalle
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3. Gráfico Comparativo de los ~20 Promotores con Línea de Meta */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    <TrendingUp className="w-4 h-4 text-champagne" />
                    Comparativa de Embajadores vs. Meta del Premio
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Todos los embajadores ordenados por <strong className="text-zinc-200">{metricLabel}</strong>. Haz clic en cualquier barra para auditar sus referidos.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-zinc-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-champagne" />
                    Calificado
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
                    Entregado
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-brand-400" />
                    Cerca (≥70%)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
                    Revisar
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto custom-scrollbar pb-2">
                <div
                  className="relative pt-8 pb-2"
                  style={{ minWidth: `${Math.max(640, promoters.length * 46)}px` }}
                >
                  {/* Chart Plot Area */}
                  <div className="relative h-56 border-b border-white/10 flex items-end gap-1.5 sm:gap-2 px-2">
                    {/* Horizontal grid guidelines */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-1/4 border-t border-white/[0.04]" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-2/4 border-t border-white/[0.04]" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-3/4 border-t border-white/[0.04]" />

                    {/* Dashed Goal Target Line */}
                    <div
                      className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-champagne/80 z-10 flex justify-end"
                      style={{ bottom: `${chartScale.goalPct}%` }}
                    >
                      <span className="-mt-6 mr-1 px-2 py-0.5 rounded bg-surface-100/95 border border-champagne/50 text-[10px] font-mono font-bold text-champagne-light shadow-sm inline-flex items-center gap-1">
                        <Target className="w-3 h-3 text-champagne" />
                        META: {chartScale.goal}
                      </span>
                    </div>

                    {/* Bars for ALL promoters */}
                    {promoters.map((row) => {
                      const heightPct =
                        row.score > 0
                          ? Math.max(4, Math.min(100, (row.score / chartScale.niceMax) * 100))
                          : 2;

                      return (
                        <button
                          key={row.promoter.id}
                          type="button"
                          onClick={() => setDetailPromoterId(row.promoter.id)}
                          title={`#${row.rank} ${row.promoter.name} (${row.promoter.code}) — ${row.score} ${metricShort} · Conv ${row.conversionRate}%`}
                          className="group flex-1 min-w-[34px] h-full flex flex-col justify-end items-center focus:outline-none"
                        >
                          <span className="text-[10px] font-mono font-bold text-zinc-300 group-hover:text-white mb-1 transition-colors">
                            {row.score}
                          </span>
                          <div
                            className={`w-full max-w-[32px] rounded-t-sm transition-all duration-300 group-hover:brightness-125 ${getBarColorClass(
                              row.computedStatus
                            )}`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </button>
                      );
                    })}
                  </div>

                  {/* X-axis labels */}
                  <div className="flex items-start gap-1.5 sm:gap-2 px-2 pt-2">
                    {promoters.map((row) => {
                      const firstName = row.promoter.name.split(' ')[0] || row.promoter.code;
                      return (
                        <button
                          key={`${row.promoter.id}-label`}
                          type="button"
                          onClick={() => setDetailPromoterId(row.promoter.id)}
                          className="flex-1 min-w-[34px] text-center group focus:outline-none"
                        >
                          <span className="text-[10px] font-mono text-zinc-400 group-hover:text-white block truncate">
                            {firstName.slice(0, 8)}
                          </span>
                          <span className="text-[9px] font-mono text-zinc-600 block">
                            #{row.rank}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. Tabla Ranking Completa (sin paginación molesta para ~20 filas) */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    Ranking Completo de Embajadores ({filteredPromoters.length})
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Embudo de conversión, progreso hacia el premio, semáforo antifraude y entregas en 1 clic.
                  </CardDescription>
                </div>

                <div className="relative w-full md:w-64">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Buscar embajador por nombre, código o teléfono"
                    placeholder="Buscar nombre, código, teléfono..."
                    className="w-full bg-surface-100 border border-white/10 rounded pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap gap-2 pt-3 text-xs font-mono">
                {(
                  [
                    { key: 'all', label: `Todos (${filterCounts.all})` },
                    { key: 'qualified', label: `🏆 Ganadores / Calificados (${filterCounts.qualified})` },
                    { key: 'almost', label: `🔥 Cerca ≥70% (${filterCounts.almost})` },
                    { key: 'flagged', label: `⚠️ En revisión (${filterCounts.flagged})` },
                    { key: 'awarded', label: `✅ Premio entregado (${filterCounts.awarded})` },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setActiveFilter(pill.key)}
                    className={`px-3 py-1.5 rounded transition-colors ${
                      activeFilter === pill.key
                        ? 'bg-brand-500 text-white font-bold shadow-glow-purple'
                        : 'bg-surface-100 border border-white/[0.08] text-zinc-400 hover:text-white'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {filteredPromoters.length === 0 ? (
                <div className="p-10 text-center text-xs font-mono text-zinc-500">
                  Ningún embajador coincide con los filtros seleccionados.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-100 border-y border-white/[0.06] text-zinc-400 font-mono uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4 w-14">Pos</th>
                        <th className="py-3 px-4">Embajador</th>
                        <th className="py-3 px-4">Embudo (E / Ú / R / POS / %)</th>
                        <th className="py-3 px-4 min-w-[160px]">Progreso Meta</th>
                        <th className="py-3 px-4">Estado Premio</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {filteredPromoters.map((row) => {
                        const statusDisplay = getStatusDisplay(row.computedStatus);
                        const isRowBusy = mutatingId === row.promoter.id;
                        const isConfirmingDelete = confirmDeleteId === row.promoter.id;

                        return (
                          <tr
                            key={row.promoter.id}
                            className="hover:bg-white/[0.025] transition-colors align-middle"
                          >
                            {/* Rank */}
                            <td className="py-3.5 px-4 font-mono">
                              <span
                                className={`inline-flex items-center justify-center w-8 h-7 rounded font-bold text-xs ${
                                  row.rank === 1
                                    ? 'bg-champagne/20 text-champagne-light border border-champagne/40'
                                    : row.rank === 2
                                      ? 'bg-zinc-400/15 text-zinc-200 border border-zinc-400/30'
                                      : row.rank === 3
                                        ? 'bg-amber-700/20 text-amber-300 border border-amber-600/35'
                                        : 'bg-surface-100 text-zinc-400 border border-white/5'
                                }`}
                              >
                                #{row.rank}
                              </span>
                            </td>

                            {/* Promoter info */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setDetailPromoterId(row.promoter.id)}
                                  className="font-semibold text-white hover:text-brand-300 transition-colors text-left"
                                >
                                  {row.promoter.name}
                                </button>
                                {!row.promoter.is_active && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                    Pausado
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 font-mono text-[11px] text-zinc-400 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-300 border border-brand-500/25">
                                  {row.promoter.code}
                                </span>
                                {row.promoter.alias && (
                                  <span className="text-zinc-400">{row.promoter.alias}</span>
                                )}
                                {row.promoter.phone && (
                                  <span className="text-zinc-500">{row.promoter.phone}</span>
                                )}
                              </div>
                            </td>

                            {/* Funnel metrics */}
                            <td className="py-3.5 px-4 font-mono">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className="px-1.5 py-0.5 rounded bg-surface-100 border border-white/5 text-zinc-300"
                                  title="Escaneos totales"
                                >
                                  {row.totalScans} <span className="text-zinc-500 text-[10px]">esc</span>
                                </span>
                                <span
                                  className="px-1.5 py-0.5 rounded bg-surface-100 border border-white/5 text-brand-300"
                                  title="Visitas únicas diarias"
                                >
                                  {row.uniqueVisits} <span className="text-zinc-500 text-[10px]">ún</span>
                                </span>
                                <span
                                  className="px-1.5 py-0.5 rounded bg-surface-100 border border-white/5 text-champagne-light font-bold"
                                  title="Clientes nuevos registrados"
                                >
                                  {row.newCustomers} <span className="text-zinc-500 text-[10px]">reg</span>
                                </span>
                                <span
                                  className="px-1.5 py-0.5 rounded bg-surface-100 border border-white/5 text-emerald-400"
                                  title="Visitas verificadas en tienda POS"
                                >
                                  {row.posVerifiedVisits}{' '}
                                  <span className="text-zinc-500 text-[10px]">POS</span>
                                </span>
                                <span className="text-[11px] text-zinc-400" title="Tasa de conversión">
                                  {row.conversionRate}%
                                </span>
                              </div>
                            </td>

                            {/* Progress */}
                            <td className="py-3.5 px-4 font-mono">
                              <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="font-bold text-white">
                                  {row.score} / {row.target}
                                </span>
                                <span className="text-zinc-400">{row.progressPct}%</span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-surface-300 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    row.computedStatus === 'awarded'
                                      ? 'bg-emerald-400'
                                      : row.computedStatus === 'qualified'
                                        ? 'bg-champagne'
                                        : row.computedStatus === 'flagged'
                                          ? 'bg-amber-400'
                                          : row.computedStatus === 'disqualified'
                                            ? 'bg-rose-500/50'
                                            : 'bg-brand-500'
                                  }`}
                                  style={{ width: `${Math.min(100, row.progressPct)}%` }}
                                />
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col items-start gap-1">
                                <Badge variant={statusDisplay.variant}>{statusDisplay.label}</Badge>
                                {row.isSuspicious && row.suspiciousReasons.length > 0 && (
                                  <span
                                    className="text-[10px] text-amber-300/90 inline-flex items-center gap-1"
                                    title={row.suspiciousReasons.join(' · ')}
                                  >
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    {row.suspiciousReasons[0].slice(0, 28)}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Quick Actions */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  title="Ver y descargar Tarjeta QR"
                                  onClick={() =>
                                    setQrTarget({
                                      id: row.promoter.id,
                                      name: row.promoter.name,
                                      code: row.promoter.code,
                                      alias: row.promoter.alias,
                                      phone: row.promoter.phone,
                                    })
                                  }
                                  className="h-7 px-2 text-[11px]"
                                >
                                  <QrCode className="w-3.5 h-3.5 text-brand-400" />
                                  <span className="hidden xl:inline">QR</span>
                                </Button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  title="Ver referidos y auditoría"
                                  onClick={() => setDetailPromoterId(row.promoter.id)}
                                  className="h-7 px-2 text-[11px]"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>

                                {row.promoter.prize_status !== 'awarded' ? (
                                  <Button
                                    type="button"
                                    variant={row.computedStatus === 'qualified' ? 'champagne' : 'outline'}
                                    size="sm"
                                    disabled={isRowBusy}
                                    title="Marcar premio como entregado"
                                    onClick={() =>
                                      void handlePrizeStatusChange(
                                        row,
                                        'awarded',
                                        `¡Premio entregado a ${row.promoter.name}!`,
                                        true
                                      )
                                    }
                                    className="h-7 px-2 text-[11px]"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span className="hidden xl:inline">Entregar</span>
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={isRowBusy}
                                    title="Revertir estado de premio entregado"
                                    onClick={() =>
                                      void handlePrizeStatusChange(
                                        row,
                                        'pending',
                                        `Entrega revertida para ${row.promoter.name}`
                                      )
                                    }
                                    className="h-7 px-2 text-[11px] text-zinc-400 hover:text-white"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </Button>
                                )}

                                {row.promoter.prize_status !== 'disqualified' ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={isRowBusy}
                                    title="Descalificar embajador"
                                    onClick={() =>
                                      void handlePrizeStatusChange(
                                        row,
                                        'disqualified',
                                        `${row.promoter.name} descalificado`
                                      )
                                    }
                                    className="h-7 px-2 text-[11px] text-zinc-500 hover:text-amber-400"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={isRowBusy}
                                    title="Rehabilitar embajador"
                                    onClick={() =>
                                      void handlePrizeStatusChange(
                                        row,
                                        'pending',
                                        `${row.promoter.name} rehabilitado`
                                      )
                                    }
                                    className="h-7 px-2 text-[11px] text-emerald-400"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </Button>
                                )}

                                {isConfirmingDelete ? (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="danger"
                                      size="sm"
                                      disabled={isRowBusy}
                                      onClick={() => void handleDeletePromoter(row)}
                                      className="h-7 px-2 text-[10px]"
                                    >
                                      Confirmar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="h-7 px-1.5 text-[10px]"
                                    >
                                      No
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={isRowBusy}
                                    title="Eliminar embajador"
                                    onClick={() => setConfirmDeleteId(row.promoter.id)}
                                    className="h-7 px-2 text-[11px] text-zinc-500 hover:text-rose-400"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Modals & Drawers */}
      <CampaignConfigPanel
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        campaign={campaign}
        onSaved={handleCampaignSaved}
      />

      <AddPromotersModal
        isOpen={addModalState.open}
        defaultMode={addModalState.mode}
        onClose={() => setAddModalState((prev) => ({ ...prev, open: false }))}
        onCreated={() => void fetchOverview(true)}
      />

      <PromoterQrCardModal
        isOpen={qrTarget !== null}
        onClose={() => setQrTarget(null)}
        promoter={qrTarget}
        merchantName={merchantName}
        campaignName={campaign.name}
        prizeDescription={campaign.prize_description}
      />

      <PromoterDetailDrawer
        promoterId={detailPromoterId}
        onClose={() => setDetailPromoterId(null)}
        onUpdated={() => void fetchOverview(true)}
        onOpenQrCard={(target) => setQrTarget(target)}
      />
    </div>
  );
}
