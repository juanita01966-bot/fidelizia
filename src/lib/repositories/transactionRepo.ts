import type { SupabaseAdminClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import type { Transaction } from '@/types/domain';

export type ProcessPosScanResult = Database['public']['Functions']['process_pos_scan']['Returns'];

export interface ProcessPosScanInput {
  merchantId: string;
  employeeId: string;
  passSerialNumber: string;
  ticketNumber: string;
  amount: number;
  scannerLat?: number | null;
  scannerLng?: number | null;
  locationId?: string | null;
  stampsToAdd?: number;
}

export type PosFraudAlertType = 'ticket_reused' | 'cooldown_violation' | 'geofence_breach';

export class PosRpcError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly fraudAlertType?: PosFraudAlertType
  ) {
    super(message);
    this.name = 'PosRpcError';
  }
}

function mapPosRpcError(rawMessage: string): PosRpcError {
  if (rawMessage.includes('TICKET_ALREADY_USED')) {
    return new PosRpcError('TICKET_ALREADY_USED', 409, rawMessage, 'ticket_reused');
  }
  if (rawMessage.includes('COOLDOWN_ACTIVE')) {
    return new PosRpcError('COOLDOWN_ACTIVE', 429, rawMessage, 'cooldown_violation');
  }
  if (rawMessage.includes('GEOFENCE_BREACH')) {
    return new PosRpcError('GEOFENCE_BREACH', 403, rawMessage, 'geofence_breach');
  }
  if (rawMessage.includes('LOCATION_NOT_FOUND')) {
    return new PosRpcError('LOCATION_NOT_FOUND', 404, rawMessage);
  }
  if (rawMessage.includes('PASS_NOT_FOUND')) {
    return new PosRpcError('PASS_NOT_FOUND', 404, rawMessage);
  }
  if (rawMessage.includes('PASS_SUSPENDED_OR_REVOKED')) {
    return new PosRpcError('PASS_SUSPENDED_OR_REVOKED', 403, rawMessage);
  }
  if (rawMessage.includes('EMPLOYEE_INACTIVE_OR_NOT_FOUND')) {
    return new PosRpcError('EMPLOYEE_INACTIVE_OR_NOT_FOUND', 403, rawMessage);
  }
  if (rawMessage.includes('MERCHANT_INACTIVE_OR_NOT_FOUND')) {
    return new PosRpcError('MERCHANT_INACTIVE_OR_NOT_FOUND', 404, rawMessage);
  }
  if (
    rawMessage.includes('INVALID_TICKET_NUMBER') ||
    rawMessage.includes('INVALID_STAMPS_AMOUNT') ||
    rawMessage.includes('INVALID_AMOUNT')
  ) {
    return new PosRpcError('VALIDATION_ERROR', 400, rawMessage);
  }
  return new PosRpcError('POS_SCAN_FAILED', 500, rawMessage);
}

export const transactionRepo = {
  async listByMerchant(
    client: SupabaseAdminClient,
    merchantId: string,
    limit = 100
  ): Promise<Transaction[]> {
    const { data, error } = await client
      .from('transactions')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`[transactionRepo.listByMerchant] ${error.message}`);
    }
    return (data ?? []) as Transaction[];
  },

  async listByCustomer(
    client: SupabaseAdminClient,
    merchantId: string,
    customerId: string
  ): Promise<Transaction[]> {
    const { data, error } = await client
      .from('transactions')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`[transactionRepo.listByCustomer] ${error.message}`);
    }
    return (data ?? []) as Transaction[];
  },

  async getById(
    client: SupabaseAdminClient,
    merchantId: string,
    transactionId: string
  ): Promise<Transaction | null> {
    const { data, error } = await client
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('merchant_id', merchantId)
      .maybeSingle();

    if (error) {
      throw new Error(`[transactionRepo.getById] ${error.message}`);
    }
    return (data as Transaction | null) ?? null;
  },

  async processPosScan(
    client: SupabaseAdminClient,
    input: ProcessPosScanInput
  ): Promise<ProcessPosScanResult> {
    const { data, error } = await client.rpc('process_pos_scan', {
      p_merchant_id: input.merchantId,
      p_employee_id: input.employeeId,
      p_pass_serial_number: input.passSerialNumber.trim(),
      p_ticket_number: input.ticketNumber.trim(),
      p_amount: input.amount,
      p_scanner_lat: input.scannerLat ?? null,
      p_scanner_lng: input.scannerLng ?? null,
      p_location_id: input.locationId ?? null,
      p_stamps_to_add: input.stampsToAdd ?? 1,
    });

    if (error) {
      throw mapPosRpcError(error.message);
    }
    if (!data) {
      throw new PosRpcError('POS_SCAN_EMPTY', 500, 'La RPC process_pos_scan no devolvió resultado');
    }

    return data;
  },
};
