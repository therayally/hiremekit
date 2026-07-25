/**
 * JSON Resume adapter.
 *
 * The JSON Resume schema (jsonresume.org) is the de-facto open standard.
 * Many tools consume it (LinkedIn, GitHub, etc.). We round-trip with it so
 * users can move data in and out of HireMeKit freely.
 *
 * Spec: https://jsonresume.org/schema/
 *
 * Refs: SOC2 CC6.7 (data integrity), ISO 27001 A.8.10 (info deletion).
 */

import { z } from 'zod';
import { ResumeSchema, type Resume } from './resume-schema.js';

// JSON Resume v1.0.0 schema, strict subset
const LocationSchema = z.object({
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  countryCode: z.string().optional(),
  region: z.string().optional(),
}).passthrough();

const ProfileSchema = z.object({
  network: z.string().optional(),
  username: z.string().optional(),
  url: z.string().optional(),
}).passthrough();

const BasicsSchema = z.object({
  name: z.string().optional(),
  label: z.string().optional(),
  image: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  url: z.string().optional(),
  summary: z.string().optional(),
  location: LocationSchema.optional(),
  profiles: z.array(ProfileSchema).optional(),
}).passthrough();

const WorkSchema = z.object({
  name: z.string().optional(),
  position: z.string().optional(),
  location: z.string().optional(),
  url: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
}).passthrough();

const EducationSchema = z.object({
  institution: z.string().optional(),
  url: z.string().optional(),
  area: z.string().optional(),
  studyType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  score: z.string().optional(),
  courses: z.array(z.string()).optional(),
}).passthrough();

const ProjectSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  url: z.string().optional(),
  roles: z.array(z.string()).optional(),
  entity: z.string().optional(),
  type: z.string().optional(),
}).passthrough();

const SkillsSchema = z.object({
  name: z.string().optional(),
  level: z.string().optional(),
  keywords: z.array(z.string()).optional(),
}).passthrough();

const CertificateSchema = z.object({
  name: z.string().optional(),
  date: z.string().optional(),
  issuer: z.string().optional(),
  url: z.string().optional(),
}).passthrough();

const AwardSchema = z.object({
  title: z.string().optional(),
  date: z.string().optional(),
  awarder: z.string().optional(),
  summary: z.string().optional(),
}).passthrough();

const LanguageSchema = z.object({
  language: z.string().optional(),
  fluency: z.string().optional(),
}).passthrough();

const InterestSchema = z.object({
  name: z.string().optional(),
  keywords: z.array(z.string()).optional(),
}).passthrough();

const ReferenceSchema = z.object({
  name: z.string().optional(),
  reference: z.string().optional(),
}).passthrough();

const PublicationSchema = z.object({
  name: z.string().optional(),
  publisher: z.string().optional(),
  releaseDate: z.string().optional(),
  url: z.string().optional(),
  summary: z.string().optional(),
}).passthrough();

const VolunteerSchema = z.object({
  organization: z.string().optional(),
  position: z.string().optional(),
  url: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
}).passthrough();

export const JsonResumeSchema = z.object({
  $schema: z.string().optional(),
  basics: BasicsSchema.optional(),
  work: z.array(WorkSchema).optional(),
  volunteer: z.array(VolunteerSchema).optional(),
  education: z.array(EducationSchema).optional(),
  awards: z.array(AwardSchema).optional(),
  certificates: z.array(CertificateSchema).optional(),
  publications: z.array(PublicationSchema).optional(),
  skills: z.array(SkillsSchema).optional(),
  languages: z.array(LanguageSchema).optional(),
  interests: z.array(InterestSchema).optional(),
  references: z.array(ReferenceSchema).optional(),
  projects: z.array(ProjectSchema).optional(),
}).passthrough();

export type JsonResume = z.infer<typeof JsonResumeSchema>;

/**
 * Find the URL of a specific social profile in JSON Resume basics.profiles.
 */
function findProfileUrl(profiles: z.infer<typeof ProfileSchema>[] | undefined, network: string): string | undefined {
  if (!profiles) return undefined;
  return profiles.find((p) => p.network?.toLowerCase() === network.toLowerCase())?.url;
}

/**
 * Convert a JSON Resume document to our internal Resume schema.
 * Missing fields stay missing — never fabricate.
 */
