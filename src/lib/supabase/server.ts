import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type SupabaseAdminClient = SupabaseClient<Database>;
export type SupabaseAdminFactory = (url: string, serviceRoleKey: string) => SupabaseAdminClient;

let cachedAdminClient: SupabaseAdminClient | null = null;
let customFactory: SupabaseAdminFactory | null = null;
let customClientOverride: SupabaseAdminClient | null = null;

function validateServerEnv(
  rawUrl: string | undefined,
  rawServiceRoleKey: string | undefined
): { url: string; serviceRoleKey: string } {
  const url = rawUrl?.trim();
  const serviceRoleKey = rawServiceRoleKey?.trim();

  if (!url) {
    throw new Error('[Supabase Server] Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!/^https?:\/\/.+/.test(url)) {
    throw new Error('[Supabase Server] Invalid NEXT_PUBLIC_SUPABASE_URL format');
  }
  if (!serviceRoleKey) {
    throw new Error('[Supabase Server] Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }

  return { url, serviceRoleKey };
}

export function createSupabaseAdminClient(options?: {
  url?: string;
  serviceRoleKey?: string;
  factory?: SupabaseAdminFactory;
}): SupabaseAdminClient {
  const rawUrl = options?.url !== undefined ? options.url : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey =
    options?.serviceRoleKey !== undefined
      ? options.serviceRoleKey
      : process.env.SUPABASE_SERVICE_ROLE_KEY;
  const env = validateServerEnv(rawUrl, rawKey);

  const factory = options?.factory ?? customFactory;
  if (factory) {
    return factory(env.url, env.serviceRoleKey);
  }

  return createClient<Database>(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getSupabaseAdmin(overrideClient?: SupabaseAdminClient): SupabaseAdminClient {
  if (overrideClient) return overrideClient;
  if (customClientOverride) return customClientOverride;
  if (!cachedAdminClient) {
    cachedAdminClient = createSupabaseAdminClient();
  }
  return cachedAdminClient;
}

export function setSupabaseAdminForTests(
  clientOrFactory: SupabaseAdminClient | SupabaseAdminFactory | null
): void {
  cachedAdminClient = null;
  if (typeof clientOrFactory === 'function') {
    customFactory = clientOrFactory;
    customClientOverride = null;
  } else {
    customFactory = null;
    customClientOverride = clientOrFactory;
  }
}

export function resetSupabaseAdmin(): void {
  cachedAdminClient = null;
  customFactory = null;
  customClientOverride = null;
}

/**
 * Lazy fail-fast proxy preserved for legacy routes until M2 migrates them to `getSupabaseAdmin()`.
 * Evaluates env vars on first property access rather than module import so `next build` stays side-effect free.
 */
export const supabaseAdmin: SupabaseAdminClient = new Proxy({} as SupabaseAdminClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
