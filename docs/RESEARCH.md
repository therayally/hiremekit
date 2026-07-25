# Research — Open-Source Prior Art

Studied July 2026. Findings inform HireMeKit's architecture.

## Tier 1: Closest to our scope

### [reactive-resume](https://github.com/amruthpillai/reactive-resume) — 39,795 stars
- **License:** MIT (free to use, fork, sell derivative)
- **Stack:** TypeScript monorepo, React, tRPC, Prisma, Postgres
- **What they do well:** Privacy-first, local-first, thousands of templates, drag-drop
- **What we can borrow directly:**
  - `packages/import/src/json-resume.tsx` — JSON Resume schema adapter (Zod-validated)
  - `packages/import/src/reactive-resume-json.tsx` — their own format converter
  - `packages/import/src/level.ts` — language-level parsing
  - `packages/import/src/date.ts` — flexible date parsing (ISO 8601 + partial)
  - `packages/pdf/src/templates` — PDF template architecture
  - `packages/ai/src/prompts/` — AI prompt templates for resume improvements
- **What they DON'T do that we will:** AI tailoring to job descriptions, voice input, AI interview, lifetime pricing, Stripe payments
- **Verdict:** Adopt their `import` and `pdf` packages as inspiration. Their schema is RFC-aligned (JSON Resume standard). Don't fork — re-implement with our own choices.

### [open-resume](https://github.com/xitanggg/open-resume) — 8,774 stars
- **License:** MIT
- **What they do:** Resume builder + PDF parser. Their parser is heuristic-only (no AI).
- **What we can borrow directly:**
  - `src/app/lib/parse-resume-from-pdf/` — full heuristic PDF parser:
    1. `read-pdf.ts` — pdf.js to text items with x/y coords
    2. `group-text-items-into-lines.ts` — cluster items by x/y proximity
    3. `group-lines-into-sections.ts` — section headers (Experience, Education, etc.)
    4. `extract-resume-from-sections/` — per-field extractors:
       - `extract-profile.ts`
       - `extract-education.ts`
       - `extract-project.ts`
       - `extract-skills.ts`
       - `extract-work-experience.ts`
- **Limitations:** English-only, single-column resumes only. We can fix this by adding AI fallback.
- **Verdict:** Borrow the parser architecture. Wrap each extractor with an AI fallback when heuristics fail.

## Tier 2: Standards & supporting libs

| Repo | What | Notes |
|---|---|---|
| [jsonresume/schema](https://github.com/jsonresume/schema) | Open resume JSON schema | Industry standard. 100+ tools consume it. Read+write it. |
| [tesseract.js](https://github.com/naptha/tesseract.js) — 38,561 stars | Browser OCR, 100+ langs | Use for photo-of-resume ingestion. MIT. |
| [pdf.js](https://github.com/mozilla/pdf.js) | Mozilla PDF parser | Use for resume parsing. Apache 2.0. |
| [mammoth.js](https://github.com/mwilliamson/mammoth.js) | DOCX → HTML | Use for DOCX resume parsing. BSD-2. |
| [josephlimtech/linkedin-profile-scraper-api](https://github.com/josephlimtech/linkedin-profile-scraper-api) — 769 stars | LinkedIn scraping reference | Use only public data. LinkedIn TOS — read carefully. |

## Tier 3: Templates & design

| Repo | Notes |
|---|---|
| [rendercv/rendercv](https://github.com/rendercv/rendercv) — 17,194 stars | YAML-based, programmatic, gorgeous LaTeX output |
| [Renovamen/oh-my-cv](https://github.com/Renovamen/oh-my-cv) — 1,038 stars | Local-first Markdown CV |
| [sadanandpai/resume-builder](https://github.com/sadanandpai/resume-builder) — 1,215 stars | Clean React reference |

## What this means for HireMeKit

### Direct deps to add
- `tesseract.js` — for photo OCR ingest
- `pdfjs-dist` — for cleaner PDF parsing (Mozilla's, well-maintained)
- `mammoth` — already in package.json
- `pdf-parse` — already in package.json

### Plan
1. **Replace our speculative PDF parser** with a forked + simplified version of open-resume's heuristic parser, wrapped with AI fallback when heuristics fail.
2. **Adopt JSON Resume schema** as a public input/output format so users can round-trip with other tools.
3. **Borrow reactive-resume's PDF template architecture** for our 20 templates.
4. **Use tesseract.js** for the photo/handwritten resume ingest path.
5. **Voice ingest** uses Web Speech API (browser-native) — no library needed.
6. **AI interview** uses MiniMax streaming with structured prompts.

### What we DON'T copy
- reactive-resume's tRPC/Prisma stack — overkill for solo founder, $0 budget
- open-resume's English-only heuristic parser — too limiting
- Anyone's UI library — we use Apple-style vanilla CSS

### License compliance
- All code we study/release will be MIT-compatible
- Credit reactive-resume and open-resume in our README acknowledgments
- Don't copy their template designs verbatim — design our own, inspired by