export function fromJsonResume(input: unknown): Partial<Resume> {
  const parsed = JsonResumeSchema.parse(input);
  const out: Partial<Resume> = {
    version: 1,
    source: 'file-upload',
    sourceMeta: { format: 'json-resume' },
  };

  // Basics → identity
  if (parsed.basics) {
    if (parsed.basics.name) out.fullName = parsed.basics.name;
    if (parsed.basics.label) out.headline = parsed.basics.label;
    if (parsed.basics.email) out.email = parsed.basics.email;
    if (parsed.basics.phone) out.phone = parsed.basics.phone;
    if (parsed.basics.summary) out.summary = parsed.basics.summary;
    if (parsed.basics.url) out.website = parsed.basics.url;
    if (parsed.basics.location) {
      const parts = [
        parsed.basics.location.city,
        parsed.basics.location.region,
        parsed.basics.location.countryCode,
      ].filter(Boolean);
      if (parts.length) out.location = parts.join(', ');
    }
    out.linkedinUrl = findProfileUrl(parsed.basics.profiles, 'LinkedIn');
    out.githubUrl = findProfileUrl(parsed.basics.profiles, 'GitHub');
  }

  // Work → experience
  if (parsed.work?.length) {
    out.experience = parsed.work.map((w) => ({
      company: w.name ?? '',
      title: w.position ?? '',
      start: w.startDate ?? '',
      end: w.endDate ?? '',
      location: w.location,
      bullets: w.highlights ?? (w.summary ? [w.summary] : []),
    })).filter((e) => e.company || e.title);
  }

  // Education
  if (parsed.education?.length) {
    out.education = parsed.education.map((e) => ({
      school: e.institution ?? '',
      degree: e.studyType,
      field: e.area,
      start: e.startDate,
      end: e.endDate,
      gpa: e.score,
    })).filter((e) => e.school);
  }

  // Projects
  if (parsed.projects?.length) {
    out.projects = parsed.projects.map((p) => ({
      name: p.name ?? '',
      description: p.description,
      url: p.url,
      bullets: p.highlights ?? [],
    })).filter((p) => p.name);
  }

  // Skills (flatten all skill groups into a single deduped list)
  if (parsed.skills?.length) {
    const all = new Set<string>();
    for (const group of parsed.skills) {
      for (const kw of group.keywords ?? []) {
        if (kw.trim()) all.add(kw.trim());
      }
      if (group.name?.trim()) all.add(group.name.trim());
    }
    out.skills = Array.from(all).slice(0, 100);
  }

  // Languages
  if (parsed.languages?.length) {
    out.languages = parsed.languages
      .map((l) => ({ name: l.language ?? '' }))
      .filter((l) => l.name);
  }

  // Certifications
  if (parsed.certificates?.length) {
    out.certifications = parsed.certificates.map((c) => ({
      name: c.name ?? '',
      issuer: c.issuer,
      date: c.date,
      url: c.url,
    })).filter((c) => c.name);
  }

  return out;
}

/**
 * Convert our internal Resume to JSON Resume format for export.
 */
export function toJsonResume(resume: Partial<Resume>): JsonResume {
  const profiles: z.infer<typeof ProfileSchema>[] = [];
  if (resume.linkedinUrl) profiles.push({ network: 'LinkedIn', url: resume.linkedinUrl });
  if (resume.githubUrl) profiles.push({ network: 'GitHub', url: resume.githubUrl });
  if (resume.portfolioUrl) profiles.push({ network: 'Portfolio', url: resume.portfolioUrl });

  return {
    $schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
    basics: {
      name: resume.fullName,
      label: resume.headline,
      email: resume.email,
      phone: resume.phone,
      url: resume.website,
      summary: resume.summary,
      profiles: profiles.length ? profiles : undefined,
    },
    work: resume.experience?.map((e) => ({
      name: e.company,
      position: e.title,
      startDate: e.start,
      endDate: e.end,
      location: e.location,
      highlights: e.bullets,
    })),
    education: resume.education?.map((ed) => ({
      institution: ed.school,
      studyType: ed.degree,
      area: ed.field,
      startDate: ed.start,
      endDate: ed.end,
      score: ed.gpa,
    })),
    skills: resume.skills?.length ? [{
      name: 'Skills',
      keywords: resume.skills,
    }] : undefined,
    projects: resume.projects?.map((p) => ({
      name: p.name,
      description: p.description,
      url: p.url,
      highlights: p.bullets,
    })),
    certificates: resume.certifications?.map((c) => ({
      name: c.name,
      issuer: c.issuer,
      date: c.date,
      url: c.url,
    })),
    languages: resume.languages?.map((l) => ({
      language: l.name,
      fluency: l.level,
    })),
  };
}

/**
 * Validate a JSON Resume import. Returns the parsed object or throws.
 */
export function parseJsonResumeImport(input: string): Partial<Resume> {
  const data = JSON.parse(input);
  return fromJsonResume(data);
}
