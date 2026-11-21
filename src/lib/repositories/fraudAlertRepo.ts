import type { SupabaseAdminClient } from '@/lib/supabase/server';
import type { FraudAlertType, FraudSeverity, Json } from '@/types/database';
import type { FraudAlert } from '@/types/domain';

export interface CreateFraudAlertParams {
  merchantId: string;
  employeeId?: string | null;
  customerId?: string | null;
  alertType: FraudAlertType;
  severity: FraudSeverity;
  details: Json;
}

export const fraudAlertRepo = {
  async listByMerchant(
    client: SupabaseAdminClient,
    merchantId: string,
    unresolvedOnly = false
  ): Promise<FraudAlert[]> {
    let query = client
      .from('fraud_alerts')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false });

    if (unresolvedOnly) {
      query = query.eq('is_resolved', false);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`[fraudAlertRepo.listByMerchant] ${error.message}`);
    }
    return (data ?? []) as FraudAlert[];
  },

  async create(
    client: SupabaseAdminClient,
    input: CreateFraudAlertParams
  ): Promise<FraudAlert> {
    const { data, error } = await client
      .from('fraud_alerts')
      .insert({
        merchant_id: input.merchantId,
        employee_id: input.employeeId ?? null,
        customer_id: input.customerId ?? null,
        alert_type: input.alertType,
        severity: input.severity,
        details: input.details,
        is_resolved: false,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[fraudAlertRepo.create] ${error?.message ?? 'Insert failed'}`);
    }
    return data as FraudAlert;
  },

  async resolve(
    client: SupabaseAdminClient,
    merchantId: string,
    alertId: string
  ): Promise<FraudAlert> {
    const { data, error } = await client
      .from('fraud_alerts')
      .update({ is_resolved: true })
      .eq('id', alertId)
      .eq('merchant_id', merchantId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`[fraudAlertRepo.resolve] ${error?.message ?? 'Alert not found'}`);
    }
    return data as FraudAlert;
  },
};
