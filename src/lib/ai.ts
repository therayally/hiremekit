/**
 * MiniMax API client for resume tailoring, scoring, and generation.
 *
 * Refs: SOC2 CC6.1 (access), OWASP A04 (insecure design).
 *
 * Centralizes all AI calls so we can:
 *  - rate-limit per user
 *  - log request IDs for traceability (no PII in logs)
 *  - apply consistent system prompts
 *  - enforce max output tokens
 */

import { getEnv } from './env.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** If true, request JSON output. We still parse defensively. */
  jsonMode?: boolean;
  /** Caller-supplied correlation ID for logging */
  requestId?: string;
}

export interface ChatResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  requestId: string;
}

export class MiniMaxError extends Error {
  constructor(message: string, public readonly statusCode?: number, public readonly requestId?: string) {
    super(message);
    this.name = 'MiniMaxError';
  }
}

/**
 * System prompt for resume tailoring. Tight scope = consistent outputs.
 *
 * Security: do NOT include user data in this prompt template. User data goes
 * in the user message only.
 */
const SYSTEM_PROMPTS = {
  tailor: `You are a precise resume editor. You take a candidate resume and a job description, then rewrite the resume to maximize match with the job.

Rules:
- Preserve all factual content. Do not invent experience, dates, or skills.
- Reorder bullets so the most relevant ones appear first under each role.
- Mirror the job description's keywords naturally where they apply.
- Quantify achievements wherever the original numbers exist; do not make up numbers.
- Return ONLY the rewritten resume. No commentary, no preface, no closing notes.
- Output valid JSON: {"summary": string, "experience": [{company, title, start, end, bullets: string[]}, ...], "skills": string[], "education": [{school, degree, year}], "keywords_used": string[], "keywords_missing": string[]}.`,

  score: `You score how well a resume matches a job description.
Return JSON only: {"score": 0-100, "matched_keywords": string[], "missing_keywords": string[], "summary": "one short sentence"}.
Be honest. Score reflects actual match, not effort.`,

  coverLetter: `You write concise, specific cover letters. No filler phrases like "I am writing to express my interest."
Match tone to the user's selection. Keep to the requested length.
Return plain text only. No JSON.`,

  signature: `You format a professional email signature as clean HTML using inline styles only.
No external CSS, no JS, no images.
Return HTML only.`,

  linkedin: `You rewrite LinkedIn Headline and About sections to be specific, outcome-focused, and ATS-friendly.
Avoid cliches like "passionate", "driven", "results-oriented".
Return JSON: {"headline": string, "about": string, "banner_prompts": ["..."], "headline_alternatives": ["..."]}.`,
} as const;

export async function chat(
  systemPromptKey: keyof typeof SYSTEM_PROMPTS,
  userContent: string,
  options: ChatOptions = {},
): Promise<ChatResponse> {
  const env = getEnv();
  const systemPrompt = SYSTEM_PROMPTS[systemPromptKey];

  const requestId = options.requestId ?? crypto.randomUUID();
  const maxTokens = options.maxTokens ?? 2000;
  const temperature = options.temperature ?? 0.4;

  const body = {
    model: env.MINIMAX_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ] satisfies ChatMessage[],
    temperature,
    max_tokens: maxTokens,
    ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  const url = `${env.MINIMAX_BASE_URL}/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
        'X-Request-Id': requestId,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new MiniMaxError(`AI service unreachable: ${(err as Error).message}`, undefined, requestId);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    // Log request ID, NOT the body or response
    console.error(JSON.stringify({ level: 'error', requestId, status: res.status, op: 'minimax' }));
    throw new MiniMaxError(`AI service error (${res.status})`, res.status, requestId);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  return {
    content: data.choices[0]?.message?.content ?? '',
    usage: {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    },
    requestId,
  };
}

/**
 * Strip markdown code fences from model output that should be JSON.
 * Defensive — handles models that ignore response_format.
 */
export function extractJson<T = unknown>(raw: string): T {
  let s = raw.trim();

  // Strip ```json fences
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/```\s*$/, '');
  }

  // Find first { and last }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1) {
    throw new Error('No JSON object found in model output');
  }
  s = s.slice(first, last + 1);

  return JSON.parse(s) as T;
}
