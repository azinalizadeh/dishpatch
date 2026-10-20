import { describe, expect, it } from 'vitest';
import { generateToken, hashToken } from '../src/domain/tokens.ts';

describe('tokens', () => {
  it('generateToken returns 43-char base64url from 32 random bytes', () => {
    const tokens = Array.from({ length: 1000 }, () => generateToken());
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    }
    expect(new Set(tokens).size).toBe(1000);
  });

  it('hashToken is SHA-256 and stable', () => {
    // FIPS 180-2 test vector for "abc".
    const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(hashToken('abc').toString('hex')).toBe(expected);
    expect(hashToken('abc').equals(hashToken('abc'))).toBe(true);
    expect(hashToken('abc')).toHaveLength(32);
  });
});
