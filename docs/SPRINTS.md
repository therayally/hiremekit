# Sprint Log

Sprints are scoped, shippable units. No time frames. Each Sprint ends with a deploy.

## Sprint 0 — Foundation (shipped)
- Repo + docs scaffolded
- Security baseline documented (SOC2/ISO/OWASP)
- Architecture documented
- Brand guard profile created

## Sprint 1 — Landing page (shipped)
- Apple-style hero
- Feature grid
- Pricing table ($9.99 / $39)
- Signup form
- SEO meta + OG tags

## Sprint 2 — Auth (basic; full Supabase schema in Sprint 2.5)
- Sign up / sign in / sign out endpoints (cookie-based)
- Email verification — deferred
- MFA stub — deferred

## Sprint 3 — Resume engine + ingest (in progress)
- Upload (PDF/DOCX/TXT)
- Parse (pdfjs-dist for PDFs, mammoth for DOCX, AI for everything)
- Heuristic PDF parser wrapped with AI fallback (architecture borrowed from open-resume, MIT)
- JSON Resume adapter (round-trip with jsonresume.org standard)
- AI structurer for: text, notes, voice, interview, JSON Resume, document text
- /api/ingest endpoint with multipart + JSON branches
- /app/resume page with 7-tab intake UI: file, text, voice, interview, notes, LinkedIn, JSON

### Ingest surface (Sprint 3.5 — extends Sprint 3)
The "drop your stuff in" intake. The fastest possible path from "I have nothing prepared" to "I have a draft resume."
- **File upload**: PDF, DOCX, DOC, TXT, RTF, MD, HTML, ODT, PNG/JPG/HEIC (OCR via tesseract.js), handwritten (OCR + AI cleanup)
- **Paste**: raw text, LinkedIn PDF export, job history bullets
- **Voice / mic**: Web Speech API → live transcript → AI structurer turns "I worked at Google for 3 years as a PM on Android Auto" into a structured bullet
- **AI interview**: 8-12 questions asked by the AI ("Walk me through your last role" → "What was the impact?" → "How did you measure it?"). Saves the Q&A, builds the resume from answers.
- **Free-form notes**: textarea where user brain-dumps anything. AI extracts: jobs, dates, skills, education, projects.
- **LinkedIn URL**: paste profile URL → fetch public data → parse to resume schema
- **Import existing website**: paste URL of personal site / portfolio / about.me / GitHub profile → scrape → structure
- **Social handles** (optional): Threads, X, GitHub, Dribbble, Behance, Medium → fetch recent posts → enrich "About" section with voice
- **Old resume photo**: OCR scan of a photographed/scanned paper resume (the "I lost my Word file" case)

All paths converge to the same internal `Resume` schema.

## Sprint 4 — Cover letter + signature + LinkedIn
- Cover letter generator (3 lengths)
- Email signature generator (HTML)
- LinkedIn "About" + "Headline" rewriter
- LinkedIn banner generator (4 sizes)

## Sprint 5 — Payments
- Stripe Checkout
- $9.99 lifetime SKU
- $39 lifetime SKU
- $9/mo Studio subscription SKU
- Webhook (signature verified)
- Receipt via Resend

## Sprint 6 — Portfolio site builder (Studio)
- 10 templates (clean + artistic)
- Drag-drop editor
- `yourname.hiremekit.app` subdomain (Vercel)
- Custom domain support
- Export as static HTML
- Resume embed from Pro account

## Sprint 7 — Business card + logo
- Business card generator (PDF, 3.5x2)
- Logo generator (AI prompts + SVG)
- 5 starter styles

## Sprint 8 — Skills assessment
- 20-question quiz per role
- Skill profile JSON
- Missing-skill recommendations
- Learning roadmap (links to free resources)

## Sprint 9 — Marketing site + SEO
- 10 SEO articles: "Resume for X"
- Reddit launch kit
- Twitter demo videos
- Product Hunt launch
- acquire.com listing prep (with verified Stripe data)
