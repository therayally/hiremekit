/**
 * The unified Resume schema. Every ingest path (file, voice, AI interview,
 * LinkedIn, notes, photo) produces this shape. Tailoring, PDFs, and the
 * portfolio site all read from this.
 *
 * Refs: SOC2 CC6.7 (data integrity), ISO 27001 A.8.10 (information deletion).
 */

import { z } from 'zod';

// Strict, but with lots of optional fields so partial inputs still parse.
export const ResumeSchema = z.object({
  version: z.literal(1).default(1),

  // Identity
  fullName: z.string().max(120).optional(),
  headline: z.string().max(220).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  location: z.string().max(120).optional(),
  website: z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
  portfolioUrl: z.string().url().optional(),

  // Summary
  summary: z.string().max(2000).optional(),

  // Experience — array of roles
  experience: z.array(z.object({
    company: z.string().max(120),
    title: z.string().max(160),
    start: z.string().max(40).optional(), // free-form: "Jan 2020", "2020", "Q1 2020"
    end: z.string().max(40).optional(),   // "" for current
    location: z.string().max(120).optional(),
    bullets: z.array(z.string().max(500)).max(20).default([]),
  })).max(30).default([]),

  // Education
  education: z.array(z.object({
    school: z.string().max(160),
    degree: z.string().max(160).optional(),
    field: z.string().max(160).optional(),
    start: z.string().max(40).optional(),
    end: z.string().max(40).optional(),
    gpa: z.string().max(20).optional(),
    notes: z.string().max(500).optional(),
  })).max(10).default([]),

  // Skills
  skills: z.array(z.string().max(60)).max(100).default([]),

  // Projects
  projects: z.array(z.object({
    name: z.string().max(120),
    description: z.string().max(500).optional(),
    url: z.string().url().optional(),
    bullets: z.array(z.string().max(300)).max(6).default([]),
  })).max(15).default([]),

  // Certifications & awards
  certifications: z.array(z.object({
    name: z.string().max(160),
    issuer: z.string().max(160).optional(),
    date: z.string().max(40).optional(),
    url: z.string().url().optional(),
  })).max(20).default([]),

  // Languages
  languages: z.array(z.object({
    name: z.string().max(60),
    level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native']).optional(),
  })).max(20).default([]),

  // Provenance — every ingest path tags the source so users can audit
  source: z.enum([
    'file-upload',
    'paste',
    'voice',
    'ai-interview',
    'notes',
    'linkedin-url',
    'website-url',
    'social-import',
    'photo-ocr',
    'manual',
  ]).default('manual'),
  sourceMeta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),

  // Audit
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type Resume = z.infer<typeof ResumeSchema>;

/**
 * Source of truth for what an ingest path can return.
 * All paths MUST produce a Resume (or a partial Resume + missing fields flagged).
 */
export interface IngestResult {
  resume: Partial<Resume>;
  /** Fields we couldn't extract — surfaced to the user as "fill these in" */
  missingFields: string[];
  /** Confidence 0-1 per top-level field, used to ask smarter follow-ups */
  confidence: Record<string, number>;
  /** Raw transcript or notes — kept for audit + re-processing */
  rawInput?: string;
}
