'use client';

import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, Eye, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getStore } from '@/lib/store/fidelizia-store';

export default function FraudAuditPage() {
  const store = getStore();
  const [alerts, setAlerts] = useState(store.fraudAlerts);
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-400" />
            Auditoría de Seguridad & Detección de Fraude
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
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <p className="text-xs text-zinc-500 font-mono text-center py-8">
                No hay incidentes de fraude registrados. El sistema opera seguro.
              </p>
            ) : (
              alerts.map((fa) => {
                const customer = store.customers.find((c) => c.id === fa.customer_id);
                const employee = store.employees.find((e) => e.id === fa.employee_id);
                const isExpanded = selectedAlert === fa.id;

                return (
                  <div
                    key={fa.id}
                    className="p-4 bg-surface-100 rounded-lg border border-red-500/20 text-xs font-mono space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="font-bold text-white uppercase">
                          {fa.alert_type.replace('_', ' ')}
                        </span>
                        <Badge
                          variant={fa.severity === 'high' ? 'danger' : 'warning'}
                        >
                          {fa.severity}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-zinc-400">
                        {new Date(fa.created_at).toLocaleString('es-CO')}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-400 pt-1">
                      <div>
                        <span className="text-zinc-500">Cliente involucrado:</span>{' '}
                        <strong className="text-zinc-200">{customer?.full_name || 'Desconocido'}</strong>
                      </div>
                      <div>
                        <span className="text-zinc-500">Cajero en turno:</span>{' '}
                        <strong className="text-zinc-200">{employee?.name || 'Terminal POS'}</strong>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => setSelectedAlert(isExpanded ? null : fa.id)}
                        className="text-[11px] text-brand-400 hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        {isExpanded ? 'Ocultar Telemetría' : 'Ver Detalles JSON de Telemetría'}
                      </button>

                      {isExpanded && (
                        <pre className="mt-2 p-3 bg-black/60 rounded text-[10px] text-zinc-300 overflow-x-auto border border-white/5">
                          {JSON.stringify(fa.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
