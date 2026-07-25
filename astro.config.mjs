import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Security headers applied to every response.
// Refs:
//   - OWASP A05:2021 Security Misconfiguration
//   - SOC2 CC6.1 Logical Access
const securityHeaders = [
  // HSTS: force HTTPS for 2 years, including subdomains
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Prevent MIME sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Clickjacking protection
  { key: 'X-Frame-Options', value: 'DENY' },
  // XSS filter (legacy browsers)
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  // Restrict referrer leakage
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Permissions policy (disable unused browser features)
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
  },
  // CSP: lock down script/style sources. Stripe.js whitelisted for checkout.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.minimax.io https://api.stripe.com",
      "frame-src https://js.stripe.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
    ].join('; '),
  },
];

export default defineConfig({
  output: 'server',
  adapter: vercel({
    webAnalytics: { enabled: false }, // Privacy: no third-party analytics
    imageService: false,
  }),
  server: {
    port: 4321,
    host: '127.0.0.1', // Bind to localhost only in dev (OWASP A05)
  },
  vite: {
    server: {
      // Dev server hardening
      strictPort: true,
    },
  },
});

// Vercel-specific header config
export const vercelHeaders = securityHeaders.map((h) => ({
  source: '/(.*)',
  headers: [{ key: h.key, value: h.value }],
}));
