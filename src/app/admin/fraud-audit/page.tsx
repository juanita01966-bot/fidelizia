'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, AlertTriangle, Eye, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { PublicEmployee } from '@/lib/repositories';
import type { Customer, FraudAlert } from '@/types/domain';
import { toast } from 'sonner';

export default function FraudAuditPage() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<PublicEmployee[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/v1/admin/overview', {
        cache: 'no-store',
        credentials: 'include',
        signal,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'No se pudieron cargar las alertas');
      }
      setAlerts(data.fraudAlerts || []);
      setCustomers(data.customers || []);
      setEmployees(data.employees || []);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      toast.error(err instanceof Error ? err.message : 'Error al cargar auditoría antifraude');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const handleResolve = async (alertId: string) => {
    setResolvingId(alertId);
    try {
      const res = await fetch('/api/v1/admin/fraud-alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ alertId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'No se pudo marcar como resuelta');
      }
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, is_resolved: true } : a)));
      toast.success('Alerta marcada como resuelta');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al resolver alerta');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-400" />
            Auditoría de Seguridad &amp; Detección de Fraude
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Supervisa intentos bloqueados de violación de cooldown, duplicación de facturas y geocercas.
          </p>
        </div>

        <Badge variant="tactical">5 Capas Activas en Servidor</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cooldown Bloqueados</CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-amber-400">
              {alerts.filter((a) => a.alert_type === 'cooldown_violation').length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tickets Duplicados Bloqueados</CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-rose-400">
              {alerts.filter((a) => a.alert_type === 'ticket_reused').length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Violaciones de Geocerca</CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-purple-400">
              {alerts.filter((a) => a.alert_type === 'geofence_breach').length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bitácora de Incidentes Auditados</CardTitle>
          <CardDescription>Registro inmutable con timestamp, severidad y detalles de telemetría.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 flex flex-col items-center gap-2 text-zinc-400 text-xs font-mono">
              <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
              <span>Cargando incidentes...</span>
            </div>
          ) : alerts.length === 0 ? (
            <p className="text-xs text-zinc-500 font-mono text-center py-8">
              No hay incidentes de fraude registrados. El sistema opera seguro.
            </p>
          ) : (
            <div className="space-y-3">
              {alerts.map((fa) => {
                const customer = customers.find((c) => c.id === fa.customer_id);
                const employee = employees.find((e) => e.id === fa.employee_id);
                const isExpanded = selectedAlert === fa.id;

                return (
                  <div
                    key={fa.id}
                    className={`p-4 bg-surface-100 rounded-lg border text-xs font-mono space-y-2 ${
                      fa.is_resolved ? 'border-emerald-500/20 opacity-75' : 'border-red-500/20'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="font-bold text-white uppercase">
                          {fa.alert_type.replace('_', ' ')}
                        </span>
                        <Badge variant={fa.severity === 'high' || fa.severity === 'critical' ? 'danger' : 'warning'}>
                          {fa.severity}
                        </Badge>
                        {fa.is_resolved && <Badge variant="success">Resuelta</Badge>}
                      </div>
                      <span className="text-[10px] text-zinc-400">
                        {new Date(fa.created_at).toLocaleString('es-CO')}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-400 pt-1">
                      <div>
                        <span className="text-zinc-500">Cliente involucrado:</span>{' '}
                        <strong className="text-zinc-200">{customer?.full_name || 'No identificado'}</strong>
                      </div>
                      <div>
                        <span className="text-zinc-500">Operador en turno:</span>{' '}
                        <strong className="text-zinc-200">{employee?.name || 'Terminal POS'}</strong>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedAlert(isExpanded ? null : fa.id)}
                        className="text-[11px] text-brand-400 hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        {isExpanded ? 'Ocultar Telemetría' : 'Ver Detalles JSON de Telemetría'}
                      </button>

                      {!fa.is_resolved && (
                        <Button
                          variant="outline"
                          size="sm"
                          isLoading={resolvingId === fa.id}
                          onClick={() => void handleResolve(fa.id)}
                          className="text-[10px] h-7"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
                          Marcar como Resuelta
                        </Button>
                      )}
                    </div>

                    {isExpanded && (
                      <pre className="mt-2 p-3 bg-black/60 rounded text-[10px] text-zinc-300 overflow-x-auto border border-white/5">
                        {JSON.stringify(fa.details, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
