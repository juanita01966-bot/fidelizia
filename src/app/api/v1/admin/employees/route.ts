import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody } from '@/lib/api/validation';
import { hashSecret } from '@/lib/auth/password';
import { requireAuth } from '@/lib/auth/session';
import { employeeRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const CreateEmployeeSchema = z.object({
  name: z.string().trim().min(2, 'Nombre requerido').max(120),
  username: z.string().trim().min(2).max(80).optional().nullable(),
  email: z.string().trim().email().max(160).optional().nullable(),
  pin: z.string().regex(/^\d{4}$/, 'El PIN debe ser de 4 dígitos numéricos'),
  dsbPassword: z.string().min(6).max(128).optional().nullable(),
  role: z.enum(['cashier', 'manager', 'admin']).default('cashier'),
  locationId: z.string().uuid().optional().nullable(),
});

const UpdateEmployeeSchema = z.object({
  employeeId: z.string().uuid('ID de empleado inválido'),
  name: z.string().trim().min(2).max(120).optional(),
  username: z.string().trim().min(2).max(80).optional().nullable(),
  email: z.string().trim().email().max(160).optional().nullable(),
  pin: z.string().regex(/^\d{4}$/, 'El PIN debe ser de 4 dígitos numéricos').optional(),
  dsbPassword: z.string().min(6).max(128).optional().nullable(),
  role: z.enum(['cashier', 'manager', 'admin']).optional(),
  locationId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
});

const DeleteEmployeeSchema = z.object({
  employeeId: z.string().uuid('ID de empleado inválido'),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const employees = await employeeRepo.listByMerchant(supabase, auth.session.merchantId, false);
    return NextResponse.json({ success: true, employees });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al listar empleados';
    return NextResponse.json({ error: 'EMPLOYEES_FETCH_FAILED', message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const rateLimit = applyRateLimit(req, 'admin:employees:create', {
    limit: 30,
    windowMs: 60_000,
    keySuffix: auth.session.userId,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, CreateEmployeeSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const pinHash = await hashSecret(parsed.data.pin);
    const dsbPasswordHash = parsed.data.dsbPassword
      ? await hashSecret(parsed.data.dsbPassword)
      : null;

    const employee = await employeeRepo.create(supabase, auth.session.merchantId, {
      name: parsed.data.name,
      username: parsed.data.username ?? null,
      email: parsed.data.email ?? null,
      pinHash,
      dsbPasswordHash,
      role: parsed.data.role,
      locationId: parsed.data.locationId ?? null,
    });

    return NextResponse.json({ success: true, employee }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al crear empleado';
    return NextResponse.json({ error: 'EMPLOYEE_CREATE_FAILED', message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const parsed = await parseJsonBody(req, UpdateEmployeeSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const patch: Parameters<typeof employeeRepo.update>[3] = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.username !== undefined) patch.username = parsed.data.username;
    if (parsed.data.email !== undefined) patch.email = parsed.data.email;
    if (parsed.data.pin !== undefined) patch.pinHash = await hashSecret(parsed.data.pin);
    if (parsed.data.dsbPassword !== undefined) {
      patch.dsbPasswordHash = parsed.data.dsbPassword
        ? await hashSecret(parsed.data.dsbPassword)
        : null;
    }
    if (parsed.data.role !== undefined) patch.role = parsed.data.role;
    if (parsed.data.locationId !== undefined) patch.locationId = parsed.data.locationId;
    if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;

    const employee = await employeeRepo.update(
      supabase,
      auth.session.merchantId,
      parsed.data.employeeId,
      patch
    );

    return NextResponse.json({ success: true, employee });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar empleado';
    return NextResponse.json({ error: 'EMPLOYEE_UPDATE_FAILED', message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const parsed = await parseJsonBody(req, DeleteEmployeeSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    await employeeRepo.deactivateOrDelete(
      supabase,
      auth.session.merchantId,
      parsed.data.employeeId
    );
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al desactivar empleado';
    return NextResponse.json({ error: 'EMPLOYEE_DELETE_FAILED', message }, { status: 400 });
  }
}
