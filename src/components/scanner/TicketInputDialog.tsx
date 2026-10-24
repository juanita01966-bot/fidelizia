'use client';

import React, { useState } from 'react';
import { Receipt, DollarSign, Gift, ShieldAlert, Sparkles, X, Crown, Percent, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency, cn } from '@/lib/utils';
import { getStore, getTierMeta, calculateCustomerTier } from '@/lib/store/fidelizia-store';

interface TicketInputDialogProps {
  isOpen: boolean;
  serialNumber: string;
  onClose: () => void;
  onSubmit: (data: { ticketNumber: string; amount: number }) => void;
  onTriggerRedeem: () => void;
  isRewardReady?: boolean;
  rewardDescription?: string;
  isProcessing?: boolean;
}

export function TicketInputDialog({
  isOpen,
  serialNumber,
  onClose,
  onSubmit,
  onTriggerRedeem,
  isRewardReady = false,
  rewardDescription = 'Recompensa acumulada',
  isProcessing = false,
}: TicketInputDialogProps) {
  const store = getStore();
  const [ticketNumber, setTicketNumber] = useState('');
  const [amount, setAmount] = useState<string>('');

  if (!isOpen) return null;

  // Buscar cliente y pase en el store
  const pass = store.passes.find((p) => p.pass_serial_number === serialNumber);
  const customer = pass ? store.customers.find((c) => c.id === pass.customer_id) : null;
  const currentTier = customer?.loyalty_tier || calculateCustomerTier(pass?.total_rewards_redeemed || 0, store.merchant.tier_config);
  const tierMeta = getTierMeta(currentTier);

  const discountPercent = customer?.discount_percentage || 0;
  const numAmount = parseFloat(amount) || 0;
  const discountAmount = discountPercent > 0 ? Math.round(numAmount * (discountPercent / 100)) : 0;
  const finalAmount = numAmount > 0 ? numAmount - discountAmount : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketNumber.trim()) return;
    onSubmit({
      ticketNumber: ticketNumber.trim(),
      amount: numAmount,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-surface-200 border border-white/10 shadow-doppelrand rounded-xl p-5 text-left relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-brand-500/10 border border-brand-400/30 flex items-center justify-center">
            <Receipt className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Registrar Visita & Factura</h3>
            <span className="text-[10px] font-mono text-zinc-400">{serialNumber}</span>
          </div>
        </div>

        {/* Ficha Resumen del Cliente Identificado */}
        {customer && (
          <div className="mb-3.5 p-3 rounded-lg bg-surface-100 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">Cliente</span>
                <span className="text-xs font-bold text-white">{customer.full_name}</span>
              </div>
              <div
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border',
                  tierMeta.bgColor,
                  tierMeta.color,
                  tierMeta.borderColor
                )}
              >
                <Crown className="w-3 h-3 shrink-0" style={{ color: tierMeta.hex }} />
                <span>{tierMeta.label}</span>
              </div>
            </div>

            {/* Beneficios VIP asignados */}
            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/5">
              {discountPercent > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                  <Percent className="w-2.5 h-2.5" />
                  {discountPercent}% OFF Permanente
                </span>
              )}
              {customer.custom_reward && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-champagne/15 text-champagne-light text-[10px] font-mono">
                  <Gift className="w-2.5 h-2.5" />
                  {customer.custom_reward}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Si el cliente califica para canjear premio */}
        {isRewardReady && (
          <div className="mb-4 p-3 bg-gradient-to-r from-champagne/15 to-amber-500/10 border border-champagne/30 rounded-lg">
            <div className="flex items-start gap-2">
              <Gift className="w-4 h-4 text-champagne shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-champagne-light">¡Meta de Sellos Completada!</p>
                <p className="text-[11px] text-zinc-300 mt-0.5">{rewardDescription}</p>
                <Button
                  variant="champagne"
                  size="sm"
                  onClick={onTriggerRedeem}
                  className="mt-2 w-full text-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-zinc-950" />
                  Canjear Premio (Requiere PIN Gerente)
                </Button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-xs font-mono text-zinc-300 block mb-1">
              Número de Ticket / Factura * (Candado Antifraude)
            </label>
            <input
              type="text"
              required
              value={ticketNumber}
              onChange={(e) => setTicketNumber(e.target.value)}
              placeholder="Ej: FAC-1049"
              className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
            />
            <span className="text-[10px] text-zinc-500 block mt-1">
              El sistema bloquea automáticamente cualquier intento de reutilizar el mismo ticket.
            </span>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-300 block mb-1">
              Monto Consumido COP (Opcional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-zinc-500 text-sm">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25000"
                min="0"
                step="500"
                className="w-full bg-surface-100 border border-white/10 rounded pl-7 pr-3 py-2 text-sm font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Desglose Reactivo de Descuento si aplica */}
            {discountPercent > 0 && numAmount > 0 && (
              <div className="mt-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-mono space-y-0.5">
                <div className="flex justify-between text-zinc-400">
                  <span>Monto base:</span>
                  <span>{formatCurrency(numAmount)}</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>Descuento VIP ({discountPercent}%):</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
                <div className="flex justify-between text-white font-bold pt-1 border-t border-emerald-500/20">
                  <span>Total a cobrar:</span>
                  <span className="text-emerald-300">{formatCurrency(finalAmount)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isProcessing}
              disabled={!ticketNumber.trim() || isProcessing}
              className="flex-1"
            >
              Sumar Sello (+1)
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
