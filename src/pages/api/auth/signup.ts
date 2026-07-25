/**
 * POST /api/auth/signup
 *
 * Creates a Supabase user, optionally creates a Stripe Checkout session
 * for paid plans, and returns the checkout URL.
 *
 * Flow:
 *  free: signUp → set cookies → return /app
 *  pro/studio: signUp → set cookies → create Stripe Checkout → return URL
 */
import type { APIRoute } from 'astro';
import { getEnv } from '@/lib/env';
import { SignupSchema } from '@/lib/validation';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/ratelimit';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const prerender = false;

const PRICE_MAP = {
  pro: 'STRIPE_PRICE_PRO',
  studio: 'STRIPE_PRICE_STUDIO_LIFETIME',
  'studio-monthly': 'STRIPE_PRICE_STUDIO_MONTHLY',
} as const;

export const POST: APIRoute = async (request) => {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`signup:${ip}`, { limit: 5, windowMs: 60 * 60_000 });
  if (!rl.allowed) {
    return new Response(JSON.stringify({ ok: false, error: 'Too many signup attempts.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' },
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

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Invalid input.',
      details: parsed.error.flatten().fieldErrors,
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const env = getEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { role: parsed.data.plan },
    },
  });

  if (error || !data.user) {
    return new Response(JSON.stringify({
      ok: false,
      error: error?.message ?? 'Sign up failed.',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // If free, set cookies and return
  if (parsed.data.plan === 'free' || !data.session) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (data.session) {
      const isProd = env.NODE_ENV === 'production';
      const cookieBase = isProd
        ? 'Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400'
        : 'Path=/; HttpOnly; SameSite=Strict; Max-Age=86400';
      headers.append('Set-Cookie', `sb-access-token=${data.session.access_token}; ${cookieBase}`);
      headers.append('Set-Cookie', `sb-refresh-token=${data.session.refresh_token}; ${cookieBase}`);
    }
    return new Response(JSON.stringify({ ok: true, user: { id: data.user.id, email: data.user.email } }), {
      status: 200, headers,
    });
  }

  // Paid plan: create Stripe Checkout
  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-09-30.acacia' });
    const priceKey = PRICE_MAP[parsed.data.plan as keyof typeof PRICE_MAP];
    const priceId = env[priceKey];

    const session = await stripe.checkout.sessions.create({
      mode: parsed.data.plan === 'studio-monthly' ? 'subscription' : 'payment',
      customer_email: parsed.data.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.APP_URL}/app?welcome=1`,
      cancel_url: `${env.APP_URL}/pricing`,
      metadata: {
        userId: data.user.id,
        plan: parsed.data.plan,
      },
    });

    const headers = new Headers({ 'Content-Type': 'application/json' });
    const isProd = env.NODE_ENV === 'production';
    const cookieBase = isProd
      ? 'Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400'
      : 'Path=/; HttpOnly; SameSite=Strict; Max-Age=86400';
    headers.append('Set-Cookie', `sb-access-token=${data.session.access_token}; ${cookieBase}`);
    headers.append('Set-Cookie', `sb-refresh-token=${data.session.refresh_token}; ${cookieBase}`);

    return new Response(JSON.stringify({
      ok: true,
      checkoutUrl: session.url,
    }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Could not start payment. Account created. Try /pricing from your dashboard.',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
