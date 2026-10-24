'use client';

import React, { useState, useEffect } from 'react';
import { Users, Search, Phone, Calendar, Sparkles, Smartphone, CheckCircle2, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getStore } from '@/lib/store/fidelizia-store';
import { Customer } from '@/types/domain';
import { supabase } from '@/lib/supabase/client';

export default function CustomersPage() {
  const store = getStore();
  const [customers, setCustomers] = useState<Customer[]>(store.customers);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSegment, setSelectedSegment] = useState<string>('all');
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchCustomers = async (silent = false) => {
    try {
      if (!silent) setIsSyncing(true);
      const res = await fetch('/api/v1/customers');
      if (res.ok) {
        const data = await res.json();
        if (data.customers) {
          store.syncFromRemote({ customers: data.customers, passes: data.passes });
          setCustomers([...store.customers]);
        }
      }
    } catch (e) {
      console.warn('Error fetching customers:', e);
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  useEffect(() => {
    // 1. Carga inicial
    fetchCustomers(true);

    // 2. Supabase Realtime WebSocket
    let channel: any = null;
    try {
      channel = supabase
        .channel('admin-customers-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
          fetchCustomers(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_passes' }, () => {
          fetchCustomers(true);
        })
        .subscribe();
    } catch (e) {
      console.warn('[Realtime error]:', e);
    }

    // 3. Heartbeat Polling cada 4 segundos
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchCustomers(true);
      }
    }, 4000);

    // 4. BroadcastChannel entre pestañas
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('fidelizia_realtime_sync');
      bc.onmessage = () => fetchCustomers(true);
    } catch (e) {}

    return () => {
      if (channel) supabase.removeChannel(channel);
      clearInterval(interval);
      if (bc) bc.close();
    };
  }, []);

  // Deduplicación blindada
  const deduplicatedCustomers = React.useMemo(() => {
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
            Directorio de Clientes & Segmentación
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Supervisa balances de sellos, fechas de ingreso y segmentación algorítmica RFM.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchCustomers()}
            disabled={isSyncing}
            className="text-xs border border-white/10"
            title="Sincronizar con Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isSyncing ? 'animate-spin text-purple-400' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
          </Button>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o teléfono..."
              className="bg-surface-100 border border-white/10 rounded pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500 w-56 sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Filtros de Segmento */}
      <div className="flex flex-wrap gap-2 text-xs font-mono">
        {['all', 'champion', 'loyal', 'at_risk', 'hibernating', 'new'].map((seg) => (
          <button
            key={seg}
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

      {/* Lista de Clientes */}
      <Card>
        <CardContent className="p-0">
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
                  const customerPasses = store.passes.filter((p) => p.customer_id === cust.id);
                  const primaryPass = customerPasses[0];

                  return (
                    <tr key={cust.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 font-sans font-semibold text-white">
                        {cust.full_name}
                      </td>
                      <td className="py-3 px-4 text-zinc-300">{cust.phone}</td>
                      <td className="py-3 px-4">
                        {cust.rfm_segment === 'champion' && (
                          <Badge variant="tactical">⭐ Champion VIP</Badge>
                        )}
                        {cust.rfm_segment === 'loyal' && (
                          <Badge variant="success">✓ Leal</Badge>
                        )}
                        {cust.rfm_segment === 'at_risk' && (
                          <Badge variant="warning">⚠️ En Riesgo</Badge>
                        )}
                        {cust.rfm_segment === 'hibernating' && (
                          <Badge variant="danger">Inactivo</Badge>
                        )}
                        {cust.rfm_segment === 'new' && (
                          <Badge variant="default">Nuevo</Badge>
                        )}
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
                        {primaryPass ? `${primaryPass.current_stamps}/${store.merchant.stamps_needed}` : '0'}
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
        </CardContent>
      </Card>
    </div>
  );
}
