# Security Baseline

HireMeKit follows a defense-in-depth approach mapped to three frameworks:

- **SOC2 Type II** — Trust Services Criteria (Security, Availability, Confidentiality)
- **ISO/IEC 27001:2022** — Annex A controls
- **OWASP Top 10 (2021)** — Web application risks

This document is the source of truth. Every code change must conform.

---

## 1. Authentication & Authorization

| Control | Implementation | Framework ref |
|---|---|---|
| Password hashing | bcrypt cost 12+ | ISO A.8.24, OWASP A02:2021 |
| Session tokens | HTTP-only, Secure, SameSite=Strict cookies, 24h expiry | SOC2 CC6.1, OWASP A05 |
| MFA | TOTP via Supabase Auth for Studio tier | ISO A.8.17 |
| Account lockout | 5 failed attempts → 15-min cooldown | OWASP A07 |
| RBAC | 3 roles: `free`, `pro`, `studio` | SOC2 CC6.3 |

## 2. Data Protection

| Control | Implementation | Framework ref |
|---|---|---|
| Encryption at rest | AES-256 (Supabase managed) | SOC2 CC6.7, ISO A.8.24 |
| Encryption in transit | TLS 1.3 only, HSTS preload | SOC2 CC6.7, OWASP A02 |
| PII handling | Resume text encrypted at column level; deleted after 90 days inactive | GDPR Art. 5(1)(e) |
| Secrets | Never in code. Doppler/Vercel env vars only. | SOC2 CC6.1, OWASP A02 |
| Logging | No PII, no secrets, no tokens in logs | SOC2 CC7.2 |

## 3. Input Validation (OWASP A03)

- All API endpoints validate input via Zod schemas
- File uploads: MIME sniff (not just extension), 5MB max, magic-byte check
- HTML rendering: DOMPurify on all user-generated HTML before render
- SQL: parameterised queries only (Supabase client)

## 4. API Security (OWASP A04)

- Rate limits: 60 req/min anon, 300 req/min authed
- Stripe webhooks: signature verification, replay protection
- CORS: allow only `hiremekit.app` and `*.hiremekit.app`
- CSRF: SameSite=Strict cookies + double-submit token on state-changing endpoints

## 5. Dependency Management (OWASP A06)

- Dependabot enabled
- `npm audit` runs in CI on every PR
- Lockfile committed
- No unmaintained deps (last release > 2 years = blocked)

## 6. Logging & Monitoring (SOC2 CC7.2)

- Structured JSON logs to Vercel + Logflare
- Alerts on: 5xx spike, auth-failure spike, Stripe webhook failures
- Daily log review

## 7. Incident Response

- 72h breach notification (GDPR)
- Runbook: `docs/INCIDENT.md`
- Backup: Supabase point-in-time recovery, 7-day retention

## 8. Secure SDLC

- Every PR: code review + `npm audit` + secret scan (`gitleaks`)
- No direct pushes to `main`
- Tagged releases only

---

## Threat model (STRIDE summary)

| Threat | Mitigation |
|---|---|
| Spoofing (impersonation) | MFA + signed cookies |
| Tampering (data manipulation) | TLS + DB-level RLS |
| Repudiation (denied actions) | Structured audit log |
| Info disclosure | PII encryption, no PII in logs |
| DoS | Rate limits + Vercel WAF |
| Elevation of privilege | RBAC + Zod-validated input |
