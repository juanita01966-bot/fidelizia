import type { SupabaseAdminClient } from '@/lib/supabase/server';
import type { ReservationStatus } from '@/types/database';
import type { Customer, Reservation } from '@/types/domain';

export interface ReservationListFilters {
  fromIso?: string;
  toIso?: string;
  status?: ReservationStatus;
}

export interface CreateReservationParams {
  merchantId: string;
  customerId: string;
  locationId?: string | null;
  dateTime: string;
  guestsCount: number;
  notes?: string | null;
}

export type ReservationWithCustomer = Reservation & {
  customer?: Pick<Customer, 'id' | 'full_name' | 'phone'>;
};

export const reservationRepo = {
  async listByMerchant(
    client: SupabaseAdminClient,
    merchantId: string,
    filters?: ReservationListFilters
  ): Promise<ReservationWithCustomer[]> {
    let query = client
      .from('reservations')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('date_time', { ascending: true });

    if (filters?.fromIso) query = query.gte('date_time', filters.fromIso);
    if (filters?.toIso) query = query.lte('date_time', filters.toIso);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query;
    if (error) {
      throw new Error(`[reservationRepo.listByMerchant] ${error.message}`);
    }

    const reservations = (data ?? []) as Reservation[];
    if (reservations.length === 0) return [];

    const customerIds = [...new Set(reservations.map((r) => r.customer_id))];
    const { data: customerRows, error: custErr } = await client
      .from('customers')
      .select('id, full_name, phone')
      .eq('merchant_id', merchantId)
      .in('id', customerIds);

    if (custErr) {
      throw new Error(`[reservationRepo.listByMerchant:customers] ${custErr.message}`);
    }

    const customerMap = new Map<string, Pick<Customer, 'id' | 'full_name' | 'phone'>>();
    for (const c of (customerRows ?? []) as Array<Pick<Customer, 'id' | 'full_name' | 'phone'>>) {
      customerMap.set(c.id, c);
    }

    return reservations.map((r) => ({
      ...r,
      customer: customerMap.get(r.customer_id),
    }));
  },

  async getById(
    client: SupabaseAdminClient,
    merchantId: string,
    reservationId: string
  ): Promise<Reservation | null> {
    const { data, error } = await client
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .eq('merchant_id', merchantId)
      .maybeSingle();

    if (error) {
      throw new Error(`[reservationRepo.getById] ${error.message}`);
    }
    return (data as Reservation | null) ?? null;
  },

  async create(
    client: SupabaseAdminClient,
    input: CreateReservationParams
  ): Promise<Reservation> {
    const { data, error } = await client
      .from('reservations')
      .insert({
        merchant_id: input.merchantId,
        customer_id: input.customerId,
        location_id: input.locationId ?? null,
        date_time: input.dateTime,
        guests_count: input.guestsCount,
        status: 'confirmed',
        notes: input.notes ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[reservationRepo.create] ${error?.message ?? 'Insert failed'}`);
    }
    return data as Reservation;
  },

  async updateStatus(
    client: SupabaseAdminClient,
    merchantId: string,
    reservationId: string,
    status: ReservationStatus
  ): Promise<Reservation> {
    const { data, error } = await client
      .from('reservations')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservationId)
      .eq('merchant_id', merchantId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[reservationRepo.updateStatus] ${error?.message ?? 'Reservation not found'}`);
    }
    return data as Reservation;
  },
};
