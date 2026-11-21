'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Search, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Customer, WalletPass } from '@/types/domain';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [passes, setPasses] = useState<WalletPass[]>([]);
  const [stampsNeeded, setStampsNeeded] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSegment, setSelectedSegment] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchCustomers = useCallback(async (silent = false, signal?: AbortSignal) => {
    try {
      if (!silent) setIsSyncing(true);
      const [custRes, overviewRes] = await Promise.all([
        fetch('/api/v1/customers', { cache: 'no-store', credentials: 'include', signal }),
        fetch('/api/v1/merchant/settings', { cache: 'no-store', signal }),
      ]);

      const custData = await custRes.json();
      if (!custRes.ok || !custData.success) {
        throw new Error(custData.message || 'No se pudo cargar el directorio de clientes');
      }

      setCustomers(custData.customers || []);
      setPasses(custData.passes || []);

      if (overviewRes.ok) {
        const settingsData = await overviewRes.json();
        if (settingsData?.merchant?.stamps_needed) {
          setStampsNeeded(settingsData.merchant.stamps_needed);
        }
      }
      setErrorMsg(null);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setErrorMsg(err instanceof Error ? err.message : 'Error de sincronización');
    } finally {
      setIsLoading(false);
      if (!silent) setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCustomers(true, controller.signal);

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void fetchCustomers(true, controller.signal);
      }
    }, 6000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchCustomers]);

  const deduplicatedCustomers = useMemo(() => {
    const cleanDigits = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
    const seen = new Set<string>();
    const result: Customer[] = [];
    for (const c of customers) {
      const phoneDigits = cleanDigits(c.phone);
      const key = phoneDigits.length >= 7 ? phoneDigits : c.id;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(c);
      }
    }
    return result;
  }, [customers]);

  const filteredCustomers = deduplicatedCustomers.filter((c) => {
    const matchesSearch =
      c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm);
    const matchesSegment = selectedSegment === 'all' || c.rfm_segment === selectedSegment;
    return matchesSearch && matchesSegment;
  });

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-400" />
            Directorio de Clientes &amp; Segmentación
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Supervisa balances de sellos, fechas de ingreso y segmentación algorítmica RFM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void fetchCustomers(false)}
            disabled={isSyncing}
            className="text-xs border border-white/10"
            title="Sincronizar con Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isSyncing ? 'animate-spin text-purple-400' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
          </Button>
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Buscar por nombre o teléfono"
              placeholder="Buscar por nombre o teléfono..."
              className="bg-surface-100 border border-white/10 rounded pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500 w-full sm:w-64"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-mono">
        {['all', 'champion', 'loyal', 'at_risk', 'hibernating', 'new'].map((seg) => (
          <button
            key={seg}
            type="button"
            onClick={() => setSelectedSegment(seg)}
            className={`px-3 py-1 rounded transition-colors ${
              selectedSegment === seg
                ? 'bg-brand-500 text-white font-bold shadow-glow-purple'
                : 'bg-surface-100 border border-white/5 text-zinc-400 hover:text-white'
            }`}
          >
            {seg === 'all' ? 'Todos' : seg.toUpperCase()}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 flex flex-col items-center gap-2 text-zinc-400 text-xs font-mono">
              <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
              <span>Cargando clientes...</span>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-12 text-center text-xs font-mono text-zinc-500">
              No se encontraron clientes para los filtros seleccionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-surface-100 border-b border-white/5 text-zinc-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Teléfono / WhatsApp</th>
                    <th className="py-3 px-4">Segmento RFM</th>
                    <th className="py-3 px-4">Pases Activos</th>
                    <th className="py-3 px-4">Sellos Actuales</th>
                    <th className="py-3 px-4">Visitas</th>
                    <th className="py-3 px-4">Fecha Registro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredCustomers.map((cust) => {
                    const customerPasses = passes.filter((p) => p.customer_id === cust.id);
                    const primaryPass = customerPasses[0];

                    return (
                      <tr key={cust.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4 font-sans font-semibold text-white">
                          {cust.full_name}
                        </td>
                        <td className="py-3 px-4 text-zinc-300">{cust.phone}</td>
                        <td className="py-3 px-4">
                          {cust.rfm_segment === 'champion' && <Badge variant="tactical">Champion VIP</Badge>}
                          {cust.rfm_segment === 'loyal' && <Badge variant="success">Leal</Badge>}
                          {cust.rfm_segment === 'at_risk' && <Badge variant="warning">En Riesgo</Badge>}
                          {cust.rfm_segment === 'hibernating' && <Badge variant="danger">Inactivo</Badge>}
                          {cust.rfm_segment === 'new' && <Badge variant="default">Nuevo</Badge>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1.5">
                            {customerPasses.map((p) => (
                              <span
                                key={p.id}
                                className="text-[10px] bg-black/40 border border-white/10 px-1.5 py-0.5 rounded text-zinc-300"
                              >
                                {p.pass_type === 'apple' ? 'Apple Wallet' : 'Google Wallet'}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-bold text-champagne-light">
                          {primaryPass ? `${primaryPass.current_stamps}/${stampsNeeded}` : '0'}
                        </td>
                        <td className="py-3 px-4 text-zinc-300">
                          {primaryPass ? primaryPass.total_visits : 0}
                        </td>
                        <td className="py-3 px-4 text-zinc-500">
                          {new Date(cust.created_at).toLocaleDateString('es-CO')}
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
    </div>
  );
}
