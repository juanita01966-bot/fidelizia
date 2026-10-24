'use client';

import React, { useState, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  Users, 
  Phone, 
  FileText, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Filter
} from 'lucide-react';
import { Reservation } from '@/types/domain';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { soundEngine } from '@/lib/audio/sound-effects';
import { toast } from 'sonner';

interface ReservationsCalendarViewProps {
  reservations: Reservation[];
  onAddReservation?: () => void;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function ReservationsCalendarView({ reservations, onAddReservation }: ReservationsCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Días en el mes y día de inicio de semana
  const { daysInMonth, startDayOffset, daysList } = useMemo(() => {
    const daysCount = new Date(year, month + 1, 0).getDate();
    // 0 = Domingo, 1 = Lunes en JS. Convertir a 0 = Lun, 6 = Dom
    let firstDay = new Date(year, month, 1).getDay() - 1;
    if (firstDay === -1) firstDay = 6;

    const list: { dayNum: number; dateStr: string }[] = [];
    for (let i = 1; i <= daysCount; i++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(i).padStart(2, '0');
      list.push({
        dayNum: i,
        dateStr: `${year}-${monthStr}-${dayStr}`,
      });
    }

    return { daysInMonth: daysCount, startDayOffset: firstDay, daysList: list };
  }, [year, month]);

  // Mapeo de reservas por fecha (YYYY-MM-DD)
  const reservationsByDate = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    reservations.forEach((r) => {
      if (!r.date_time) return;
      const datePart = r.date_time.split('T')[0];
      const list = map.get(datePart) || [];
      list.push(r);
      map.set(datePart, list);
    });
    return map;
  }, [reservations]);

  const handlePrevMonth = () => {
    soundEngine.playKeyboardClick();
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    soundEngine.playKeyboardClick();
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleSelectDay = (dateStr: string) => {
    soundEngine.playKeyboardClick();
    setSelectedDateStr(dateStr === selectedDateStr ? null : dateStr);
  };

  // Reservas filtradas
  const activeReservations = useMemo(() => {
    if (!selectedDateStr) return reservations;
    return reservationsByDate.get(selectedDateStr) || [];
  }, [selectedDateStr, reservations, reservationsByDate]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  return (
    <div className="space-y-6">
      {/* HEADER DEL CALENDARIO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-100 p-4 rounded-xl border border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              {MONTH_NAMES[month]} {year}
            </h3>
            <p className="text-xs text-zinc-400 font-mono">
              {reservations.length} reservas registradas en el sistema
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedDateStr && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDateStr(null)}
              className="text-xs font-mono border-white/10 hover:border-purple-500/30 text-zinc-300"
            >
              <Filter className="w-3.5 h-3.5 mr-1 text-purple-400" />
              Ver Todas ({reservations.length})
            </Button>
          )}

          <div className="flex items-center gap-1 bg-surface-200 border border-white/10 rounded-lg p-0.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-white/5 rounded text-zinc-400 hover:text-white transition-colors"
              title="Mes anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setCurrentDate(now);
                setSelectedDateStr(now.toISOString().split('T')[0]);
              }}
              className="px-2 py-1 text-xs font-mono text-zinc-300 hover:text-white hover:bg-white/5 rounded"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-white/5 rounded text-zinc-400 hover:text-white transition-colors"
              title="Mes siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* RETÍCULA DEL CALENDARIO MENSUAL */}
      <div className="bg-surface-100 rounded-xl border border-white/[0.08] p-4 sm:p-5">
        {/* Nombres de los días de la semana */}
        <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-mono text-zinc-500 uppercase tracking-wider">
          {DAY_NAMES.map((name) => (
            <div key={name} className="py-1">
              {name}
            </div>
          ))}
        </div>

        {/* Días del mes */}
        <div className="grid grid-cols-7 gap-2">
          {/* Celdas vacías previas */}
          {Array.from({ length: startDayOffset }).map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className="aspect-square sm:aspect-[4/3] rounded-lg border border-transparent opacity-10 bg-white/[0.01]"
            />
          ))}

          {/* Días activos */}
          {daysList.map(({ dayNum, dateStr }) => {
            const dayReservations = reservationsByDate.get(dateStr) || [];
            const hasRes = dayReservations.length > 0;
            const isSelected = selectedDateStr === dateStr;
            const isToday = dateStr === todayStr;

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => handleSelectDay(dateStr)}
                className={`group relative aspect-square sm:aspect-[4/3] p-1.5 sm:p-2 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-purple-600/20 border-purple-500 shadow-glow-purple text-white'
                    : isToday
                    ? 'bg-white/[0.04] border-purple-400/40 text-white'
                    : 'bg-surface-200/50 hover:bg-white/[0.04] border-white/5 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-xs sm:text-sm font-mono font-semibold ${
                      isSelected
                        ? 'text-purple-300'
                        : isToday
                        ? 'text-champagne font-bold'
                        : ''
                    }`}
                  >
                    {dayNum}
                  </span>

                  {isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-champagne animate-pulse" title="Hoy" />
                  )}
                </div>

                {hasRes && (
                  <div className="flex items-center gap-1 mt-auto">
                    <span className="w-2 h-2 rounded-full bg-purple-400 shadow-glow-purple animate-pulse" />
                    <span className="text-[10px] font-mono font-bold text-purple-300">
                      {dayReservations.length} {dayReservations.length === 1 ? 'res' : 'res'}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* PANEL DE RESERVAS FILTRADAS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
              {selectedDateStr ? `Reservas para el ${selectedDateStr}` : 'Todas las Reservas'}
            </h4>
            <Badge variant="tactical">
              {activeReservations.length} comensales
            </Badge>
          </div>

          {selectedDateStr && (
            <button
              type="button"
              onClick={() => setSelectedDateStr(null)}
              className="text-xs text-purple-400 hover:underline font-mono"
            >
              Quitar filtro de fecha
            </button>
          )}
        </div>

        {activeReservations.length === 0 ? (
          <div className="bg-surface-100 p-8 rounded-xl border border-white/5 text-center text-zinc-500 font-mono text-xs">
            No hay reservas agendadas para esta fecha.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeReservations.map((res) => {
              const [datePart, timePart] = res.date_time ? res.date_time.split('T') : ['', ''];
              return (
                <div
                  key={res.id}
                  className="bg-surface-100 p-4 rounded-xl border border-white/[0.08] hover:border-purple-500/30 transition-all space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-sm font-bold text-white tracking-tight block">
                        Mesa para {res.guests_count} comensales
                      </span>
                      <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-purple-400" />
                        <span>{datePart} · {timePart ? timePart.substring(0, 5) : 'Horario a convenir'}</span>
                      </div>
                    </div>

                    <Badge
                      variant={
                        res.status === 'confirmed'
                          ? 'success'
                          : res.status === 'cancelled'
                          ? 'danger'
                          : 'default'
                      }
                    >
                      {res.status === 'confirmed' ? 'Confirmada' : res.status}
                    </Badge>
                  </div>

                  {res.notes && (
                    <div className="flex items-start gap-2 bg-black/30 p-2.5 rounded-lg border border-white/5 text-xs text-zinc-300">
                      <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="line-clamp-2">{res.notes}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs font-mono text-zinc-500">
                    <span className="truncate">Ref: {res.id.substring(0, 12)}</span>
                    <span className="text-purple-300 font-semibold">
                      {res.guests_count} personas
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
