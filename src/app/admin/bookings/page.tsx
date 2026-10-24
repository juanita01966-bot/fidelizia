'use client';

import React, { useState } from 'react';
import { Calendar, Clock, Users, Check, X, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getStore } from '@/lib/store/fidelizia-store';
import { toast } from 'sonner';

export default function AdminBookingsPage() {
  const store = getStore();
  const [reservations, setReservations] = useState(store.reservations);

  const handleUpdateStatus = (id: string, newStatus: 'confirmed' | 'completed' | 'cancelled') => {
    const res = store.reservations.find((r) => r.id === id);
    if (res) {
      res.status = newStatus;
      setReservations([...store.reservations]);
      toast.success(`Reserva marcada como ${newStatus}`);
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-purple-400" />
            Gestión de Reservas & Sincronización Wallet
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Supervisa las citas y mesas reservadas que impactan dinámicamente las tarjetas de tus clientes.
          </p>
        </div>

        <Badge variant="tactical">{reservations.length} Reservas Registradas</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-surface-100 border-b border-white/5 text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Fecha y Hora</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Comensales</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Notas</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {reservations.map((res) => {
                  const customer = store.customers.find((c) => c.id === res.customer_id);

                  return (
                    <tr key={res.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 text-white font-bold">
                        {new Date(res.date_time).toLocaleString('es-CO', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-3 px-4 font-sans font-semibold text-zinc-200">
                        {customer?.full_name || 'Cliente'}
                        <span className="block text-[10px] font-mono text-zinc-500">{customer?.phone}</span>
                      </td>
                      <td className="py-3 px-4 text-zinc-300">
                        {res.guests_count} personas
                      </td>
                      <td className="py-3 px-4">
                        {res.status === 'confirmed' && <Badge variant="success">Confirmada</Badge>}
                        {res.status === 'completed' && <Badge variant="tactical">Completada</Badge>}
                        {res.status === 'cancelled' && <Badge variant="danger">Cancelada</Badge>}
                      </td>
                      <td className="py-3 px-4 text-zinc-400 max-w-xs truncate">
                        {res.notes || 'Sin notas especiales'}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1">
                        {res.status === 'confirmed' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateStatus(res.id, 'completed')}
                              className="text-[10px] h-7 px-2 text-emerald-400"
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Completar
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleUpdateStatus(res.id, 'cancelled')}
                              className="text-[10px] h-7 px-2"
                            >
                              <X className="w-3 h-3 mr-1" />
                              Cancelar
                            </Button>
                          </>
                        )}
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
