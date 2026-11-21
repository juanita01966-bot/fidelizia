import type { SupabaseAdminClient } from '@/lib/supabase/server';
import type { PassStatus, PassType } from '@/types/database';
import type { Customer, Location, Merchant, WalletPass } from '@/types/domain';
import { mapMerchantRow } from './merchantRepo';

export interface CreatePassInput {
  merchantId: string;
  customerId: string;
  passType: PassType;
  serialNumber: string;
  authenticationToken: string;
  initialStamps?: number;
  initialVisits?: number;
}

export interface PassBundle {
  pass: WalletPass;
  customer: Customer;
  merchant: Merchant;
  locations: Location[];
}

export const passRepo = {
  async getBySerial(
    client: SupabaseAdminClient,
    serialNumber: string,
    merchantId?: string
  ): Promise<WalletPass | null> {
    const trimmedSerial = serialNumber.trim();
    if (!trimmedSerial) return null;

    if (merchantId !== undefined && merchantId.trim() === '') {
      return null;
    }

    let query = client
      .from('wallet_passes')
      .select('*')
      .eq('pass_serial_number', trimmedSerial);

    if (merchantId !== undefined) {
      query = query.eq('merchant_id', merchantId.trim());
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`[passRepo.getBySerial] ${error.message}`);
    }
    return (data as WalletPass | null) ?? null;
  },

  async getWithCustomerAndMerchantBySerial(
    client: SupabaseAdminClient,
    serialNumber: string,
    merchantId?: string
  ): Promise<PassBundle | null> {
    const pass = await this.getBySerial(client, serialNumber, merchantId);
    if (!pass) return null;

    const [
      { data: customer, error: custErr },
      { data: merchant, error: merchErr },
      { data: locations, error: locErr },
    ] = await Promise.all([
      client
        .from('customers')
        .select('*')
        .eq('id', pass.customer_id)
        .eq('merchant_id', pass.merchant_id)
        .maybeSingle(),
      client.from('merchants').select('*').eq('id', pass.merchant_id).maybeSingle(),
      client
        .from('locations')
        .select('*')
        .eq('merchant_id', pass.merchant_id)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
    ]);

    if (custErr) throw new Error(`[passRepo.getWithCustomerAndMerchantBySerial:customer] ${custErr.message}`);
    if (merchErr) throw new Error(`[passRepo.getWithCustomerAndMerchantBySerial:merchant] ${merchErr.message}`);
    if (locErr) throw new Error(`[passRepo.getWithCustomerAndMerchantBySerial:locations] ${locErr.message}`);

    if (!customer || !merchant) return null;

    return {
      pass,
      customer: customer as Customer,
      merchant: mapMerchantRow(merchant),
      locations: (locations ?? []) as Location[],
    };
  },

  async getByCustomerAndType(
    client: SupabaseAdminClient,
    merchantId: string,
    customerId: string,
    passType: PassType
  ): Promise<WalletPass | null> {
    const { data, error } = await client
      .from('wallet_passes')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('customer_id', customerId)
      .eq('pass_type', passType)
      .maybeSingle();

    if (error) {
      throw new Error(`[passRepo.getByCustomerAndType] ${error.message}`);
    }
    return (data as WalletPass | null) ?? null;
  },

  async listActiveByMerchant(
    client: SupabaseAdminClient,
    merchantId: string,
    filters?: { customerId?: string; segment?: string }
  ): Promise<Array<WalletPass & { customer: Customer }>> {
    let passQuery = client
      .from('wallet_passes')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (filters?.customerId) {
      passQuery = passQuery.eq('customer_id', filters.customerId);
    }

    const { data: passRows, error: passErr } = await passQuery;
    if (passErr) {
      throw new Error(`[passRepo.listActiveByMerchant:passes] ${passErr.message}`);
    }

    const passes = (passRows ?? []) as WalletPass[];
    if (passes.length === 0) return [];

    const customerIds = [...new Set(passes.map((p) => p.customer_id))];
    const { data: customerRows, error: custErr } = await client
      .from('customers')
      .select('*')
      .eq('merchant_id', merchantId)
      .in('id', customerIds);

    if (custErr) {
      throw new Error(`[passRepo.listActiveByMerchant:customers] ${custErr.message}`);
    }

    const customerMap = new Map<string, Customer>();
    for (const c of (customerRows ?? []) as Customer[]) {
      customerMap.set(c.id, c);
    }

    const currentMonth = new Date().getUTCMonth() + 1;
    const result: Array<WalletPass & { customer: Customer }> = [];

    for (const p of passes) {
      const cust = customerMap.get(p.customer_id);
      if (!cust) continue;

      if (filters?.segment && filters.segment !== 'all' && filters.segment !== 'individual') {
        if (filters.segment === 'birthday_month') {
          const monthPart = cust.birthdate ? Number(cust.birthdate.split('-')[1]) : NaN;
          if (monthPart !== currentMonth) continue;
        } else if (cust.rfm_segment !== filters.segment) {
          continue;
        }
      }

      result.push({ ...p, customer: cust });
    }

    return result;
  },

  async create(client: SupabaseAdminClient, input: CreatePassInput): Promise<WalletPass> {
    const { data, error } = await client
      .from('wallet_passes')
      .insert({
        merchant_id: input.merchantId,
        customer_id: input.customerId,
        pass_type: input.passType,
        pass_serial_number: input.serialNumber.trim(),
        authentication_token: input.authenticationToken,
        current_stamps: input.initialStamps ?? 1,
        total_visits: input.initialVisits ?? 1,
        total_rewards_redeemed: 0,
        status: 'active',
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[passRepo.create] ${error?.message ?? 'Insert failed'}`);
    }
    return data as WalletPass;
  },

  async updateStatus(
    client: SupabaseAdminClient,
    merchantId: string,
    passId: string,
    status: PassStatus
  ): Promise<WalletPass> {
    const { data, error } = await client
      .from('wallet_passes')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', passId)
      .eq('merchant_id', merchantId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[passRepo.updateStatus] ${error?.message ?? 'Pass not found'}`);
    }
    return data as WalletPass;
  },

  async recordPushNotification(
    client: SupabaseAdminClient,
    merchantId: string,
    passIds: string[],
    title: string,
    message: string,
    increment24hQuota: boolean
  ): Promise<void> {
    if (passIds.length === 0) return;

    const now = new Date();
    const nowIso = now.toISOString();
    const resetCutoffMs = now.getTime();

    const { data: existingPasses, error: fetchErr } = await client
      .from('wallet_passes')
      .select('id, push_count_24h, push_window_reset_at')
      .eq('merchant_id', merchantId)
      .in('id', passIds);

    if (fetchErr) {
      throw new Error(`[passRepo.recordPushNotification:fetch] ${fetchErr.message}`);
    }

    const updates = (existingPasses ?? []).map((p) => {
      const windowExpired =
        !p.push_window_reset_at || new Date(p.push_window_reset_at).getTime() <= resetCutoffMs;
      const nextCount = increment24hQuota ? (windowExpired ? 1 : (p.push_count_24h ?? 0) + 1) : p.push_count_24h;
      const nextReset =
        increment24hQuota && windowExpired
          ? new Date(resetCutoffMs + 24 * 60 * 60 * 1000).toISOString()
          : p.push_window_reset_at;

      return client
        .from('wallet_passes')
        .update({
          last_push_title: title,
          last_push_message: message,
          last_push_at: nowIso,
          push_count_24h: nextCount,
          push_window_reset_at: nextReset,
          updated_at: nowIso,
        })
        .eq('id', p.id)
        .eq('merchant_id', merchantId);
    });

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      throw new Error(`[passRepo.recordPushNotification:update] ${failed.error.message}`);
    }
  },
};
