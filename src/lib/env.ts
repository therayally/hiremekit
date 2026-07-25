/**
 * Environment variable loader with type safety.
 *
 * Refs: SOC2 CC6.1 (logical access), OWASP A05 (misconfig).
 *
 * Server-side only. Never import this in client code.
 */

interface Env {
  // MiniMax
  readonly MINIMAX_API_KEY: string;
  readonly MINIMAX_BASE_URL: string;
  readonly MINIMAX_MODEL: string;

  // Stripe
  readonly STRIPE_SECRET_KEY: string;
  readonly STRIPE_WEBHOOK_SECRET: string;
  readonly STRIPE_PRICE_PRO: string;
  readonly STRIPE_PRICE_STUDIO_LIFETIME: string;
  readonly STRIPE_PRICE_STUDIO_MONTHLY: string;

  // Supabase
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;

  // Resend
  readonly RESEND_API_KEY: string;

  // App
  readonly APP_URL: string;
  readonly NODE_ENV: 'development' | 'production' | 'test';

  // 64-char hex string used for AES-256-GCM column-level encryption of PII
  readonly PII_ENCRYPTION_KEY: string;
}

let cached: Env | null = null;

function required(name: keyof Env): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export function getEnv(): Env {
  if (cached) return cached;

  const nodeEnv = (process.env.NODE_ENV ?? 'development') as Env['NODE_ENV'];

  cached = {
    MINIMAX_API_KEY: required('MINIMAX_API_KEY'),
    MINIMAX_BASE_URL: required('MINIMAX_BASE_URL'),
    MINIMAX_MODEL: required('MINIMAX_MODEL'),
    STRIPE_SECRET_KEY: required('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: required('STRIPE_WEBHOOK_SECRET'),
    STRIPE_PRICE_PRO: required('STRIPE_PRICE_PRO'),
    STRIPE_PRICE_STUDIO_LIFETIME: required('STRIPE_PRICE_STUDIO_LIFETIME'),
    STRIPE_PRICE_STUDIO_MONTHLY: required('STRIPE_PRICE_STUDIO_MONTHLY'),
    SUPABASE_URL: required('SUPABASE_URL'),
    SUPABASE_ANON_KEY: required('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
    RESEND_API_KEY: required('RESEND_API_KEY'),
    APP_URL: required('APP_URL'),
    NODE_ENV,
    PII_ENCRYPTION_KEY: required('PII_ENCRYPTION_KEY'),
  };

  // Validate encryption key shape
  if (!/^[a-f0-9]{64}$/i.test(cached.PII_ENCRYPTION_KEY)) {
    throw new Error('PII_ENCRYPTION_KEY must be 64 hex chars (32 bytes).');
  }

  return cached;
}

/**
 * Public env exposed to the client. Only safe values.
 */
export const PUBLIC_ENV = {
  APP_URL: process.env.PUBLIC_APP_URL ?? 'https://hiremekit.app',
  STRIPE_PUBLISHABLE_KEY: process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
} as const;
