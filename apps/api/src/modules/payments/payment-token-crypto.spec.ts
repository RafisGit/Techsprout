import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptPaymentToken, encryptPaymentToken } from './payment-token-crypto';

describe('payment token encryption', () => {
  it('round-trips a provider token using AES-256-GCM', () => {
    const key = randomBytes(32);
    const encrypted = encryptPaymentToken('provider-token-opaque-123', key);

    expect(encrypted).not.toContain('provider-token-opaque-123');
    expect(decryptPaymentToken(encrypted, key)).toBe('provider-token-opaque-123');
  });

  it('uses a fresh IV so encrypting the same token twice yields different ciphertexts', () => {
    const key = randomBytes(32);
    const first = encryptPaymentToken('opaque-token', key);
    const second = encryptPaymentToken('opaque-token', key);

    expect(second).not.toBe(first);
    expect(decryptPaymentToken(first, key)).toBe('opaque-token');
    expect(decryptPaymentToken(second, key)).toBe('opaque-token');
  });

  it('rejects an empty token', () => {
    expect(() => encryptPaymentToken('', randomBytes(32))).toThrow(
      'Payment token must be a non-empty string'
    );
  });

  it('rejects keys that are not exactly 32 bytes', () => {
    expect(() => encryptPaymentToken('opaque-token', randomBytes(16))).toThrow(
      'Payment token encryption key must be exactly 32 bytes'
    );
    expect(() => decryptPaymentToken('v1.a.b.c', randomBytes(16))).toThrow(
      'Payment token encryption key must be exactly 32 bytes'
    );
  });

  it('rejects malformed and unsupported ciphertext versions', () => {
    const key = randomBytes(32);

    expect(() => decryptPaymentToken('v2.a.b.c', key)).toThrow(
      'Payment token ciphertext is malformed'
    );
    expect(() => decryptPaymentToken('v1.a.b', key)).toThrow(
      'Payment token ciphertext is malformed'
    );
  });

  it('rejects tampered ciphertext or the wrong key', () => {
    const key = randomBytes(32);
    const encrypted = encryptPaymentToken('opaque-token', key);
    const parts = encrypted.split('.');
    const bytes = Buffer.from(parts[3], 'base64url');
    bytes[0] ^= 1;
    parts[3] = bytes.toString('base64url');

    expect(() => decryptPaymentToken(parts.join('.'), key)).toThrow(
      'Payment token ciphertext authentication failed'
    );
    expect(() => decryptPaymentToken(encrypted, randomBytes(32))).toThrow(
      'Payment token ciphertext authentication failed'
    );
  });
});
