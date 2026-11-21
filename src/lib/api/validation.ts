import { NextResponse } from 'next/server';
import { z } from 'zod';

export type ValidationResult<T> =
  | { success: true; data: T; response: null }
  | { success: false; data: null; response: NextResponse };

export async function parseJsonBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<ValidationResult<z.infer<T>>> {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return {
      success: false,
      data: null,
      response: NextResponse.json(
        { error: 'INVALID_JSON', message: 'El cuerpo de la solicitud no es un JSON válido' },
        { status: 400 }
      ),
    };
  }

  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      response: NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Error de validación en los datos enviados',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      ),
    };
  }

  return { success: true, data: parsed.data as z.infer<T>, response: null };
}

export function parseSearchParams<T extends z.ZodTypeAny>(
  url: URL | string,
  schema: T
): ValidationResult<z.infer<T>> {
  const parsedUrl = typeof url === 'string' ? new URL(url, 'http://localhost') : url;
  const rawParams = Object.fromEntries(parsedUrl.searchParams.entries());
  const parsed = schema.safeParse(rawParams);

  if (!parsed.success) {
    return {
      success: false,
      data: null,
      response: NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Parámetros de consulta inválidos',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      ),
    };
  }

  return { success: true, data: parsed.data as z.infer<T>, response: null };
}
