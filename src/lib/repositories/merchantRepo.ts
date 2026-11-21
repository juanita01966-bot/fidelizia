import type { SupabaseAdminClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/types/database';
import type {
  CardGradientConfig,
  CardMorphology,
  CardPattern,
  Location,
  LoyaltyProgramMode,
  Merchant,
  MerchantSettingsInput,
  RewardMilestone,
  TierConfig,
} from '@/types/domain';

export interface LocationInput {
  id?: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius_meters?: number;
  relevant_text?: string;
  is_active?: boolean;
}

type MerchantRow = Database['public']['Tables']['merchants']['Row'];

export function mapMerchantRow(row: MerchantRow): Merchant {
  return {
    ...row,
    tier_config: (row.tier_config as unknown as TierConfig | undefined) ?? {
      bronzeMin: 0,
      silverMin: 2,
      goldMin: 5,
      championMin: 10,
    },
    preconfigured_rewards: (row.preconfigured_rewards as unknown as [string, string, string] | undefined) ?? [
      'Café Americano de Especialidad (Cortesía)',
      'Galleta Artesanal de Avena & Canela',
      'Doble Sello de Bonificación en Próxima Visita',
    ],
    card_pattern: (row.card_pattern as CardPattern | undefined) ?? 'guilloche',
    loyalty_program_mode: (row.loyalty_program_mode as LoyaltyProgramMode | undefined) ?? 'multi_tier',
    card_morphology: (row.card_morphology as CardMorphology | undefined) ?? 'orthogonal',
    card_gradient: (row.card_gradient as unknown as CardGradientConfig | undefined) ?? {
      preset: 'roasted_gold',
      from: '#241407',
      via: '#140b04',
      to: '#080402',
      angle: 180,
    },
    reward_milestones: (row.reward_milestones as unknown as RewardMilestone[] | undefined) ?? [],
  };
}

export const merchantRepo = {
  async getBySlug(client: SupabaseAdminClient, slug: string): Promise<Merchant | null> {
    const cleanSlug = slug.trim().toLowerCase();
    if (!cleanSlug) return null;

    const { data, error } = await client
      .from('merchants')
      .select('*')
      .eq('slug', cleanSlug)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new Error(`[merchantRepo.getBySlug] ${error.message}`);
    }
    return data ? mapMerchantRow(data) : null;
  },

  async getById(client: SupabaseAdminClient, merchantId: string): Promise<Merchant | null> {
    if (!merchantId) return null;

    const { data, error } = await client
      .from('merchants')
      .select('*')
      .eq('id', merchantId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new Error(`[merchantRepo.getById] ${error.message}`);
    }
    return data ? mapMerchantRow(data) : null;
  },

  async updateSettings(
    client: SupabaseAdminClient,
    merchantId: string,
    patch: Partial<MerchantSettingsInput>
  ): Promise<Merchant> {
    const updatePayload: Database['public']['Tables']['merchants']['Update'] = {
      updated_at: new Date().toISOString(),
    };

    if (patch.name !== undefined) updatePayload.name = patch.name;
    if (patch.logo_url !== undefined) updatePayload.logo_url = patch.logo_url;
    if (patch.brand_color !== undefined) updatePayload.brand_color = patch.brand_color;
    if (patch.secondary_color !== undefined) updatePayload.secondary_color = patch.secondary_color;
    if (patch.google_place_id !== undefined) updatePayload.google_place_id = patch.google_place_id;
    if (patch.stamps_needed !== undefined) updatePayload.stamps_needed = patch.stamps_needed;
    if (patch.reward_description !== undefined) updatePayload.reward_description = patch.reward_description;
    if (patch.cooldown_hours !== undefined) updatePayload.cooldown_hours = patch.cooldown_hours;
    if (patch.scanner_geofence_meters !== undefined) {
      updatePayload.scanner_geofence_meters = patch.scanner_geofence_meters;
    }
    if (patch.card_pattern !== undefined) updatePayload.card_pattern = patch.card_pattern;
    if (patch.show_emv_chip !== undefined) updatePayload.show_emv_chip = patch.show_emv_chip;
    if (patch.show_hologram !== undefined) updatePayload.show_hologram = patch.show_hologram;
    if (patch.loyalty_program_mode !== undefined) {
      updatePayload.loyalty_program_mode = patch.loyalty_program_mode;
    }
    if (patch.card_morphology !== undefined) updatePayload.card_morphology = patch.card_morphology;
    if (patch.card_gradient !== undefined) updatePayload.card_gradient = patch.card_gradient as unknown as Json;
    if (patch.reward_milestones !== undefined) {
      updatePayload.reward_milestones = patch.reward_milestones as unknown as Json;
    }
    if (patch.preconfigured_rewards !== undefined) {
      updatePayload.preconfigured_rewards = patch.preconfigured_rewards as unknown as Json;
    }
    if (patch.tier_config !== undefined) {
      updatePayload.tier_config = patch.tier_config as unknown as Json;
    }

    const { data, error } = await client
      .from('merchants')
      .update(updatePayload)
      .eq('id', merchantId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[merchantRepo.updateSettings] ${error?.message ?? 'Merchant not found'}`);
    }
    return mapMerchantRow(data);
  },

  async updateTierConfig(
    client: SupabaseAdminClient,
    merchantId: string,
    tierConfig: TierConfig
  ): Promise<Merchant> {
    const { data, error } = await client
      .from('merchants')
      .update({
        tier_config: tierConfig as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', merchantId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[merchantRepo.updateTierConfig] ${error?.message ?? 'Merchant not found'}`);
    }
    return mapMerchantRow(data);
  },

  async updatePreconfiguredRewards(
    client: SupabaseAdminClient,
    merchantId: string,
    rewards: [string, string, string]
  ): Promise<Merchant> {
    const { data, error } = await client
      .from('merchants')
      .update({
        preconfigured_rewards: rewards as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', merchantId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[merchantRepo.updatePreconfiguredRewards] ${error?.message ?? 'Merchant not found'}`);
    }
    return mapMerchantRow(data);
  },

  async listLocations(
    client: SupabaseAdminClient,
    merchantId: string,
    activeOnly = true
  ): Promise<Location[]> {
    let query = client
      .from('locations')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`[merchantRepo.listLocations] ${error.message}`);
    }
    return (data ?? []) as Location[];
  },

  async getPrimaryLocation(client: SupabaseAdminClient, merchantId: string): Promise<Location | null> {
    const { data, error } = await client
      .from('locations')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`[merchantRepo.getPrimaryLocation] ${error.message}`);
    }
    return (data as Location | null) ?? null;
  },

  async upsertLocation(
    client: SupabaseAdminClient,
    merchantId: string,
    input: LocationInput
  ): Promise<Location> {
    if (input.id) {
      const { data, error } = await client
        .from('locations')
        .update({
          name: input.name,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
          radius_meters: input.radius_meters ?? 100,
          relevant_text: input.relevant_text,
          is_active: input.is_active ?? true,
        })
        .eq('id', input.id)
        .eq('merchant_id', merchantId)
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(`[merchantRepo.upsertLocation:update] ${error?.message ?? 'Location not found'}`);
      }
      return data as Location;
    }

    const { data, error } = await client
      .from('locations')
      .insert({
        merchant_id: merchantId,
        name: input.name,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        radius_meters: input.radius_meters ?? 100,
        relevant_text: input.relevant_text,
        is_active: input.is_active ?? true,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[merchantRepo.upsertLocation:insert] ${error?.message ?? 'Insert failed'}`);
    }
    return data as Location;
  },
};
