/**
 * Supabase clients.
 *
 * Two clients:
 *  - `getAnonClient()` — uses anon key, respects RLS. For browser code.
 *  - `getServiceClient()` — uses service role key, bypasses RLS. SERVER ONLY.
 *
 * Refs: SOC2 CC6.1, OWASP A01 (broken access control).
 *
 * Never expose the service role client to the browser.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';

let anonCache: SupabaseClient | null = null;
let serviceCache: SupabaseClient | null = null;

export function getAnonClient(): SupabaseClient {
  if (anonCache) return anonCache;
  const env = getEnv();
  anonCache = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return anonCache;
}

/**
 * Service-role client. SERVER ONLY. Use sparingly.
 * Bypasses RLS — every call must be authorised by code, not DB.
 */
export function getServiceClient(): SupabaseClient {
  if (serviceCache) return serviceCache;
  const env = getEnv();
  serviceCache = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceCache;
}

/**
 * Get user from request cookie.
 * Returns null if no session. Throws on DB error.
 */
export async function getUserFromRequest(request: Request) {
  const env = getEnv();
  const accessToken = request.headers
    .get('Cookie')
    ?.match(/sb-access-token=([^;]+)/)?.[1];

  if (!accessToken) return null;

  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
