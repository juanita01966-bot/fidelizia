'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Users, 
  TrendingUp, 
  ShieldCheck, 
  ShieldAlert, 
  BellRing, 
  Gift, 
  Sparkles, 
  ArrowUpRight, 
  Receipt, 
  QrCode, 
  Calendar,
  Send,
  Zap,
  CheckCircle2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getStore } from '@/lib/store/fidelizia-store';
import { soundEngine } from '@/lib/audio/sound-effects';
import { formatCurrency } from '@/lib/utils';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

export default function AdminDashboardPage() {
  const store = getStore();

  const [customers, setCustomers] = useState(store.customers);
  const [passes, setPasses] = useState(store.passes);
  const [transactions, setTransactions] = useState(store.transactions);
  const [fraudAlerts, setFraudAlerts] = useState(store.fraudAlerts);
  const [reservations, setReservations] = useState(store.reservations);

  useEffect(() => {
    const update = () => {
      setCustomers([...store.customers]);
      setPasses([...store.passes]);
      setTransactions([...store.transactions]);
      setFraudAlerts([...store.fraudAlerts]);
      setReservations([...store.reservations]);
    };
    return store.subscribe(update);
  }, [store]);

  // Segmentación RFM
  const champions = customers.filter((c) => c.rfm_segment === 'champion');
  const loyal = customers.filter((c) => c.rfm_segment === 'loyal');
  const atRisk = customers.filter((c) => c.rfm_segment === 'at_risk');
  const hibernating = customers.filter((c) => c.rfm_segment === 'hibernating');

  // Disparar Push a Clientes En Riesgo
  const handleTriggerAtRiskCampaign = () => {
    try {
      const result = store.sendPushCampaign({
        segment: 'at_risk',
        title: '¡Te extrañamos en Café Canelo!',
        body: 'Vuelve esta semana y recibe tu segundo espresso de cortesía.',
      });

      soundEngine.playRedeemCelebration();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
      });

      toast.success('Notificación Push enviada a clientes En Riesgo', {
        description: `Se han actualizado ${result.recipientsCount} tarjetas en Apple y Google Wallet.`,
      });
    } catch {
      toast.error('Error al enviar campaña push');
    }
  };

  // Disparar Push a Cumpleañeros
  const handleTriggerBirthdayCampaign = () => {
    try {
      const result = store.sendPushCampaign({
        segment: 'all',
        title: '🎂 ¡Feliz Cumpleaños de parte de Café Canelo!',
        body: 'Pasa hoy por tu postre de la casa y suma un sello doble.',
      });

      soundEngine.playScanSuccess();
      toast.success('Notificación de cumpleaños enviada', {
        description: `Enviado a cumpleañeros del mes con éxito.`,
      });
    } catch {
      toast.error('Error al enviar felicitaciones');
    }
  };

  return (
    <div className="space-y-8 text-left">
      {/* Cabecera del Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <Badge variant="tactical" className="mb-2">
            Panel Operativo de Fidelización
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Dashboard CRM & Retención
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Supervisión 360° de clientes, sellos emitidos, geocercas pasivas y candados antifraude.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/scanner/cafe-canelo">
            <Button variant="primary" size="md">
              <QrCode className="w-4 h-4 mr-1.5" />
              Abrir Escáner POS
            </Button>
          </Link>
          <Link href="/join/cafe-canelo" target="_blank">
            <Button variant="secondary" size="md">
              <Users className="w-4 h-4 mr-1.5 text-champagne" />
              Nuevo Cliente (10s)
            </Button>
          </Link>
        </div>
      </div>

      {/* Tarjetas de KPIs Principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-surface-200/90">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Clientes Totales</span>
              <Users className="w-4 h-4 text-purple-400" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono text-white mt-1">
              {customers.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-zinc-500 font-mono">
            <span>{champions.length} VIPs · {atRisk.length} En Riesgo</span>
          </CardContent>
        </Card>

        <Card className="bg-surface-200/90">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Pases en Móviles</span>
              <Sparkles className="w-4 h-4 text-champagne" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono text-white mt-1">
              {passes.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-zinc-500 font-mono">
            <span>Apple & Google Wallet activos</span>
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
            <span>100% de tickets deduplicados</span>
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
            <span>Cooldown & reuso bloqueados</span>
          </CardContent>
        </Card>
      </div>

      {/* MÓDULO RFM & ACCIONES RÁPIDAS DE RETENCIÓN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Matriz RFM */}
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
              {/* Champions */}
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
                  Visitan con alta frecuencia semanal y acumulan el 60% de tus ingresos.
                </p>
              </div>

              {/* Leales */}
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

              {/* En Riesgo */}
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

              {/* Hibernando */}
              <div className="p-3.5 rounded-lg bg-surface-100 border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-zinc-400">
                    Dormidos / Inactivos
                  </span>
                  <span className="text-xs font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded">
                    {hibernating.length}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Más de 45 días sin consumo. Requieren incentivo de impacto para regresar.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Acciones Rápidas con 1 Clic */}
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle>Campañas de Retención en 1 Clic</CardTitle>
            <CardDescription>
              Disparo directo a la pantalla de bloqueo vía APNs y Google Wallet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <span className="text-xs font-bold text-amber-300 block mb-1">Reactivar Segmento &quot;En Riesgo&quot;</span>
              <p className="text-[11px] text-zinc-300 mb-2.5">
                Envía una notificación push con beneficio de retorno a los {atRisk.length} clientes en riesgo.
              </p>
              <Button
                variant="champagne"
                size="sm"
                onClick={handleTriggerAtRiskCampaign}
                className="w-full text-zinc-950 font-bold text-xs"
              >
                <BellRing className="w-3.5 h-3.5 mr-1 text-zinc-950" />
                Disparar Push de Reactivación
              </Button>
            </div>

            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <span className="text-xs font-bold text-purple-300 block mb-1">Cumpleañeros del Mes</span>
              <p className="text-[11px] text-zinc-300 mb-2.5">
                Felicita a los cumpleañeros de Octubre y regálales un sello doble hoy.
              </p>
              <Button
                variant="tactical"
                size="sm"
                onClick={handleTriggerBirthdayCampaign}
                className="w-full text-xs"
              >
                <Gift className="w-3.5 h-3.5 mr-1 text-champagne" />
                Disparar Push de Cumpleaños
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* REGISTRO DE TRANSACCIONES & ALERTAS ANTIFRAUDE EN TIEMPO REAL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Últimas Transacciones */}
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
            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {transactions.slice(0, 6).map((tx) => {
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
                        })} · +{tx.stamps_awarded} sello (Balance: {tx.balance_after})
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
          </CardContent>
        </Card>

        {/* Auditoría Antifraude */}
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
            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {fraudAlerts.length === 0 ? (
                <div className="p-6 text-center text-zinc-500 text-xs font-mono">
                  No hay alertas de fraude recientes. El sistema opera seguro.
                </div>
              ) : (
                fraudAlerts.map((fa) => (
                  <div
                    key={fa.id}
                    className="p-3 bg-red-500/10 rounded-lg border border-red-500/20 text-xs font-mono text-left"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-red-300 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                        {fa.alert_type === 'ticket_reused' && 'TICKET REUTILIZADO'}
                        {fa.alert_type === 'cooldown_violation' && 'VIOLACIÓN DE COOLDOWN 3H'}
                        {fa.alert_type === 'geofence_breach' && 'FUERA DE GEOCERCA LOCAL'}
                      </span>
                      <span className="text-[10px] text-red-400 uppercase font-bold">
                        Severidad {fa.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-300">
                      {fa.alert_type === 'ticket_reused' &&
                        `Intento de registrar la factura duplicada en el terminal.`}
                      {fa.alert_type === 'cooldown_violation' &&
                        `Cliente intentó sumar sello antes de cumplirse el intervalo de 3 horas.`}
                      {fa.alert_type === 'geofence_breach' &&
                        `Escáner activado fuera del radio autorizado de la sede.`}
                    </p>
                    <span className="text-[10px] text-zinc-500 block mt-1">
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
