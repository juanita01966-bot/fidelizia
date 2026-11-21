'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, Check, X, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { ReservationWithCustomer } from '@/lib/repositories';
import { toast } from 'sonner';

export default function AdminBookingsPage() {
  const [reservations, setReservations] = useState<ReservationWithCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadBookings = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/v1/bookings', {
        cache: 'no-store',
        credentials: 'include',
        signal,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'No se pudieron cargar las reservas');
      }
      setReservations(data.reservations || []);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      toast.error(err instanceof Error ? err.message : 'Error cargando reservas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadBookings(controller.signal);
    return () => controller.abort();
  }, [loadBookings]);

  const handleUpdateStatus = async (
    id: string,
    newStatus: 'confirmed' | 'completed' | 'cancelled'
  ) => {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/v1/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reservationId: id, status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Error al actualizar estado');
      }
      setReservations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
      );
      toast.success(`Reserva marcada como ${newStatus}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar la reserva');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-purple-400" />
            Gestión de Reservas &amp; Sincronización Wallet
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Supervisa las citas y mesas reservadas que impactan dinámicamente las tarjetas de tus clientes.
          </p>
        </div>

        <Badge variant="tactical">{reservations.length} Reservas Registradas</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 flex flex-col items-center gap-2 text-zinc-400 text-xs font-mono">
              <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
              <span>Cargando reservas...</span>
            </div>
          ) : reservations.length === 0 ? (
            <div className="p-12 text-center text-xs font-mono text-zinc-500">
              No hay reservas registradas todavía.
            </div>
          ) : (
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
                  {reservations.map((res) => (
                    <tr key={res.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 text-white font-bold">
                        {new Date(res.date_time).toLocaleString('es-CO', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-3 px-4 font-sans font-semibold text-zinc-200">
                        {res.customer?.full_name || 'Cliente'}
                        {res.customer?.phone && (
                          <span className="block text-[10px] font-mono text-zinc-500">
                            {res.customer.phone}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-zinc-300">{res.guests_count} personas</td>
                      <td className="py-3 px-4">
                        {res.status === 'confirmed' && <Badge variant="success">Confirmada</Badge>}
                        {res.status === 'completed' && <Badge variant="tactical">Completada</Badge>}
                        {res.status === 'cancelled' && <Badge variant="danger">Cancelada</Badge>}
                        {res.status === 'no_show' && <Badge variant="warning">No Show</Badge>}
                      </td>
                      <td className="py-3 px-4 text-zinc-400 max-w-xs truncate">
                        {res.notes || 'Sin notas especiales'}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                        {res.status === 'confirmed' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={updatingId === res.id}
                              onClick={() => void handleUpdateStatus(res.id, 'completed')}
                              className="text-[10px] h-7 px-2 text-emerald-400"
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Completar
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={updatingId === res.id}
                              onClick={() => void handleUpdateStatus(res.id, 'cancelled')}
                              className="text-[10px] h-7 px-2"
                            >
                              <X className="w-3 h-3 mr-1" />
                              Cancelar
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
