/**
 * Rate limiter for API endpoints.
 *
 * Refs: OWASP A04 (insecure design).
 *
 * In-memory for simplicity. For multi-instance deploys, swap with
 * Upstash Redis or Vercel KV.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  /** Max requests per window */
  limit: number;
  /** Window length in milliseconds */
  windowMs: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    const fresh = { count: 1, resetAt: now + config.windowMs };
    buckets.set(key, fresh);
    return { allowed: true, remaining: config.limit - 1, resetAt: fresh.resetAt };
  }

  if (existing.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: config.limit - existing.count,
    resetAt: existing.resetAt,
  };
}

/** Tier-based limit presets */
export const RATE_LIMITS = {
  anonymous: { limit: 60, windowMs: 60_000 }, // 60/min
  authed: { limit: 300, windowMs: 60_000 }, // 300/min
  aiFree: { limit: 3, windowMs: 86_400_000 }, // 3/day for free AI calls
  aiPro: { limit: 500, windowMs: 86_400_000 }, // 500/day for pro
} as const;

/**
 * Get client IP for rate limiting.
 * Behind Vercel proxy, x-forwarded-for is the real IP.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

/**
 * Periodically clean up expired buckets so we don't leak memory.
 * In a serverless environment this is a no-op (cold start anyway).
 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (b.resetAt < now) buckets.delete(k);
    }
  }, 60_000).unref?.();
}
