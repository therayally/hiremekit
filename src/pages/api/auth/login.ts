/**
 * POST /api/auth/login
 *
 * Validates creds with Supabase Auth and sets HttpOnly cookies.
 * Rate-limited: 5 failed attempts in 15 min triggers lockout.
 */
import type { APIRoute } from 'astro';
import { getEnv } from '@/lib/env';
import { LoginSchema } from '@/lib/validation';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/ratelimit';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

export const POST: APIRoute = async (request) => {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`login:${ip}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!rl.allowed) {
    return new Response(JSON.stringify({ ok: false, error: 'Too many attempts. Try again later.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '900' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid input.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const env = getEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.session) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Invalid email or password.',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // Set HttpOnly cookies. We forward the access token; supabase-js refreshes it.
  const isProd = env.NODE_ENV === 'production';
  const cookieBase = isProd
    ? 'Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400'
    : 'Path=/; HttpOnly; SameSite=Strict; Max-Age=86400';

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', `sb-access-token=${data.session.access_token}; ${cookieBase}`);
  headers.append('Set-Cookie', `sb-refresh-token=${data.session.refresh_token}; ${cookieBase}`);

  return new Response(JSON.stringify({ ok: true, user: { id: data.user.id, email: data.user.email } }), {
    status: 200,
    headers,
  });
};
