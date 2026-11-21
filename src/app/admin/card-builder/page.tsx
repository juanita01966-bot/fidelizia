'use client';

import React, { useEffect, useState } from 'react';
import { CreditCard, Save, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LivePassPreview } from '@/components/passes/LivePassPreview';
import { soundEngine } from '@/lib/audio/sound-effects';
import { toast } from 'sonner';

export default function CardBuilderPage() {
  const [merchantName, setMerchantName] = useState('Fidelizia');
  const [brandColor, setBrandColor] = useState('#8b5cf6');
  const [stampsNeeded, setStampsNeeded] = useState(10);
  const [rewardDescription, setRewardDescription] = useState('');
  const [passType, setPassType] = useState<'apple' | 'google'>('google');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const colorPresets = [
    { name: 'Púrpura PBR Táctico', value: '#8b5cf6' },
    { name: 'Oro Champaña Cepillado', value: '#d4a373' },
    { name: 'Esmeralda Botánico', value: '#10b981' },
    { name: 'Zafiro Profundo', value: '#3b82f6' },
    { name: 'Carbón Mecha', value: '#3f3f46' },
  ];

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/admin/overview', {
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.merchant) {
          setMerchantName(data.merchant.name);
          setBrandColor(data.merchant.brand_color || '#8b5cf6');
          setStampsNeeded(data.merchant.stamps_needed || 10);
          setRewardDescription(data.merchant.reward_description || '');
        }
      })
      .catch(() => {
        // Ignore abort
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/v1/merchant/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          brand_color: brandColor,
          stamps_needed: Number(stampsNeeded),
          reward_description: rewardDescription.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'No se pudieron guardar los cambios');
      }
      soundEngine.playScanSuccess();
      toast.success('¡Diseño de tarjeta guardado en servidor!', {
        description: `Google Wallet: ${data.googleWalletSync ? 'Sincronizado' : 'Pendiente'} · Pases Apple actualizados: ${data.appleWalletUpdated || 0}`,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error guardando diseño');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center gap-2 text-zinc-400 text-xs font-mono">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        <span>Cargando diseñador de tarjeta...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-brand-400" />
          Diseñador de Tarjeta Digital
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Personaliza la estética, sellos requeridos y recompensas visuales de tus pases en Apple y Google Wallet.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <Card>
          <CardHeader>
            <CardTitle>Parámetros Visuales y Reglas</CardTitle>
            <CardDescription>
              Los cambios se guardan en Supabase y se sincronizan con las tarjetas instaladas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label htmlFor="card-brand-color" className="text-xs font-mono text-zinc-300 block mb-2">
                  Color Primario de la Tarjeta
                </label>
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-8 h-8 rounded-full border border-white/20 shadow-md"
                    style={{ backgroundColor: brandColor }}
                  />
                  <input
                    id="card-brand-color"
                    type="text"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-28 bg-surface-100 border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono text-white"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {colorPresets.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setBrandColor(preset.value)}
                      className="px-2.5 py-1 rounded text-xs border border-white/5 flex items-center gap-1.5 hover:bg-white/5 text-zinc-300 transition-colors"
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: preset.value }} />
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs font-mono text-zinc-300 block mb-1">
                  Cantidad de Sellos para Ganar Premio
                </span>
                <div className="flex gap-2">
                  {[6, 8, 10, 12].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setStampsNeeded(num)}
                      className={`flex-1 py-2 rounded border text-xs font-mono font-bold transition-all ${
                        stampsNeeded === num
                          ? 'bg-brand-500/30 border-brand-400 text-white shadow-glow-purple'
                          : 'bg-surface-100 border-white/5 text-zinc-400'
                      }`}
                    >
                      {num} Sellos
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="card-reward-desc" className="text-xs font-mono text-zinc-300 block mb-1">
                  Descripción del Premio Ganado *
                </label>
                <input
                  id="card-reward-desc"
                  type="text"
                  required
                  value={rewardDescription}
                  onChange={(e) => setRewardDescription(e.target.value)}
                  placeholder="Ej: Café de Especialidad + Croissant de Almendras"
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <span className="text-xs font-mono text-zinc-300 block mb-1.5">Previsualizar en:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPassType('apple')}
                    className={`flex-1 py-2 rounded text-xs font-medium border transition-all ${
                      passType === 'apple'
                        ? 'bg-purple-500/20 border-purple-400 text-white font-bold'
                        : 'bg-surface-100 border-white/5 text-zinc-400'
                    }`}
                  >
                    Apple Wallet (iOS)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPassType('google')}
                    className={`flex-1 py-2 rounded text-xs font-medium border transition-all ${
                      passType === 'google'
                        ? 'bg-purple-500/20 border-purple-400 text-white font-bold'
                        : 'bg-surface-100 border-white/5 text-zinc-400'
                    }`}
                  >
                    Google Wallet (Android)
                  </button>
                </div>
              </div>

              <Button type="submit" variant="primary" size="md" isLoading={isSaving} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                Guardar y Sincronizar Cambios
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col items-center">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3">
            Previsualización Interactiva a 60 FPS
          </span>
          <LivePassPreview
            merchantName={merchantName}
            customerName="Titular VIP"
            passSerialNumber="PASS-PREVIEW-001"
            currentStamps={Math.min(4, stampsNeeded)}
            totalNeeded={stampsNeeded}
            rewardDescription={rewardDescription || 'Premio de Autor'}
            passType={passType}
            brandColor={brandColor}
          />
        </div>
      </div>
    </div>
  );
}
