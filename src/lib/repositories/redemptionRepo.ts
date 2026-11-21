import type { SupabaseAdminClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import type { Redemption } from '@/types/domain';
import { PosRpcError } from './transactionRepo';

export type RedeemRewardResult = Database['public']['Functions']['redeem_reward']['Returns'];

export interface RedeemRewardInputParams {
  merchantId: string;
  passSerialNumber: string;
  managerId: string;
  stampsToDeduct?: number;
  rewardName?: string | null;
}

function mapRedeemRpcError(rawMessage: string): PosRpcError {
  if (rawMessage.includes('MANAGER_UNAUTHORIZED')) {
    return new PosRpcError('MANAGER_UNAUTHORIZED', 403, rawMessage);
  }
  if (rawMessage.includes('INSUFFICIENT_STAMPS')) {
    return new PosRpcError('INSUFFICIENT_STAMPS', 422, rawMessage);
  }
  if (rawMessage.includes('PASS_NOT_FOUND')) {
    return new PosRpcError('PASS_NOT_FOUND', 404, rawMessage);
  }
  if (rawMessage.includes('PASS_SUSPENDED_OR_REVOKED')) {
    return new PosRpcError('PASS_SUSPENDED_OR_REVOKED', 403, rawMessage);
  }
  if (rawMessage.includes('MERCHANT_INACTIVE_OR_NOT_FOUND')) {
    return new PosRpcError('MERCHANT_INACTIVE_OR_NOT_FOUND', 404, rawMessage);
  }
  if (rawMessage.includes('INVALID_STAMPS_TO_DEDUCT')) {
    return new PosRpcError('VALIDATION_ERROR', 400, rawMessage);
  }
  return new PosRpcError('REDEEM_FAILED', 500, rawMessage);
}

export const redemptionRepo = {
  async listByMerchant(
    client: SupabaseAdminClient,
    merchantId: string,
    limit = 100
  ): Promise<Redemption[]> {
    const { data, error } = await client
      .from('redemptions')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('redeemed_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`[redemptionRepo.listByMerchant] ${error.message}`);
    }
    return (data ?? []) as Redemption[];
  },

  async listByCustomer(
    client: SupabaseAdminClient,
    merchantId: string,
    customerId: string
  ): Promise<Redemption[]> {
    const { data, error } = await client
      .from('redemptions')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('customer_id', customerId)
      .order('redeemed_at', { ascending: false });

    if (error) {
      throw new Error(`[redemptionRepo.listByCustomer] ${error.message}`);
    }
    return (data ?? []) as Redemption[];
  },

  async redeemReward(
    client: SupabaseAdminClient,
    input: RedeemRewardInputParams
  ): Promise<RedeemRewardResult> {
    const { data, error } = await client.rpc('redeem_reward', {
      p_merchant_id: input.merchantId,
      p_pass_serial_number: input.passSerialNumber.trim(),
      p_manager_id: input.managerId,
      p_stamps_to_deduct: input.stampsToDeduct ?? null,
      p_reward_name: input.rewardName ?? null,
    });

    if (error) {
      throw mapRedeemRpcError(error.message);
    }
    if (!data) {
      throw new PosRpcError('REDEEM_EMPTY', 500, 'La RPC redeem_reward no devolvió resultado');
    }

    return data;
  },
};
