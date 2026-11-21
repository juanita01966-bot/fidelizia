import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseAdminClient } from '@/lib/supabase/server';
import type { Database, RfmSegment } from '@/types/database';
import type { Customer, LoyaltyTier, TierConfig, WalletPass } from '@/types/domain';

export interface CustomerListFilters {
  segment?: string;
  tier?: LoyaltyTier;
  search?: string;
}

export interface CreateCustomerInput {
  fullName: string;
  phone: string;
  birthdate?: string | null;
  termsAcceptedAt?: string;
  referredByPromoterId?: string | null;
  referredAt?: string | null;
}

type ExtendedCustomerRow = Database['public']['Tables']['customers']['Row'] & {
  referred_by_promoter_id: string | null;
  referred_at: string | null;
};

type ExtendedCustomerInsert = Database['public']['Tables']['customers']['Insert'] & {
  referred_by_promoter_id?: string | null;
  referred_at?: string | null;
};

type ExtendedCustomerUpdate = Partial<ExtendedCustomerInsert>;

type CustomerReferralDatabase = {
  public: {
    Tables: {
      customers: {
        Row: ExtendedCustomerRow;
        Insert: ExtendedCustomerInsert;
        Update: ExtendedCustomerUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

function asCustomerReferralDb(
  client: SupabaseAdminClient
): SupabaseClient<CustomerReferralDatabase> {
  return client as unknown as SupabaseClient<CustomerReferralDatabase>;
}

function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function computeTierForRedemptions(totalRedemptions: number, tierConfig: TierConfig): LoyaltyTier {
  if (totalRedemptions >= tierConfig.championMin) return 'champion';
  if (totalRedemptions >= tierConfig.goldMin) return 'gold';
  if (totalRedemptions >= tierConfig.silverMin) return 'silver';
  return 'bronze';
}

export const customerRepo = {
  async listWithPassesByMerchant(
    client: SupabaseAdminClient,
    merchantId: string,
    filters?: CustomerListFilters
  ): Promise<{ customers: Customer[]; passes: WalletPass[] }> {
    let customerQuery = client
      .from('customers')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false });

    if (filters?.tier) {
      customerQuery = customerQuery.eq('loyalty_tier', filters.tier);
    }

    const sanitizedSearch = filters?.search?.trim().replace(/[%_,()]/g, '') ?? '';
    if (sanitizedSearch.length > 0) {
      customerQuery = customerQuery.or(
        `full_name.ilike.%${sanitizedSearch}%,phone.ilike.%${sanitizedSearch}%`
      );
    }

    if (filters?.segment && filters.segment !== 'all') {
      if (filters.segment === 'birthday_month') {
        const currentMonth = new Date().getUTCMonth() + 1;
        const searchLower = sanitizedSearch.toLowerCase();
        const { data: allCusts, error } = await customerQuery;
        if (error) {
          throw new Error(`[customerRepo.listWithPassesByMerchant] ${error.message}`);
        }
        const filtered = ((allCusts ?? []) as Customer[]).filter((c) => {
          if (!c.birthdate) return false;
          const parts = c.birthdate.split('-');
          if (parts.length < 2 || Number(parts[1]) !== currentMonth) return false;
          if (filters.tier && c.loyalty_tier !== filters.tier) return false;
          if (searchLower.length > 0) {
            const nameMatch = c.full_name.toLowerCase().includes(searchLower);
            const phoneMatch = c.phone.toLowerCase().includes(searchLower);
            if (!nameMatch && !phoneMatch) return false;
          }
          return true;
        });
        const customerIds = filtered.map((c) => c.id);
        if (customerIds.length === 0) return { customers: [], passes: [] };
        const { data: passRows, error: passErr } = await client
          .from('wallet_passes')
          .select('*')
          .eq('merchant_id', merchantId)
          .in('customer_id', customerIds);
        if (passErr) {
          throw new Error(`[customerRepo.listWithPassesByMerchant:passes] ${passErr.message}`);
        }
        return { customers: filtered, passes: (passRows ?? []) as WalletPass[] };
      }

      customerQuery = customerQuery.eq('rfm_segment', filters.segment as RfmSegment);
    }

    const [{ data: customerRows, error: custErr }, { data: passRows, error: passErr }] = await Promise.all([
      customerQuery,
      client.from('wallet_passes').select('*').eq('merchant_id', merchantId),
    ]);

    if (custErr) {
      throw new Error(`[customerRepo.listWithPassesByMerchant:customers] ${custErr.message}`);
    }
    if (passErr) {
      throw new Error(`[customerRepo.listWithPassesByMerchant:passes] ${passErr.message}`);
    }

    const customers = (customerRows ?? []) as Customer[];
    const customerIdSet = new Set(customers.map((c) => c.id));
    const passes = ((passRows ?? []) as WalletPass[]).filter((p) => customerIdSet.has(p.customer_id));

    return { customers, passes };
  },

  async findById(
    client: SupabaseAdminClient,
    merchantId: string,
    customerId: string
  ): Promise<Customer | null> {
    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('merchant_id', merchantId)
      .maybeSingle();

    if (error) {
      throw new Error(`[customerRepo.findById] ${error.message}`);
    }
    return (data as Customer | null) ?? null;
  },

  async findByPhone(
    client: SupabaseAdminClient,
    merchantId: string,
    phone: string
  ): Promise<Customer | null> {
    const trimmed = phone.trim();
    if (!trimmed) return null;

    const { data: exact, error: exactErr } = await client
      .from('customers')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('phone', trimmed)
      .maybeSingle();

    if (exactErr) {
      throw new Error(`[customerRepo.findByPhone:exact] ${exactErr.message}`);
    }
    if (exact) return exact as Customer;

    const digits = normalizePhoneDigits(trimmed);
    if (digits.length < 7) return null;
    const suffix = digits.slice(-10);

    const { data: suffixMatch, error: suffixErr } = await client
      .from('customers')
      .select('*')
      .eq('merchant_id', merchantId)
      .ilike('phone', `%${suffix}`)
      .limit(1)
      .maybeSingle();

    if (suffixErr) {
      throw new Error(`[customerRepo.findByPhone:suffix] ${suffixErr.message}`);
    }
    return (suffixMatch as Customer | null) ?? null;
  },

  async create(
    client: SupabaseAdminClient,
    merchantId: string,
    input: CreateCustomerInput
  ): Promise<Customer> {
    const now = new Date().toISOString();
    const insertPayload: ExtendedCustomerInsert = {
      merchant_id: merchantId,
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      birthdate: input.birthdate ?? null,
      terms_accepted_at: input.termsAcceptedAt ?? now,
      rfm_segment: 'new',
      loyalty_tier: 'bronze',
      total_rewards_redeemed: 0,
      ...(input.referredByPromoterId
        ? {
            referred_by_promoter_id: input.referredByPromoterId,
            referred_at: input.referredAt ?? now,
          }
        : {}),
    };

    const { data, error } = await asCustomerReferralDb(client)
      .from('customers')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[customerRepo.create] ${error?.message ?? 'Insert failed'}`);
    }
    return data as Customer;
  },

  async attachReferralForNewCustomer(
    client: SupabaseAdminClient,
    merchantId: string,
    customerId: string,
    promoterId: string,
    referredAt?: string
  ): Promise<Customer | null> {
    const now = referredAt ?? new Date().toISOString();

    const { data, error } = await asCustomerReferralDb(client)
      .from('customers')
      .update({
        referred_by_promoter_id: promoterId,
        referred_at: now,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId)
      .eq('merchant_id', merchantId)
      .is('referred_by_promoter_id', null)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`[customerRepo.attachReferralForNewCustomer] ${error.message}`);
    }
    return (data as Customer | null) ?? null;
  },

  async updateBenefits(
    client: SupabaseAdminClient,
    merchantId: string,
    customerId: string,
    customReward: string | null,
    discountPercentage: number | null
  ): Promise<Customer> {
    const { data, error } = await client
      .from('customers')
      .update({
        custom_reward: customReward ? customReward.trim() : null,
        discount_percentage: discountPercentage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId)
      .eq('merchant_id', merchantId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[customerRepo.updateBenefits] ${error?.message ?? 'Customer not found'}`);
    }
    return data as Customer;
  },

  async updateLoyaltyTier(
    client: SupabaseAdminClient,
    merchantId: string,
    customerId: string,
    tier: LoyaltyTier
  ): Promise<Customer> {
    const { data, error } = await client
      .from('customers')
      .update({
        loyalty_tier: tier,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId)
      .eq('merchant_id', merchantId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[customerRepo.updateLoyaltyTier] ${error?.message ?? 'Customer not found'}`);
    }
    return data as Customer;
  },

  async recalculateAllTiers(
    client: SupabaseAdminClient,
    merchantId: string,
    tierConfig: TierConfig
  ): Promise<void> {
    const { data: customers, error } = await client
      .from('customers')
      .select('id, total_rewards_redeemed, loyalty_tier')
      .eq('merchant_id', merchantId);

    if (error) {
      throw new Error(`[customerRepo.recalculateAllTiers:fetch] ${error.message}`);
    }

    const now = new Date().toISOString();
    const updates = (customers ?? [])
      .map((c) => {
        const nextTier = computeTierForRedemptions(c.total_rewards_redeemed ?? 0, tierConfig);
        if (nextTier === c.loyalty_tier) return null;
        return client
          .from('customers')
          .update({ loyalty_tier: nextTier, updated_at: now })
          .eq('id', c.id)
          .eq('merchant_id', merchantId);
      })
      .filter((promise): promise is NonNullable<typeof promise> => promise !== null);

    if (updates.length > 0) {
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        throw new Error(`[customerRepo.recalculateAllTiers:update] ${failed.error.message}`);
      }
    }
  },

  async listBySegment(
    client: SupabaseAdminClient,
    merchantId: string,
    segment: string
  ): Promise<Customer[]> {
    const { customers } = await this.listWithPassesByMerchant(client, merchantId, { segment });
    return customers;
  },
};
