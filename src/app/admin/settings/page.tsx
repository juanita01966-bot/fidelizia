'use client';

import React, { useState } from 'react';
import { Settings, Shield, MapPin, KeyRound, Clock, Save } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getStore } from '@/lib/store/fidelizia-store';
import { soundEngine } from '@/lib/audio/sound-effects';
import { toast } from 'sonner';

export default function SettingsPage() {
  const store = getStore();

  const [cooldownHours, setCooldownHours] = useState(store.merchant.cooldown_hours);
  const [geofenceMeters, setGeofenceMeters] = useState(store.merchant.scanner_geofence_meters);
  const [googlePlaceId, setGooglePlaceId] = useState(store.merchant.google_place_id || '');
  const [cashierPin, setCashierPin] = useState(store.employees[0]?.pin_hash || '1234');
  const [managerPin, setManagerPin] = useState(store.employees[1]?.pin_hash || '9999');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    store.merchant.cooldown_hours = Number(cooldownHours);
    store.merchant.scanner_geofence_meters = Number(geofenceMeters);
    store.merchant.google_place_id = googlePlaceId.trim() || null;

    if (store.employees[0]) store.employees[0].pin_hash = cashierPin;
    if (store.employees[1]) store.employees[1].pin_hash = managerPin;

    soundEngine.playScanSuccess();
    toast.success('Ajustes operativos actualizados correctamente');
  };

  return (
    <div className="space-y-6 text-left max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-brand-400" />
          Ajustes Operativos & Parámetros Antifraude
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Configura intervalos de cooldown, tolerancias de geocerca y credenciales PIN del personal.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Candados Antifraude */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-400" />
              Parámetros de Seguridad Antifraude
            </CardTitle>
            <CardDescription>
              Ajusta los límites estrictos que previenen sellos ficticios o colusión entre cajeros y clientes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">
                  Cooldown Temporal entre Visitas (Horas)
                </label>
                <input
                  type="number"
                  min="1"
                  max="48"
                  value={cooldownHours}
                  onChange={(e) => setCooldownHours(Number(e.target.value))}
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
                />
                <span className="text-[10px] text-zinc-500 block mt-1">
                  Tiempo mínimo que un cliente debe esperar antes de que el escáner le sume otro sello.
                </span>
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">
                  Radio de Geocerca del Escáner (Metros)
                </label>
                <input
                  type="number"
                  min="30"
                  max="2000"
                  step="10"
                  value={geofenceMeters}
                  onChange={(e) => setGeofenceMeters(Number(e.target.value))}
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
                />
                <span className="text-[10px] text-zinc-500 block mt-1">
                  Distancia máxima permitida entre el dispositivo del cajero y la sede física.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PINs de Empleados */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-purple-400" />
              PINs de Autorización del Personal
            </CardTitle>
            <CardDescription>
              Claves de 4 dígitos para cajeros y supervisores en el punto de venta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">
                  PIN de Cajero (Mateo)
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={cashierPin}
                  onChange={(e) => setCashierPin(e.target.value)}
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
                />
                <span className="text-[10px] text-zinc-500 block mt-1">Habilita escaneo y suma de sellos.</span>
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">
                  PIN de Gerente (Laura - Autoriza Canjes)
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
                />
                <span className="text-[10px] text-zinc-500 block mt-1">Obligatorio para quemar sellos y entregar premios.</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Google Place ID */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-400" />
              Integración de Google Business Profile (Review Gate)
            </CardTitle>
            <CardDescription>
              Identificador de Google Maps para redirigir automáticamente las calificaciones de 4 y 5 estrellas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <label className="text-xs font-mono text-zinc-300 block mb-1">
                Google Place ID
              </label>
              <input
                type="text"
                value={googlePlaceId}
                onChange={(e) => setGooglePlaceId(e.target.value)}
                placeholder="Ej: ChIJdeK1bW6fP44RkC6cK2JkR1w"
                className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
              />
              <span className="text-[10px] text-zinc-500 block mt-1">
                Encuentra tu Place ID en developers.google.com/maps/documentation/places/web-service/place-id
              </span>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto">
          <Save className="w-4 h-4 mr-2" />
          Guardar Configuración General
        </Button>
      </form>
    </div>
  );
}
