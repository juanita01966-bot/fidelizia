import type { SupabaseAdminClient } from '@/lib/supabase/server';

export interface RegisterAppleDeviceInput {
  deviceLibraryIdentifier: string;
  pushToken: string;
  passTypeIdentifier: string;
  serialNumber: string;
}

export interface UnregisterAppleDeviceInput {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
}

export interface GetSerialsForDeviceInput {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  passesUpdatedSince?: string | null;
}

export const appleDeviceRepo = {
  async registerDevice(
    client: SupabaseAdminClient,
    input: RegisterAppleDeviceInput
  ): Promise<'created' | 'updated'> {
    const nowIso = new Date().toISOString();

    const { data: existing, error: fetchErr } = await client
      .from('apple_device_registrations')
      .select('id')
      .eq('device_library_identifier', input.deviceLibraryIdentifier)
      .eq('serial_number', input.serialNumber)
      .maybeSingle();

    if (fetchErr) {
      throw new Error(`[appleDeviceRepo.registerDevice:lookup] ${fetchErr.message}`);
    }

    const { error: upsertErr } = await client
      .from('apple_device_registrations')
      .upsert(
        {
          device_library_identifier: input.deviceLibraryIdentifier,
          push_token: input.pushToken,
          pass_type_identifier: input.passTypeIdentifier,
          serial_number: input.serialNumber,
          updated_at: nowIso,
        },
        { onConflict: 'device_library_identifier,serial_number' }
      );

    if (upsertErr) {
      throw new Error(`[appleDeviceRepo.registerDevice:upsert] ${upsertErr.message}`);
    }

    // Keep legacy wallet_passes.push_token synchronized for quick fallback diagnostics
    const { error: syncErr } = await client
      .from('wallet_passes')
      .update({ push_token: input.pushToken, updated_at: nowIso })
      .eq('pass_serial_number', input.serialNumber)
      .eq('pass_type', 'apple');

    if (syncErr) {
      throw new Error(`[appleDeviceRepo.registerDevice:syncPushToken] ${syncErr.message}`);
    }

    return existing ? 'updated' : 'created';
  },

  async unregisterDevice(
    client: SupabaseAdminClient,
    input: UnregisterAppleDeviceInput
  ): Promise<boolean> {
    const { data, error } = await client
      .from('apple_device_registrations')
      .delete()
      .eq('device_library_identifier', input.deviceLibraryIdentifier)
      .eq('pass_type_identifier', input.passTypeIdentifier)
      .eq('serial_number', input.serialNumber)
      .select('id');

    if (error) {
      throw new Error(`[appleDeviceRepo.unregisterDevice] ${error.message}`);
    }
    return (data?.length ?? 0) > 0;
  },

  async getSerialsForDevice(
    client: SupabaseAdminClient,
    input: GetSerialsForDeviceInput
  ): Promise<{ serialNumbers: string[]; lastUpdated: string }> {
    const { data: registrations, error: regErr } = await client
      .from('apple_device_registrations')
      .select('serial_number')
      .eq('device_library_identifier', input.deviceLibraryIdentifier)
      .eq('pass_type_identifier', input.passTypeIdentifier);

    if (regErr) {
      throw new Error(`[appleDeviceRepo.getSerialsForDevice:registrations] ${regErr.message}`);
    }

    const serials = [...new Set((registrations ?? []).map((r) => r.serial_number))];
    if (serials.length === 0) {
      return { serialNumbers: [], lastUpdated: new Date().toISOString() };
    }

    let passQuery = client
      .from('wallet_passes')
      .select('pass_serial_number, updated_at')
      .in('pass_serial_number', serials)
      .eq('status', 'active')
      .order('updated_at', { ascending: false });

    if (input.passesUpdatedSince) {
      passQuery = passQuery.gt('updated_at', input.passesUpdatedSince);
    }

    const { data: passes, error: passErr } = await passQuery;
    if (passErr) {
      throw new Error(`[appleDeviceRepo.getSerialsForDevice:passes] ${passErr.message}`);
    }

    const serialNumbers = (passes ?? []).map((p) => p.pass_serial_number);
    const lastUpdated =
      passes && passes.length > 0 && passes[0].updated_at
        ? passes[0].updated_at
        : new Date().toISOString();

    return { serialNumbers, lastUpdated };
  },

  async getPushTokensBySerial(
    client: SupabaseAdminClient,
    serialNumber: string
  ): Promise<string[]> {
    const { data, error } = await client
      .from('apple_device_registrations')
      .select('push_token')
      .eq('serial_number', serialNumber);

    if (error) {
      throw new Error(`[appleDeviceRepo.getPushTokensBySerial] ${error.message}`);
    }

    return [...new Set((data ?? []).map((r) => r.push_token).filter(Boolean))];
  },

  async deleteByPushTokens(
    client: SupabaseAdminClient,
    pushTokens: string[]
  ): Promise<void> {
    if (pushTokens.length === 0) return;

    const { error } = await client
      .from('apple_device_registrations')
      .delete()
      .in('push_token', pushTokens);

    if (error) {
      throw new Error(`[appleDeviceRepo.deleteByPushTokens] ${error.message}`);
    }
  },
};
