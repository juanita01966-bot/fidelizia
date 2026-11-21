'use client';

import React, { useEffect, useState } from 'react';
import { Settings, Shield, MapPin, KeyRound, Save, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { soundEngine } from '@/lib/audio/sound-effects';
import type { PublicEmployee } from '@/lib/repositories';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [cooldownHours, setCooldownHours] = useState(3);
  const [geofenceMeters, setGeofenceMeters] = useState(100);
  const [googlePlaceId, setGooglePlaceId] = useState('');
  const [employees, setEmployees] = useState<PublicEmployee[]>([]);
  const [pinUpdates, setPinUpdates] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/admin/overview', {
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.merchant) {
          setCooldownHours(data.merchant.cooldown_hours ?? 3);
          setGeofenceMeters(data.merchant.scanner_geofence_meters ?? 100);
          setGooglePlaceId(data.merchant.google_place_id || '');
        }
        if (data.employees) {
          setEmployees(data.employees);
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
      const settingsRes = await fetch('/api/v1/merchant/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cooldown_hours: Number(cooldownHours),
          scanner_geofence_meters: Number(geofenceMeters),
          google_place_id: googlePlaceId.trim() || null,
        }),
      });
      const settingsJson = await settingsRes.json();
      if (!settingsRes.ok || !settingsJson.success) {
        throw new Error(settingsJson.message || 'No se pudieron guardar los parámetros');
      }

      const pinEntries = Object.entries(pinUpdates).filter(([, pin]) => pin.trim().length > 0);
      for (const [employeeId, newPin] of pinEntries) {
        if (!/^\d{4}$/.test(newPin.trim())) {
          throw new Error('Cada PIN nuevo debe tener exactamente 4 dígitos numéricos');
        }
        const empRes = await fetch('/api/v1/admin/employees', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ employeeId, pin: newPin.trim() }),
        });
        const empJson = await empRes.json();
        if (!empRes.ok || !empJson.success) {
          throw new Error(empJson.message || 'No se pudo actualizar el PIN de un empleado');
        }
      }

      setPinUpdates({});
      soundEngine.playScanSuccess();
      toast.success('Ajustes operativos actualizados de forma segura');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error guardando configuración');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center gap-2 text-zinc-400 text-xs font-mono">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        <span>Cargando ajustes del comercio...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-brand-400" />
          Ajustes Operativos &amp; Parámetros Antifraude
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Configura intervalos de cooldown, tolerancias de geocerca y rotación segura de PINs del personal.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-400" />
              Parámetros de Seguridad Antifraude
            </CardTitle>
            <CardDescription>
              Ajusta los límites estrictos que previenen sellos ficticios o colusión en punto de venta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="settings-cooldown" className="text-xs font-mono text-zinc-300 block mb-1">
                  Cooldown Temporal entre Visitas (Horas)
                </label>
                <input
                  id="settings-cooldown"
                  type="number"
                  min={1}
                  max={48}
                  value={cooldownHours}
                  onChange={(e) => setCooldownHours(Number(e.target.value))}
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
                />
                <span className="text-[10px] text-zinc-500 block mt-1">
                  Tiempo mínimo entre visitas válidas del mismo pase.
                </span>
              </div>

              <div>
                <label htmlFor="settings-geofence" className="text-xs font-mono text-zinc-300 block mb-1">
                  Radio de Geocerca del Escáner (Metros)
                </label>
                <input
                  id="settings-geofence"
                  type="number"
                  min={20}
                  max={5000}
                  step={10}
                  value={geofenceMeters}
                  onChange={(e) => setGeofenceMeters(Number(e.target.value))}
                  className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
                />
                <span className="text-[10px] text-zinc-500 block mt-1">
                  Distancia máxima permitida respecto a la sede activa.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-purple-400" />
              Rotación de PINs del Personal (Cifrado Bcrypt)
            </CardTitle>
            <CardDescription>
              Los PINs actuales nunca se muestran en texto plano. Ingresa un nuevo PIN de 4 dígitos solo para el operador que desees actualizar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {employees.length === 0 ? (
              <p className="text-xs font-mono text-zinc-500">No hay empleados registrados.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {employees.map((emp) => (
                  <div key={emp.id} className="p-3 rounded-lg bg-surface-100 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor={`pin-${emp.id}`} className="text-xs font-mono text-white font-semibold truncate">
                        {emp.name}
                      </label>
                      <Badge variant={emp.role === 'cashier' ? 'default' : 'tactical'}>
                        {emp.role}
                      </Badge>
                    </div>
                    <input
                      id={`pin-${emp.id}`}
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pinUpdates[emp.id] || ''}
                      onChange={(e) =>
                        setPinUpdates((prev) => ({
                          ...prev,
                          [emp.id]: e.target.value.replace(/\D/g, '').slice(0, 4),
                        }))
                      }
                      placeholder="Nuevo PIN (4 dígitos)"
                      className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
              <label htmlFor="settings-place-id" className="text-xs font-mono text-zinc-300 block mb-1">
                Google Place ID
              </label>
              <input
                id="settings-place-id"
                type="text"
                value={googlePlaceId}
                onChange={(e) => setGooglePlaceId(e.target.value)}
                placeholder="Ej: ChIJdeK1bW6fP44RkC6cK2JkR1w"
                className="w-full bg-surface-100 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" variant="primary" size="lg" isLoading={isSaving} className="w-full sm:w-auto">
          <Save className="w-4 h-4 mr-2" />
          Guardar Configuración General
        </Button>
      </form>
    </div>
  );
}
