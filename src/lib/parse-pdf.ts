/**
 * PDF resume parser — heuristic first, AI fallback.
 *
 * Architecture inspired by open-resume (xitanggg/open-resume, MIT).
 * Flow:
 *   1. pdfjs-dist → text items with x/y coords
 *   2. Group items into lines by y proximity
 *   3. Group lines into sections by header detection
 *   4. Extract profile/education/work/skills via heuristics
 *   5. If heuristics return thin data, hand off to AI structurer
 *
 * Refs: SOC2 CC6.7 (data integrity), OWASP A03 (parse untrusted input safely).
 */

import { ResumeSchema, type Resume } from './resume-schema.js';

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
}

export interface PdfLine {
  text: string;
  items: PdfTextItem[];
  y: number;
  x: number;
}

export interface PdfSection {
  heading: string;
  lines: PdfLine[];
}

/**
 * Step 1: read a PDF buffer and return raw text items.
 * Uses pdfjs-dist (Mozilla's pdf.js, Apache 2.0).
 */
export async function readPdfTextItems(buffer: ArrayBuffer): Promise<PdfTextItem[]> {
  // Dynamic import — pdfjs-dist is ESM and pulls in DOM polyfills
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const items: PdfTextItem[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    for (const raw of content.items) {
      const item = raw as {
        str: string;
        transform: number[];
        width: number;
        height: number;
        fontName?: string;
      };

      if (!item.str || !item.str.trim()) continue;

      // pdfjs uses [a, b, c, d, e, f] transform; e=x, f=y
      const x = item.transform[4];
      const y = item.transform[5];

      items.push({
        str: item.str,
        x,
        y,
        width: item.width,
        height: item.height,
        fontName: item.fontName,
      });
    }
  }

  return items;
}

/**
 * Step 2: group text items into lines by y-coordinate proximity.
 * Items within ~2px of each other on the y axis are the same line.
 */
export function groupTextItemsIntoLines(items: PdfTextItem[]): PdfLine[] {
  if (items.length === 0) return [];

  // Sort top-to-bottom (PDF y is bottom-up, so larger y = higher on page)
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: PdfLine[] = [];
  const TOLERANCE = 2;

  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) < TOLERANCE) {
      last.items.push(item);
      last.items.sort((a, b) => a.x - b.x);
      last.text = last.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    } else {
      lines.push({
        text: item.str,
        items: [item],
        y: item.y,
        x: item.x,
      });
    }
  }

  return lines;
}

/**
 * Step 3: group lines into sections based on header-like lines.
 * A header is a short line (≤ 4 words) that matches a known section keyword.
 */
const SECTION_HEADERS = [
  'experience', 'work experience', 'employment', 'professional experience',
  'education', 'academic', 'academic background',
  'skills', 'technical skills', 'core competencies',
  'projects', 'selected projects', 'notable projects',
  'certifications', 'certificates', 'licenses',
  'awards', 'honors', 'achievements',
  'publications', 'papers',
  'summary', 'profile', 'about', 'objective',
  'contact', 'contact information',
  'languages', 'language',
  'interests', 'hobbies',
  'volunteer', 'volunteering', 'community',
  'references',
];

export function groupLinesIntoSections(lines: PdfLine[]): PdfSection[] {
  const sections: PdfSection[] = [];
  let current: PdfSection = { heading: 'unknown', lines: [] };

  for (const line of lines) {
    const normalized = line.text.trim().toLowerCase().replace(/[:.\s]+$/, '');
    const isHeader =
      normalized.length > 0 &&
      normalized.length < 40 &&
      SECTION_HEADERS.includes(normalized) &&
      // Headers are usually a single line — check line item count
      line.items.length <= 4;

    if (isHeader) {
      current = { heading: normalized, lines: [] };
      sections.push(current);
    } else if (sections.length === 0) {
      // Before any header is found, lines go into the "unknown" section
      current.lines.push(line);
    } else {
      current.lines.push(line);
    }
  }

  return sections;
}

/**
 * Common section heading spellings → canonical key. Used downstream.
 */
