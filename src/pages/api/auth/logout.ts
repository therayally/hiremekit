/**
 * POST /api/auth/logout
 *
 * Clears auth cookies and redirects to home.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async () => {
  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', 'sb-access-token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  headers.append('Set-Cookie', 'sb-refresh-token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  return new Response(null, { status: 303, headers });
};

export const GET: APIRoute = async () => {
  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', 'sb-access-token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  headers.append('Set-Cookie', 'sb-refresh-token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  return new Response(null, { status: 303, headers });
};
