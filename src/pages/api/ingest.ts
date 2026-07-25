/**
 * POST /api/ingest
 *
 * The single entry point for every "drop your stuff in" input.
 * Branched by `type` param:
 *   - file: multipart/form-data with a file (PDF, DOCX, DOC, TXT, RTF, MD, HTML, ODT, image)
 *   - json: JSON Resume import
 *   - text: pasted plain text
 *   - notes: free-form brain dump
 *   - linkedin: LinkedIn URL (public data only)
 *   - voice: transcript from Web Speech API
 *   - interview: AI interview Q&A history
 *
 * All paths converge to a Partial<Resume> persisted encrypted in Supabase.
 *
 * Refs: OWASP A03 (input validation), SOC2 CC6.7 (PII encryption).
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { getUserFromRequest } from '@/lib/db';
import { checkRateLimit, RATE_LIMITS, getClientIp } from '@/lib/ratelimit';
import { chat, extractJson } from '@/lib/ai';
import { encrypt } from '@/lib/crypto';
import { parseResumeFromPdf, linesToPlainText, groupTextItemsIntoLines, readPdfTextItems } from '@/lib/parse-pdf';
import { parseJsonResumeImport } from '@/lib/json-resume';
import { ResumeSchema, type Resume } from '@/lib/resume-schema';
import mammoth from 'mammoth';
import { createHash } from 'node:crypto';

export const prerender = false;

const IngestTypeSchema = z.enum([
  'file', 'json', 'text', 'notes', 'linkedin', 'voice', 'interview',
]);

const TextBodySchema = z.object({
  type: z.literal('text'),
  text: z.string().min(50).max(50_000),
});

const NotesBodySchema = z.object({
  type: z.literal('notes'),
  text: z.string().min(20).max(20_000),
});

const InterviewBodySchema = z.object({
  type: z.literal('interview'),
  answers: z.array(z.object({
    question: z.string().max(500),
    answer: z.string().max(5_000),
  })).min(3).max(30),
});

const LinkedinBodySchema = z.object({
  type: z.literal('linkedin'),
  url: z.string().url().refine(
    (u) => /^https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w-]+\/?$/i.test(u),
    { message: 'Must be a valid LinkedIn profile URL' },
  ),
});

const VoiceBodySchema = z.object({
  type: z.literal('voice'),
  transcript: z.string().min(20).max(50_000),
});

const JsonBodySchema = z.object({
  type: z.literal('json'),
  json: z.string().min(2).max(200_000),
});

const IngestBodySchema = z.discriminatedUnion('type', [
  TextBodySchema, NotesBodySchema, InterviewBodySchema,
  LinkedinBodySchema, VoiceBodySchema, JsonBodySchema,
]);

const STRUCTURE_SYSTEM_PROMPT = `You are a precise resume data extractor. You receive raw text and produce a structured Resume JSON.

Rules:
- Extract only what is clearly stated. Do NOT invent jobs, dates, schools, or skills.
- If a field is missing, omit it.
- Preserve the original wording for bullets and summary where possible.
- Format dates as they appear (e.g., "Jan 2020", "2020", "Q1 2020").
- Return strict JSON only. No comments, no trailing commas.

Output schema:
{
  "fullName": string,
  "headline": string,
  "email": string,
  "phone": string,
  "location": string,
  "website": string,
  "linkedinUrl": string,
  "githubUrl": string,
  "summary": string,
  "experience": [{ "company": string, "title": string, "start": string, "end": string, "location": string, "bullets": string[] }],
  "education": [{ "school": string, "degree": string, "field": string, "start": string, "end": string, "gpa": string }],
  "skills": string[],
  "projects": [{ "name": string, "description": string, "url": string, "bullets": string[] }],
  "certifications": [{ "name": string, "issuer": string, "date": string, "url": string }],
  "languages": [{ "name": string, "level": string }]
}`;

async function aiStructure(rawText: string, source: string): Promise<Partial<Resume>> {
  const res = await chat('tailor', rawText, {
    jsonMode: true,
    maxTokens: 4000,
    temperature: 0.1,
    requestId: createHash('sha256').update(`ingest-${source}-${rawText.length}`).digest('hex').slice(0, 16),
  });
  return extractJson<Partial<Resume>>(res.content);
}

async function handleFileUpload(request: Request): Promise<{ ok: true; resume: Partial<Resume> } | { ok: false; error: string }> {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return { ok: false, error: 'No file uploaded.' };
  }

  // 5MB max (OWASP A04: defense)
  const MAX = 5 * 1024 * 1024;
  if (file.size > MAX) {
    return { ok: false, error: 'File too large. Max 5MB.' };
  }

  // MIME sniff (not just extension) — OWASP A03
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 8));
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
  const isDocx = head[0] === 0x50 && head[1] === 0x4B; // PK (zip)
  const isPlainText = /^text\//.test(file.type);

  if (isPdf) {
    const resume = await parseResumeFromPdf(buf, {
      aiStructurer: (text) => aiStructure(text, 'pdf'),
    });
    return { ok: true, resume };
  }

  if (isDocx && /\.docx$/i.test(file.name)) {
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    const text = result.value;
    const resume = await aiStructure(text, 'docx');
    return { ok: true, resume };
  }

  if (isPlainText || /\.(txt|md|rtf|html?)$/i.test(file.name)) {
    const text = new TextDecoder().decode(buf);
    const resume = await aiStructure(text, 'text-file');
    return { ok: true, resume };
  }

  // Image: OCR via tesseract.js (client-side normally; server-side via worker)
  // For now, return a clear error so we don't pretend to OCR.
  if (/^image\//.test(file.type)) {
    return {
      ok: false,
      error: 'Image OCR is handled in the browser. Photo upload is not yet supported on this endpoint.',
    };
  }

  return { ok: false, error: 'Unsupported file type. Use PDF, DOCX, TXT, MD, RTF, or HTML.' };
}

async function handleLinkedInUrl(url: string): Promise<{ ok: true; resume: Partial<Resume> } | { ok: false; error: string }> {
  // LinkedIn does not allow scraping per their TOS.
  // We surface a clear error and offer the alternative: paste your LinkedIn PDF export.
  return {
    ok: false,
    error: 'LinkedIn blocks automated access. Please export your profile as a PDF (LinkedIn → "Save as PDF") and upload it, or paste your About section text.',
  };
}

async function ingestLinkedInByExportText(text: string): Promise<Partial<Resume>> {
  return aiStructure(text, 'linkedin-pdf-export');
}

export const POST: APIRoute = async (request) => {
  // Auth + rate limit
  const user = await getUserFromRequest(request);
  const ip = getClientIp(request);
  const rateKey = user ? `u:${user.id}` : `ip:${ip}`;
  const limit = user ? RATE_LIMITS.authed : RATE_LIMITS.anonymous;
  const rl = checkRateLimit(rateKey, limit);

  if (!rl.allowed) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Too many requests. Please slow down.',
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
        'X-RateLimit-Remaining': '0',
      },
    });
  }

  // Free tier limit: 3 ingests/day
  if (!user) {
    const freeRl = checkRateLimit(`anon-ingest:${ip}`, RATE_LIMITS.aiFree);
    if (!freeRl.allowed) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Free tier limit reached. Sign up for $9.99 lifetime to continue.',
      }), { status: 402, headers: { 'Content-Type': 'application/json' } });
    }
  }

  const contentType = request.headers.get('Content-Type') ?? '';

  // File upload — multipart
  if (contentType.startsWith('multipart/form-data')) {
    const result = await handleFileUpload(request);
    if (!result.ok) {
      return new Response(JSON.stringify({ ok: false, error: result.error }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    return await persistResume(result.resume, user?.id ?? null, 'file-upload');
  }

  // JSON body — branch on type
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = IngestBodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Invalid input.',
      details: parsed.error.flatten().fieldErrors,
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const data = parsed.data;
  let resume: Partial<Resume>;

  switch (data.type) {
    case 'json':
      try {
        resume = parseJsonResumeImport(data.json);
      } catch (err) {
        return new Response(JSON.stringify({
          ok: false, error: 'Invalid JSON Resume format.',
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      break;

    case 'text':
      resume = await aiStructure(data.text, 'paste');
      break;

    case 'notes':
      resume = await aiStructure(data.notes, 'notes');
      break;

    case 'voice':
      resume = await aiStructure(data.transcript, 'voice');
      break;

    case 'interview': {
      // Concatenate Q&A as a transcript, then run the same structurer.
      const transcript = data.answers
        .map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`)
        .join('\n\n');
      resume = await aiStructure(transcript, 'interview');
      break;
    }

    case 'linkedin': {
      const result = await handleLinkedInUrl(data.url);
      if (!result.ok) {
        return new Response(JSON.stringify({ ok: false, error: result.error }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      resume = result.resume;
      break;
    }

    default: {
      // Exhaustive check
      const _exhaustive: never = data;
      return new Response(JSON.stringify({ ok: false, error: 'Unsupported ingest type.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return await persistResume(resume, user?.id ?? null, data.type);
};

async function persistResume(
  resume: Partial<Resume>,
  userId: string | null,
  source: string,
): Promise<Response> {
  // Validate via schema
  const validated = ResumeSchema.partial().parse(resume);
  const env = getEnv();

  // If no user, return the resume so they can preview without signing up
  if (!userId) {
    return new Response(JSON.stringify({
      ok: true,
      resume: validated,
      preview: true,
      message: 'Preview only. Sign up to save.',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // Encrypt and persist
  const encrypted = encrypt(JSON.stringify(validated));
  const { getServiceClient } = await import('@/lib/db');
  const db = getServiceClient();

  const { error } = await db.from('resumes').insert({
    user_id: userId,
    source,
    encrypted_payload: encrypted,
    parsed_at: new Date().toISOString(),
  });

  if (error) {
    return new Response(JSON.stringify({
      ok: false, error: 'Failed to save resume.',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    ok: true,
    resume: validated,
    saved: true,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({
    ok: false,
    error: 'GET not supported. Use POST with a JSON body or multipart file upload.',
  }), { status: 405, headers: { 'Content-Type': 'application/json' } });
};
