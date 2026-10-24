// src/lib/supabase/server.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tmsdbjrzaggegfxkxfqz.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!serviceRoleKey) {
  console.warn('[Supabase Server] No se encontró SUPABASE_SERVICE_ROLE_KEY ni NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

/**
 * Cliente Supabase de Servidor con permisos de Service Role
 * Se utiliza exclusivamente en API Routes (Node.js runtime) para bypassear RLS en operaciones administrativas seguras.
 */
export const supabaseAdmin = createClient<any>(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
