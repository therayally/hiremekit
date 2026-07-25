/**
 * Astro middleware — populates Astro.locals.user from the auth cookie.
 * Server-side only. Doesn't expose service role to the client.
 */
import { defineMiddleware } from 'astro:middleware';
import { getUserFromRequest } from '@/lib/db';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = null;
  try {
    const user = await getUserFromRequest(context.request);
    if (user) {
      context.locals.user = {
        id: user.id,
        email: user.email ?? '',
        role: (user.user_metadata?.role as string) ?? 'free',
      };
    }
  } catch {
    // Auth lookup failed — treat as anonymous
  }
  return next();
});
