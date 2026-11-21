'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Trophy,
  Target,
  Crown,
  QrCode,
  UserPlus,
  Store,
  Calendar,
  Save,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import type {
  ReferralCampaign,
  ReferralMetricType,
  ReferralWinMode,
} from '@/types/referrals';

export interface CampaignConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: ReferralCampaign;
  onSaved: (updated: ReferralCampaign) => void;
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

const METRIC_OPTIONS: Array<{
  value: ReferralMetricType;
  label: string;
  description: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: 'new_customers',
    label: 'Registros nuevos',
    description: 'Clientes nuevos que escanean el QR y crean su tarjeta de fidelidad.',
    badge: 'Recomendado',
    icon: UserPlus,
  },
  {
    value: 'unique_visits',
    label: 'Visitas únicas QR',
    description: 'Escaneos únicos diarios al enlace corto del embajador (tráfico).',
    icon: QrCode,
  },
  {
    value: 'pos_verified_visits',
    label: 'Visitas en tienda (POS)',
    description: 'Referidos nuevos que además validan al menos 1 consumo en el escáner POS.',
    icon: Store,
  },
];

export function CampaignConfigPanel({
  isOpen,
  onClose,
  campaign,
  onSaved,
}: CampaignConfigPanelProps) {
  const [name, setName] = useState(campaign.name);
  const [prizeDescription, setPrizeDescription] = useState(campaign.prize_description);
  const [metricType, setMetricType] = useState<ReferralMetricType>(campaign.metric_type);
  const [winMode, setWinMode] = useState<ReferralWinMode>(campaign.win_mode);
  const [goalTarget, setGoalTarget] = useState(String(campaign.goal_target));
  const [topN, setTopN] = useState(String(campaign.top_n));
  const [startsAt, setStartsAt] = useState(toDateInputValue(campaign.starts_at));
  const [endsAt, setEndsAt] = useState(toDateInputValue(campaign.ends_at));
  const [isActive, setIsActive] = useState(campaign.is_active);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(campaign.name);
    setPrizeDescription(campaign.prize_description);
    setMetricType(campaign.metric_type);
    setWinMode(campaign.win_mode);
    setGoalTarget(String(campaign.goal_target));
    setTopN(String(campaign.top_n));
    setStartsAt(toDateInputValue(campaign.starts_at));
    setEndsAt(toDateInputValue(campaign.ends_at));
    setIsActive(campaign.is_active);
  }, [isOpen, campaign]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedGoal = Math.max(1, Number.parseInt(goalTarget, 10) || 1);
    const parsedTopN = Math.max(1, Number.parseInt(topN, 10) || 1);

    if (name.trim().length < 2) {
      toast.error('Ingresa un nombre de campaña válido');
      return;
    }
    if (prizeDescription.trim().length < 2) {
      toast.error('Describe el premio de la campaña');
      return;
    }

    const startIso = startsAt ? new Date(`${startsAt}T00:00:00.000Z`).toISOString() : undefined;
    const endIso = endsAt ? new Date(`${endsAt}T23:59:59.000Z`).toISOString() : null;

    if (startIso && endIso && Date.parse(endIso) < Date.parse(startIso)) {
      toast.error('La fecha de cierre debe ser posterior a la fecha de inicio');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/v1/admin/referrals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          campaignId: campaign.id,
          name: name.trim(),
          prize_description: prizeDescription.trim(),
          metric_type: metricType,
          win_mode: winMode,
          goal_target: parsedGoal,
          top_n: parsedTopN,
          starts_at: startIso,
          ends_at: endIso,
          is_active: isActive,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'No se pudo guardar la configuración');
      }

      toast.success('Reglas del premio actualizadas', {
        description: 'El ranking y el estado de calificación se recalcularon en vivo.',
      });
      onSaved(data.campaign ?? campaign);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar campaña');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-config-title"
      onClick={onClose}
    >
      <div
        className="bg-surface-200 border border-white/10 rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto custom-scrollbar shadow-2xl text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between bg-surface-100/70 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-champagne/15 border border-champagne/30 flex items-center justify-center text-champagne">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h3 id="campaign-config-title" className="text-sm font-bold text-white">
                Configurar Campaña y Reglas del Premio
              </h3>
              <p className="text-[11px] text-zinc-400">
                Define qué métrica cuenta y quién califica al premio entre tus embajadores.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar configuración"
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-5">
          {/* Name & Prize */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="camp-name" className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Nombre de la Campaña
              </label>
              <input
                id="camp-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Reto Embajadores Noviembre"
                className="w-full bg-surface-100 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="camp-prize" className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Premio a Entregar
              </label>
              <input
                id="camp-prize"
                type="text"
                required
                value={prizeDescription}
                onChange={(e) => setPrizeDescription(e.target.value)}
                placeholder="Ej: Bono $150.000 + Cena VIP"
                className="w-full bg-surface-100 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-champagne"
              />
            </div>
          </div>

          {/* Winning Metric */}
          <div className="space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 block">
              Métrica Ganadora (Score Principal)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {METRIC_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = metricType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMetricType(opt.value)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selected
                        ? 'bg-brand-500/15 border-brand-400/60 shadow-glow-purple'
                        : 'bg-surface-100 border-white/[0.08] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <Icon className={`w-4 h-4 ${selected ? 'text-brand-300' : 'text-zinc-400'}`} />
                      {opt.badge && <Badge variant="gold">{opt.badge}</Badge>}
                    </div>
                    <div className="text-xs font-bold text-white">{opt.label}</div>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-snug">{opt.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Win Mode + Threshold */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 block">
                Modalidad de Premio
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWinMode('goal')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    winMode === 'goal'
                      ? 'bg-champagne/15 border-champagne/60'
                      : 'bg-surface-100 border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  <Target
                    className={`w-4 h-4 mb-1 ${winMode === 'goal' ? 'text-champagne' : 'text-zinc-400'}`}
                  />
                  <div className="text-xs font-bold text-white">Meta Fija</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    Quien alcance el objetivo gana
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setWinMode('top_n')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    winMode === 'top_n'
                      ? 'bg-champagne/15 border-champagne/60'
                      : 'bg-surface-100 border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  <Crown
                    className={`w-4 h-4 mb-1 ${winMode === 'top_n' ? 'text-champagne' : 'text-zinc-400'}`}
                  />
                  <div className="text-xs font-bold text-white">Top N Ranking</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    Los mejores puestos del podio
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-3 bg-surface-100/70 p-3.5 rounded-lg border border-white/[0.08]">
              {winMode === 'goal' ? (
                <div className="space-y-1.5">
                  <label htmlFor="camp-goal" className="text-xs font-mono uppercase tracking-wider text-champagne-light">
                    Meta para Ganar Premio
                  </label>
                  <input
                    id="camp-goal"
                    type="number"
                    min={1}
                    max={100000}
                    required
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    className="w-full bg-surface-200 border border-champagne/30 rounded-md px-3 py-2 text-base font-mono font-bold text-white focus:outline-none focus:border-champagne"
                  />
                  <p className="text-[11px] text-zinc-400">
                    Se dibuja como línea punteada objetivo en el gráfico comparativo.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label htmlFor="camp-topn" className="text-xs font-mono uppercase tracking-wider text-champagne-light">
                      Cantidad de Ganadores (Top N)
                    </label>
                    <input
                      id="camp-topn"
                      type="number"
                      min={1}
                      max={100}
                      required
                      value={topN}
                      onChange={(e) => setTopN(e.target.value)}
                      className="w-full bg-surface-200 border border-champagne/30 rounded-md px-3 py-1.5 text-base font-mono font-bold text-white focus:outline-none focus:border-champagne"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="camp-goal-ref" className="text-[11px] font-mono text-zinc-400">
                      Meta de referencia visual (opcional)
                    </label>
                    <input
                      id="camp-goal-ref"
                      type="number"
                      min={1}
                      max={100000}
                      value={goalTarget}
                      onChange={(e) => setGoalTarget(e.target.value)}
                      className="w-full bg-surface-200 border border-white/10 rounded-md px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dates & Active state */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="space-y-1.5">
              <label htmlFor="camp-start" className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand-400" />
                Inicio
              </label>
              <input
                id="camp-start"
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full bg-surface-100 border border-white/10 rounded-md px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="camp-end" className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-champagne" />
                Cierre (opcional)
              </label>
              <input
                id="camp-end"
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full bg-surface-100 border border-white/10 rounded-md px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
              />
            </div>

            <label className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-surface-100 border border-white/10 cursor-pointer select-none">
              <div>
                <span className="text-xs font-semibold text-white block">Campaña Activa</span>
                <span className="text-[10px] text-zinc-400">Permite escaneos /r/</span>
              </div>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-brand-500 rounded"
              />
            </label>
          </div>

          <div className="p-3 rounded-lg bg-brand-950/40 border border-brand-500/20 flex items-start gap-2.5 text-xs text-zinc-300">
            <Sparkles className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
            <span>
              Cambiar la métrica o la meta no borra ningún escaneo ni registro: el tablero recalcula
              instantáneamente las posiciones y quién califica al premio.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
            <Button type="button" variant="ghost" size="md" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="champagne" size="md" isLoading={isSaving}>
              <Save className="w-4 h-4" />
              Guardar Reglas
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
