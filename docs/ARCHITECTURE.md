# Architecture

## System diagram

```
┌─────────────┐    HTTPS    ┌──────────────────┐
│   Browser   │ ──────────▶ │  Vercel (Astro)  │
│  (static)   │             │  + API endpoints │
└─────────────┘             └────────┬─────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
     ┌────────────────┐     ┌────────────────┐     ┌────────────────┐
     │   Supabase     │     │   MiniMax API  │     │    Stripe      │
     │  (Auth + DB)   │     │  (AI rewrite)  │     │  (Checkout)    │
     └────────────────┘     └────────────────┘     └────────────────┘
              │                                               │
              └─────────────── PII at rest ──────────────────┘
                            (AES-256, column-level)
```

## Layers

### Presentation (Astro static)
- Pages: `/`, `/pricing`, `/login`, `/app/*`
- Components: hero, feature-grid, pricing-table, footer
- No emojis. No third-party fonts (system stack only for privacy).
- Static HTML, cached at CDN edge.

### Application (Astro server endpoints)
- `/api/auth/*` — Supabase proxy
- `/api/tailor` — resume rewrite
- `/api/score` — match score
- `/api/cover-letter` — cover letter gen
- `/api/signature` — email signature gen
- `/api/linkedin` — LinkedIn optimizer
- `/api/site/*` — Studio portfolio CRUD
- `/api/stripe/*` — checkout + webhook

### Data (Supabase)
Tables:
- `users` (id, email, role, created_at, mfa_secret)
- `resumes` (id, user_id, encrypted_text, parsed_json, created_at)
- `tailored_outputs` (id, user_id, jd_hash, output_json, pdf_url, created_at)
- `portfolios` (id, user_id, slug, html_json, custom_domain, created_at)
- `audit_log` (id, user_id, action, ip_hash, created_at)

Row-Level Security (RLS):
- All tables: `auth.uid() = user_id OR role = 'admin'`

### External
- **MiniMax API** — chat completions, used for rewrite + scoring
- **Stripe Checkout** — payment, hosted page (PCI scope = 0)
- **Resend** — transactional email (free tier)

## Data flow: resume tailor

```
1. User uploads resume.pdf (5MB max, MIME sniff)
2. POST /api/tailor { resumeText, jobDescription }
3. Zod validates input
4. Rate limit check (60/min anon, 300/min authed)
5. Auth check (free tier gets 1 call/day, Pro unlimited)
6. Call MiniMax: rewrite resume to match JD
7. Call MiniMax: score match (0-100), return keyword gaps
8. Sanitize output (DOMPurify on any HTML)
9. Store in `tailored_outputs` (encrypted)
10. Return JSON to client
11. Client renders preview + ATS PDF + Fancy PDF (Puppeteer SSR)
```

## Build & deploy

- `npm run dev` — Astro dev server
- `npm run build` — static + SSR build
- `npm run test` — Vitest unit + Playwright e2e
- `npm run audit` — `npm audit` + `gitleaks`
- Push to `main` → Vercel auto-deploy (preview branches get preview URLs)
- Releases: tag `vX.Y.Z` → GitHub Action runs full test suite + deploys to prod