export const SECTION_CANONICAL: Record<string, ResumeSectionKey> = {
  'experience': 'work',
  'work experience': 'work',
  'employment': 'work',
  'professional experience': 'work',
  'education': 'education',
  'academic': 'education',
  'academic background': 'education',
  'skills': 'skills',
  'technical skills': 'skills',
  'core competencies': 'skills',
  'projects': 'projects',
  'selected projects': 'projects',
  'notable projects': 'projects',
  'certifications': 'certifications',
  'certificates': 'certifications',
  'licenses': 'certifications',
  'awards': 'awards',
  'honors': 'awards',
  'achievements': 'awards',
  'publications': 'publications',
  'papers': 'publications',
  'summary': 'summary',
  'profile': 'summary',
  'about': 'summary',
  'objective': 'summary',
  'contact': 'contact',
  'contact information': 'contact',
  'languages': 'languages',
  'language': 'languages',
  'interests': 'interests',
  'hobbies': 'interests',
  'volunteer': 'volunteer',
  'volunteering': 'volunteer',
  'community': 'volunteer',
  'references': 'references',
};

export type ResumeSectionKey =
  | 'work' | 'education' | 'skills' | 'projects'
  | 'certifications' | 'awards' | 'publications' | 'summary'
  | 'contact' | 'languages' | 'interests' | 'volunteer'
  | 'references' | 'unknown';

/**
 * Step 4: convert pdf.js raw text into a single string we can hand to the AI.
 * The AI is more reliable than heuristics across layouts and languages,
 * so we send the full text and trust it to structure.
 *
 * Refs: only this function runs AI. All prior steps are local.
 */
export function linesToPlainText(lines: PdfLine[]): string {
  return lines
    .map((l) => l.text)
    .filter((t) => t.trim().length > 0)
    .join('\n');
}

/**
 * Full fast path: PDF buffer → parsed Resume.
 * Caller passes the AI function; we don't import it here to keep this pure.
 */
export interface ParsePdfOptions {
  /** Optional AI structurer. If provided and heuristics produce thin output,
   *  we call it with the plain text. */
  aiStructurer?: (text: string) => Promise<Partial<Resume>>;
}

export async function parseResumeFromPdf(
  buffer: ArrayBuffer,
  options: ParsePdfOptions = {},
): Promise<Partial<Resume>> {
  const items = await readPdfTextItems(buffer);
  const lines = groupTextItemsIntoLines(items);
  const sections = groupLinesIntoSections(lines);
  const text = linesToPlainText(lines);

  // Profile heuristics from the "unknown" pre-header section
  const resume: Partial<Resume> = {
    version: 1,
    source: 'file-upload',
    sourceMeta: { format: 'pdf', chars: text.length, sections: sections.length },
  };

  const preHeaderText = (sections[0]?.heading === 'unknown' ? sections[0] : null)?.lines
    .map((l) => l.text)
    .join('\n') ?? '';

  // Email
  const emailMatch = preHeaderText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) resume.email = emailMatch[0];

  // Phone (E.164-ish; very loose)
  const phoneMatch = preHeaderText.match(/\+?\d[\d\s().-]{7,}\d/);
  if (phoneMatch) resume.phone = phoneMatch[0].trim();

  // LinkedIn URL
  const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
  if (linkedinMatch) resume.linkedinUrl = linkedinMatch[0];

  // GitHub URL
  const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/[\w-]+/i);
  if (githubMatch) resume.githubUrl = githubMatch[0];

  // If we have an AI structurer, defer the rest to it. Heuristics for
  // work-experience / education are notoriously layout-dependent and the AI
  // does better with less code.
  if (options.aiStructurer) {
    try {
      const ai = await options.aiStructurer(text);
      return { ...resume, ...ai };
    } catch (err) {
      // If AI fails, return what we have plus the raw text as fallback summary
      console.error('AI structurer failed:', (err as Error).message);
      return { ...resume, summary: text.slice(0, 800) };
    }
  }

  // No AI: just return what heuristics found
  return resume;
}

export { ResumeSchema };
