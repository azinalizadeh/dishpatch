import { createHash, randomBytes } from 'node:crypto';

/** A capability token: 32 random bytes (256 bits) as 43 base64url characters (07-security.md › S1). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored and looked up only as their SHA-256 hash. */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
