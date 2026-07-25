/**
 * AES-256-GCM column-level encryption for PII at rest.
 *
 * Refs: GDPR Art. 32, SOC2 CC6.7, ISO 27001 A.8.24.
 *
 * Used to encrypt resume text, parsed JSON, and any other PII in Supabase.
 * The encryption key lives in env vars only — never in the DB.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getEnv } from './env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, GCM standard
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const env = getEnv();
  return Buffer.from(env.PII_ENCRYPTION_KEY, 'hex');
}

export interface EncryptedField {
  /** Base64-encoded IV (12 bytes) */
  iv: string;
  /** Base64-encoded ciphertext */
  ct: string;
  /** Base64-encoded auth tag (16 bytes) */
  tag: string;
  /** Algorithm version — bump if algorithm changes */
  v: 1;
}

/**
 * Encrypt a UTF-8 string. Returns a structured object safe to store in JSONB.
 */
export function encrypt(plaintext: string): EncryptedField {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
    v: 1,
  };
}

/**
 * Decrypt a field produced by `encrypt`. Throws if auth tag fails
 * (which is the integrity check — modified ciphertext will not decrypt).
 */
export function decrypt(field: EncryptedField): string {
  if (field.v !== 1) {
    throw new Error(`Unsupported encryption version: ${field.v}`);
  }
  const key = getKey();
  const iv = Buffer.from(field.iv, 'base64');
  const ct = Buffer.from(field.ct, 'base64');
  const tag = Buffer.from(field.tag, 'base64');

  if (iv.length !== IV_LENGTH) throw new Error('Invalid IV length');
  if (tag.length !== AUTH_TAG_LENGTH) throw new Error('Invalid auth tag length');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * Hash an IP address for the audit log without storing the raw IP.
 * (GDPR data-minimization.)
 */
export function hashIp(ip: string, salt = 'hiremekit-audit'): string {
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}
