# Incident Response

## Severity levels

| Level | Examples | Response time |
|---|---|---|
| P0 | Data breach, payment data exposed, full outage | Immediate |
| P1 | Auth bypass, partial outage, AI prompt injection | < 4h |
| P2 | Single-user bug, edge case | < 24h |
| P3 | Cosmetic | Next sprint |

## Runbook

### P0: Data breach
1. Rotate all secrets (Doppler, Vercel env, Stripe webhook secret, MiniMax key)
2. Identify scope: `SELECT * FROM audit_log WHERE created_at > {incident_time}`
3. Notify affected users within 72h (GDPR Art. 33)
4. File breach report with supervisory authority if EU users affected
5. Post-mortem within 7 days, public if material

### P1: Auth bypass
1. Force-logout all sessions (rotate JWT signing key)
2. Patch vulnerability
3. Audit log review for exploitation
4. Notify users if any account accessed

### Stripe webhook failure
1. Stripe retries automatically; check Vercel logs for last 100 webhook attempts
2. If webhook signature mismatch → likely secret rotation; re-set in Vercel env
3. If 4xx response → bug in our handler, fix + replay missed events from Stripe dashboard

## Contacts
- Owner: Ray Ally
- Stripe support: https://support.stripe.com
- MiniMax: support@minimax.io
- Supabase: support@supabase.io

## Backups
- Supabase: point-in-time recovery, 7-day retention
- Code: GitHub (origin of truth)
- Stripe data: Stripe dashboard export, monthly
