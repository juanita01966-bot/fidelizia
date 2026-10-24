'use client';

import React, { useState } from 'react';
import { CreditCard, Palette, Sparkles, Check, Save } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LivePassPreview } from '@/components/passes/LivePassPreview';
import { getStore } from '@/lib/store/fidelizia-store';
import { soundEngine } from '@/lib/audio/sound-effects';
import { toast } from 'sonner';

export default function CardBuilderPage() {
  const store = getStore();

  const [brandColor, setBrandColor] = useState(store.merchant.brand_color);
  const [stampsNeeded, setStampsNeeded] = useState(store.merchant.stamps_needed);
  const [rewardDescription, setRewardDescription] = useState(store.merchant.reward_description);
  const [passType, setPassType] = useState<'apple' | 'google'>('apple');

  const colorPresets = [
    { name: 'Púrpura PBR Táctico', value: '#8b5cf6' },
    { name: 'Oro Champaña Cepillado', value: '#d4a373' },
    { name: 'Esmeralda Botánico', value: '#10b981' },
    { name: 'Zafiro Profundo', value: '#3b82f6' },
    { name: 'Carbón Mecha', value: '#3f3f46' },
  ];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    store.merchant.brand_color = brandColor;
    store.merchant.stamps_needed = Number(stampsNeeded);
    store.merchant.reward_description = rewardDescription.trim();

    soundEngine.playScanSuccess();
    toast.success('¡Diseño de tarjeta guardado y sincronizado!', {
      description: 'Los pases en los teléfonos de tus clientes se actualizarán automáticamente.',
    });
  };

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
        {/* Formulario de Configuración */}
        <Card>
          <CardHeader>
            <CardTitle>Parámetros Visuales y Reglas</CardTitle>
            <CardDescription>
              Los cambios impactan en tiempo real los pases instalados en los teléfonos de los clientes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-5">
              {/* Paleta de Color */}
              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-2">Color Primario de la Tarjeta</label>
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-8 h-8 rounded-full border border-white/20 shadow-md"
                    style={{ backgroundColor: brandColor }}
                  />
                  <input
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

              {/* Sellos Requeridos */}
              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">
                  Cantidad de Sellos para Ganar Premio
                </label>
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

              {/* Descripción de la Recompensa */}
              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">
                  Descripción del Premio Ganado *
                </label>
                <input
                  type="text"
                  required
                  value={rewardDescription}
                  onChange={(e) => setRewardDescription(e.target.value)}
                  placeholder="Ej: Café de Especialidad + Croissant de Almendras"
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Tipo de Vista Previa */}
              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1.5">Previsualizar en:</label>
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
                    🍏 Apple Wallet (iOS)
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

              <Button type="submit" variant="primary" size="md" className="w-full">
                <Save className="w-4 h-4 mr-2" />
                Guardar y Sincronizar Cambios
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Simulador en Vivo */}
        <div className="flex flex-col items-center">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3">
            Previsualización Interactiva a 60 FPS
          </span>
          <LivePassPreview
            merchantName={store.merchant.name}
            customerName="Carlos Mendoza"
            passSerialNumber="PASS-CANELO-001"
            currentStamps={Math.min(8, stampsNeeded)}
            totalNeeded={stampsNeeded}
            rewardDescription={rewardDescription}
            passType={passType}
            brandColor={brandColor}
          />
        </div>
      </div>
    </div>
  );
}
