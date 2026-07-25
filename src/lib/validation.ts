/**
 * Zod schemas for API input validation.
 *
 * Refs: OWASP A03:2021 (Injection), SOC2 CC6.1.
 *
 * Every endpoint MUST validate input with one of these schemas before processing.
 */

import { z } from 'zod';

// Email — RFC 5322 simplified
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

// Password — minimum 12 chars, no max (passphrase-friendly)
export const PasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(256, 'Password too long');

// Signup request
export const SignupSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  plan: z.enum(['free', 'pro', 'studio']).default('free'),
});

// Login request
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(256),
});

// Resume tailor request
export const TailorSchema = z.object({
  resumeText: z.string().min(50).max(50_000), // 50 chars min, 50k max
  jobDescription: z.string().min(50).max(20_000),
  templateId: z.enum(['ats-classic', 'modern-minimal', 'canvas-artistic', 'editorial', 'tech']).default('modern-minimal'),
});

// Score-only request (free tier)
export const ScoreSchema = z.object({
  resumeText: z.string().min(50).max(50_000),
  jobDescription: z.string().min(50).max(20_000),
});

// Cover letter request
export const CoverLetterSchema = z.object({
  resumeText: z.string().min(50).max(50_000),
  jobDescription: z.string().min(50).max(20_000),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  tone: z.enum(['formal', 'friendly', 'confident']).default('formal'),
});

// Email signature request
export const SignatureSchema = z.object({
  name: z.string().min(2).max(100),
  title: z.string().max(100).optional(),
  email: EmailSchema,
  phone: z.string().max(30).optional(),
  website: z.string().url().max(200).optional(),
  linkedin: z.string().url().max(200).optional(),
  style: z.enum(['minimal', 'standard', 'detailed']).default('standard'),
});

// LinkedIn optimizer request
export const LinkedinSchema = z.object({
  currentHeadline: z.string().max(220).optional(),
  currentAbout: z.string().max(2_600).optional(),
  targetRole: z.string().min(2).max(200),
  industry: z.string().max(100).optional(),
});

// Stripe checkout request
export const CheckoutSchema = z.object({
  plan: z.enum(['pro', 'studio', 'studio-monthly']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

// Portfolio site save
export const PortfolioSaveSchema = z.object({
  slug: z.string().min(3).max(40).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, hyphens'),
  templateId: z.string().min(1).max(50),
  blocks: z.array(z.object({
    type: z.enum(['header', 'about', 'projects', 'resume', 'contact']),
    data: z.record(z.string(), z.unknown()),
  })).max(50),
  customDomain: z.string().max(253).optional(),
});
