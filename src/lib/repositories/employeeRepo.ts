import type { SupabaseAdminClient } from '@/lib/supabase/server';
import type { Database, EmployeeRole } from '@/types/database';
import type { Employee } from '@/types/domain';

type EmployeeRow = Database['public']['Tables']['employees']['Row'];

export type PublicEmployee = Omit<
  EmployeeRow,
  'pin_hash' | 'password_hash' | 'dsb_password_hash'
>;

export interface CreateEmployeeParams {
  name: string;
  username?: string | null;
  email?: string | null;
  pinHash: string;
  passwordHash?: string | null;
  dsbPasswordHash?: string | null;
  role: EmployeeRole;
  locationId?: string | null;
}

export interface UpdateEmployeeParams {
  name?: string;
  username?: string | null;
  email?: string | null;
  pinHash?: string;
  passwordHash?: string | null;
  dsbPasswordHash?: string | null;
  role?: EmployeeRole;
  locationId?: string | null;
  isActive?: boolean;
}

const PUBLIC_EMPLOYEE_COLUMNS =
  'id, merchant_id, location_id, name, username, email, role, is_active, created_at';

export function toPublicEmployee(
  row: Partial<EmployeeRow> & Pick<EmployeeRow, 'id' | 'merchant_id' | 'name' | 'role' | 'is_active' | 'created_at'>
): PublicEmployee {
  return {
    id: row.id,
    merchant_id: row.merchant_id,
    location_id: row.location_id ?? null,
    name: row.name,
    username: row.username ?? null,
    email: row.email ?? null,
    role: row.role,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

export const employeeRepo = {
  async listByMerchant(
    client: SupabaseAdminClient,
    merchantId: string,
    activeOnly = true
  ): Promise<PublicEmployee[]> {
    let query = client
      .from('employees')
      .select(PUBLIC_EMPLOYEE_COLUMNS)
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`[employeeRepo.listByMerchant] ${error.message}`);
    }

    return ((data ?? []) as EmployeeRow[]).map((row) => toPublicEmployee(row));
  },

  async getById(
    client: SupabaseAdminClient,
    merchantId: string,
    employeeId: string
  ): Promise<PublicEmployee | null> {
    const { data, error } = await client
      .from('employees')
      .select(PUBLIC_EMPLOYEE_COLUMNS)
      .eq('id', employeeId)
      .eq('merchant_id', merchantId)
      .maybeSingle();

    if (error) {
      throw new Error(`[employeeRepo.getById] ${error.message}`);
    }
    return data ? toPublicEmployee(data as EmployeeRow) : null;
  },

  /**
   * Server-only: includes hashed PIN/password fields exclusively for bcrypt verification.
   */
  async listActiveAuthCandidates(
    client: SupabaseAdminClient,
    merchantId: string
  ): Promise<Employee[]> {
    const { data, error } = await client
      .from('employees')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`[employeeRepo.listActiveAuthCandidates] ${error.message}`);
    }
    return (data ?? []) as Employee[];
  },

  /**
   * Server-only: finds an active employee by username, email, UUID, or exact case-insensitive name.
   */
  async findByNameOrIdForAuth(
    client: SupabaseAdminClient,
    merchantId: string,
    identifier: string
  ): Promise<Employee | null> {
    const clean = identifier.trim().toLowerCase();
    if (!clean) return null;

    const candidates = await this.listActiveAuthCandidates(client, merchantId);
    return (
      candidates.find(
        (emp) =>
          emp.id.toLowerCase() === clean ||
          (emp.username && emp.username.trim().toLowerCase() === clean) ||
          (emp.email && emp.email.trim().toLowerCase() === clean) ||
          emp.name.trim().toLowerCase() === clean
      ) ?? null
    );
  },

  async create(
    client: SupabaseAdminClient,
    merchantId: string,
    input: CreateEmployeeParams
  ): Promise<PublicEmployee> {
    const { data, error } = await client
      .from('employees')
      .insert({
        merchant_id: merchantId,
        name: input.name.trim(),
        username: input.username?.trim().toLowerCase() || null,
        email: input.email?.trim().toLowerCase() || null,
        pin_hash: input.pinHash,
        password_hash: input.passwordHash ?? null,
        dsb_password_hash: input.dsbPasswordHash ?? null,
        role: input.role,
        location_id: input.locationId ?? null,
        is_active: true,
      })
      .select(PUBLIC_EMPLOYEE_COLUMNS)
      .single();

    if (error || !data) {
      throw new Error(`[employeeRepo.create] ${error?.message ?? 'Insert failed'}`);
    }
    return toPublicEmployee(data as EmployeeRow);
  },

  async update(
    client: SupabaseAdminClient,
    merchantId: string,
    employeeId: string,
    patch: UpdateEmployeeParams
  ): Promise<PublicEmployee> {
    const updatePayload: Database['public']['Tables']['employees']['Update'] = {};
    if (patch.name !== undefined) updatePayload.name = patch.name.trim();
    if (patch.username !== undefined) updatePayload.username = patch.username?.trim().toLowerCase() || null;
    if (patch.email !== undefined) updatePayload.email = patch.email?.trim().toLowerCase() || null;
    if (patch.pinHash !== undefined) updatePayload.pin_hash = patch.pinHash;
    if (patch.passwordHash !== undefined) updatePayload.password_hash = patch.passwordHash;
    if (patch.dsbPasswordHash !== undefined) updatePayload.dsb_password_hash = patch.dsbPasswordHash;
    if (patch.role !== undefined) updatePayload.role = patch.role;
    if (patch.locationId !== undefined) updatePayload.location_id = patch.locationId;
    if (patch.isActive !== undefined) updatePayload.is_active = patch.isActive;

    const { data, error } = await client
      .from('employees')
      .update(updatePayload)
      .eq('id', employeeId)
      .eq('merchant_id', merchantId)
      .select(PUBLIC_EMPLOYEE_COLUMNS)
      .single();

    if (error || !data) {
      throw new Error(`[employeeRepo.update] ${error?.message ?? 'Employee not found'}`);
    }
    return toPublicEmployee(data as EmployeeRow);
  },

  async deactivateOrDelete(
    client: SupabaseAdminClient,
    merchantId: string,
    employeeId: string
  ): Promise<void> {
    const activeEmployees = await this.listByMerchant(client, merchantId, true);
    const target = activeEmployees.find((e) => e.id === employeeId);
    if (!target) {
      throw new Error('[employeeRepo.deactivateOrDelete] Empleado activo no encontrado');
    }

    const remaining = activeEmployees.filter((e) => e.id !== employeeId);
    if (remaining.length === 0) {
      throw new Error('[employeeRepo.deactivateOrDelete] Debe permanecer al menos un empleado activo');
    }

    const isPrivileged = target.role === 'admin' || target.role === 'manager';
    if (isPrivileged) {
      const remainingPrivileged = remaining.some((e) => e.role === 'admin' || e.role === 'manager');
      if (!remainingPrivileged) {
        throw new Error(
          '[employeeRepo.deactivateOrDelete] Debe permanecer al menos un administrador o gerente activo'
        );
      }
    }

    const { error } = await client
      .from('employees')
      .update({ is_active: false })
      .eq('id', employeeId)
      .eq('merchant_id', merchantId);

    if (error) {
      throw new Error(`[employeeRepo.deactivateOrDelete] ${error.message}`);
    }
  },
};
