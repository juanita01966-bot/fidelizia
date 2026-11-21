import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSupabaseAdminClient,
  getSupabaseAdmin,
  resetSupabaseAdmin,
  setSupabaseAdminForTests,
  supabaseAdmin,
  type SupabaseAdminClient,
} from '@/lib/supabase/server';
import {
  appleDeviceRepo,
  customerRepo,
  employeeRepo,
  passRepo,
  redemptionRepo,
  transactionRepo,
  PosRpcError,
} from '@/lib/repositories';

describe('Supabase fail-fast server client & repositories', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    resetSupabaseAdmin();
  });

  afterEach(() => {
    resetSupabaseAdmin();
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  });

  it('fails fast when NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing (no anon/hardcoded fallback)', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-key';
    expect(() => getSupabaseAdmin()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://valid.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-must-never-be-used';
    expect(() => getSupabaseAdmin()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(() => supabaseAdmin.from('merchants')).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('supports test DI via setSupabaseAdminForTests and validates trimmed options in createSupabaseAdminClient', () => {
    const fakeClient = { from: () => ({}) } as unknown as SupabaseAdminClient;
    setSupabaseAdminForTests(fakeClient);
    expect(getSupabaseAdmin()).toBe(fakeClient);

    expect(() =>
      createSupabaseAdminClient({
        url: '   ',
        serviceRoleKey: '   ',
        factory: () => fakeClient,
      })
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);

    expect(() =>
      createSupabaseAdminClient({
        url: 'https://valid.supabase.co',
        serviceRoleKey: '   ',
        factory: () => fakeClient,
      })
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);

    let capturedUrl = '';
    let capturedKey = '';
    createSupabaseAdminClient({
      url: '  https://trimmed.supabase.co  ',
      serviceRoleKey: '  trimmed-key  ',
      factory: (u, k) => {
        capturedUrl = u;
        capturedKey = k;
        return fakeClient;
      },
    });
    expect(capturedUrl).toBe('https://trimmed.supabase.co');
    expect(capturedKey).toBe('trimmed-key');
  });

  it('employeeRepo strips pin_hash/password_hash/dsb_password_hash and scopes by merchant_id', async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const response = {
      data: [
        {
          id: 'emp-1',
          merchant_id: 'merch-1',
          location_id: null,
          name: 'Laura',
          username: 'laura',
          email: null,
          pin_hash: '$2b$10$secret',
          password_hash: '$2b$10$secret2',
          dsb_password_hash: '$2b$10$secret3',
          role: 'manager',
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    };
    const mockClient = {
      from: () => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (col: string, val: unknown) => {
            eqCalls.push([col, val]);
            return chain;
          },
          order: () => chain,
          then: (resolve: (val: typeof response) => unknown) => Promise.resolve(resolve(response)),
        };
        return chain;
      },
    } as unknown as SupabaseAdminClient;

    const list = await employeeRepo.listByMerchant(mockClient, 'merch-1');
    expect(eqCalls).toContainEqual(['merchant_id', 'merch-1']);
    expect(eqCalls).toContainEqual(['is_active', true]);
    expect(list).toHaveLength(1);
    expect('pin_hash' in list[0]).toBe(false);
    expect('password_hash' in list[0]).toBe(false);
    expect('dsb_password_hash' in list[0]).toBe(false);
  });

  it('employeeRepo.deactivateOrDelete refuses to remove the last active manager/admin', async () => {
    const response = {
      data: [
        {
          id: 'emp-cashier',
          merchant_id: 'merch-1',
          location_id: null,
          name: 'Santiago',
          username: 'santiago',
          email: null,
          role: 'cashier',
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'emp-manager',
          merchant_id: 'merch-1',
          location_id: null,
          name: 'Laura',
          username: 'laura',
          email: null,
          role: 'manager',
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    };
    const mockClient = {
      from: () => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          then: (resolve: (val: typeof response) => unknown) => Promise.resolve(resolve(response)),
        };
        return chain;
      },
    } as unknown as SupabaseAdminClient;

    await expect(
      employeeRepo.deactivateOrDelete(mockClient, 'merch-1', 'emp-manager')
    ).rejects.toThrow(/administrador o gerente activo/i);
  });

  it('transactionRepo.processPosScan and redemptionRepo.redeemReward call RPCs and map domain errors', async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const okClient = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return { data: { success: true }, error: null };
      },
    } as unknown as SupabaseAdminClient;

    await transactionRepo.processPosScan(okClient, {
      merchantId: 'merch-1',
      employeeId: 'emp-1',
      passSerialNumber: 'PASS-1',
      ticketNumber: 'FAC-100',
      amount: 25000,
    });
    expect(rpcCalls[0]?.fn).toBe('process_pos_scan');
    expect(rpcCalls[0]?.args.p_merchant_id).toBe('merch-1');

    await redemptionRepo.redeemReward(okClient, {
      merchantId: 'merch-1',
      passSerialNumber: 'PASS-1',
      managerId: 'emp-mgr',
    });
    expect(rpcCalls[1]?.fn).toBe('redeem_reward');
    expect(rpcCalls[1]?.args.p_stamps_to_deduct).toBeNull();

    const conflictClient = {
      rpc: async () => ({
        data: null,
        error: { message: 'TICKET_ALREADY_USED: El ticket FAC-100 ya fue canjeado' },
      }),
    } as unknown as SupabaseAdminClient;

    await expect(
      transactionRepo.processPosScan(conflictClient, {
        merchantId: 'merch-1',
        employeeId: 'emp-1',
        passSerialNumber: 'PASS-1',
        ticketNumber: 'FAC-100',
        amount: 25000,
      })
    ).rejects.toMatchObject({
      name: 'PosRpcError',
      code: 'TICKET_ALREADY_USED',
      statusCode: 409,
      fraudAlertType: 'ticket_reused',
    } satisfies Partial<PosRpcError>);

    const locNotFoundClient = {
      rpc: async () => ({
        data: null,
        error: { message: 'LOCATION_NOT_FOUND: Sucursal inválida o inactiva' },
      }),
    } as unknown as SupabaseAdminClient;

    await expect(
      transactionRepo.processPosScan(locNotFoundClient, {
        merchantId: 'merch-1',
        employeeId: 'emp-1',
        passSerialNumber: 'PASS-1',
        ticketNumber: 'FAC-101',
        amount: 25000,
        locationId: '00000000-0000-0000-0000-000000000999',
      })
    ).rejects.toMatchObject({
      name: 'PosRpcError',
      code: 'LOCATION_NOT_FOUND',
      statusCode: 404,
      fraudAlertType: undefined,
    } satisfies Partial<PosRpcError>);

    const geofenceClient = {
      rpc: async () => ({
        data: null,
        error: { message: 'GEOFENCE_BREACH: Fuera de rango' },
      }),
    } as unknown as SupabaseAdminClient;

    await expect(
      transactionRepo.processPosScan(geofenceClient, {
        merchantId: 'merch-1',
        employeeId: 'emp-1',
        passSerialNumber: 'PASS-1',
        ticketNumber: 'FAC-102',
        amount: 25000,
      })
    ).rejects.toMatchObject({
      code: 'GEOFENCE_BREACH',
      statusCode: 403,
      fraudAlertType: 'geofence_breach',
    } satisfies Partial<PosRpcError>);
  });

  it('customerRepo.listWithPassesByMerchant applies tier and search filters even when segment=birthday_month', async () => {
    const currentMonth = String(new Date().getUTCMonth() + 1).padStart(2, '0');
    const eqCalls: Array<[string, unknown]> = [];
    const orCalls: string[] = [];

    const customersData = [
      {
        id: 'cust-1',
        merchant_id: 'merch-1',
        full_name: 'Alice Gold',
        phone: '+573001111111',
        birthdate: `1995-${currentMonth}-10`,
        loyalty_tier: 'gold',
        rfm_segment: 'loyal',
      },
      {
        id: 'cust-2',
        merchant_id: 'merch-1',
        full_name: 'Bob Bronze',
        phone: '+573002222222',
        birthdate: `1992-${currentMonth}-15`,
        loyalty_tier: 'bronze',
        rfm_segment: 'new',
      },
    ];

    const passesData = [
      { id: 'pass-1', merchant_id: 'merch-1', customer_id: 'cust-1', pass_serial_number: 'S-1' },
      { id: 'pass-2', merchant_id: 'merch-1', customer_id: 'cust-2', pass_serial_number: 'S-2' },
    ];

    const mockClient = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (col: string, val: unknown) => {
            if (table === 'customers') eqCalls.push([col, val]);
            return chain;
          },
          or: (expr: string) => {
            if (table === 'customers') orCalls.push(expr);
            return chain;
          },
          in: () => chain,
          order: () => chain,
          then: (resolve: (val: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve(
              resolve({
                data: table === 'customers' ? customersData : [passesData[0]],
                error: null,
              })
            ),
        };
        return chain;
      },
    } as unknown as SupabaseAdminClient;

    const result = await customerRepo.listWithPassesByMerchant(mockClient, 'merch-1', {
      segment: 'birthday_month',
      tier: 'gold',
      search: 'Alice',
    });

    expect(eqCalls).toContainEqual(['loyalty_tier', 'gold']);
    expect(orCalls.some((o) => o.includes('Alice'))).toBe(true);
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0].id).toBe('cust-1');
  });

  it('passRepo fails closed on empty merchantId and appleDeviceRepo throws on secondary push_token sync error', async () => {
    let queryCount = 0;
    const passMock = {
      from: () => {
        queryCount += 1;
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: { id: 'pass-1' }, error: null }),
        };
        return chain;
      },
    } as unknown as SupabaseAdminClient;

    expect(await passRepo.getBySerial(passMock, 'PASS-001', '')).toBeNull();
    expect(await passRepo.getBySerial(passMock, 'PASS-001', '   ')).toBeNull();
    expect(await passRepo.getWithCustomerAndMerchantBySerial(passMock, 'PASS-001', '')).toBeNull();
    expect(queryCount).toBe(0);

    // Omitting merchantId (undefined) still queries by serial (for Apple PassKit)
    expect(await passRepo.getBySerial(passMock, 'PASS-001')).toEqual({ id: 'pass-1' });
    expect(queryCount).toBe(1);

    // appleDeviceRepo.registerDevice checks { error } on wallet_passes update
    const deviceMock = {
      from: (table: string) => {
        if (table === 'apple_device_registrations') {
          const chain: Record<string, unknown> = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({ data: null, error: null }),
            upsert: async () => ({ error: null }),
          };
          return chain;
        }
        if (table === 'wallet_passes') {
          const chain: Record<string, unknown> = {
            update: () => chain,
            eq: () => chain,
            then: (resolve: (val: { error: { message: string } }) => unknown) =>
              Promise.resolve(resolve({ error: { message: 'wallet_passes write failed' } })),
          };
          return chain;
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as unknown as SupabaseAdminClient;

    await expect(
      appleDeviceRepo.registerDevice(deviceMock, {
        deviceLibraryIdentifier: 'dev-1',
        pushToken: 'push-tok-1',
        passTypeIdentifier: 'pass.com.fidelizia',
        serialNumber: 'PASS-001',
      })
    ).rejects.toThrow(/syncPushToken.*wallet_passes write failed/);
  });
});
