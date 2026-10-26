import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * Encrypts a payment-provider token for database storage using AES-256-GCM.
 *
 * The key must be supplied from a secret manager/environment configuration and
 * must never be stored alongside the ciphertext. This helper intentionally does
 * not read configuration or provide a default key.
 */
export function encryptPaymentToken(plaintext: string, encryptionKey: Uint8Array): string {
  assertEncryptionKey(encryptionKey);
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Payment token must be a non-empty string');
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(encryptionKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Versioned, base64url-encoded fields are safe to persist as text.
  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Authenticates and decrypts a token previously returned by encryptPaymentToken.
 * It never logs the token or includes cryptographic input in error messages.
 */
export function decryptPaymentToken(encoded: string, encryptionKey: Uint8Array): string {
  assertEncryptionKey(encryptionKey);

  if (typeof encoded !== 'string') {
    throw new Error('Payment token ciphertext is malformed');
  }

  const parts = encoded.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION || parts.slice(1).some((part) => !part)) {
    throw new Error('Payment token ciphertext is malformed');
  }

  const [, ivEncoded, authTagEncoded, ciphertextEncoded] = parts;
  const iv = decodeBase64Url(ivEncoded);
  const authTag = decodeBase64Url(authTagEncoded);
  const ciphertext = decodeBase64Url(ciphertextEncoded);

  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
    throw new Error('Payment token ciphertext is malformed');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, Buffer.from(encryptionKey), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    if (!plaintext) {
      throw new Error('Payment token plaintext is empty');
    }
    return plaintext;
  } catch {
    // Keep authentication failures generic; do not leak token or crypto details.
    throw new Error('Payment token ciphertext authentication failed');
  }
}

function assertEncryptionKey(encryptionKey: Uint8Array): void {
  if (!(encryptionKey instanceof Uint8Array) || encryptionKey.byteLength !== KEY_BYTES) {
    throw new Error('Payment token encryption key must be exactly 32 bytes');
  }
}

function decodeBase64Url(value: string): Buffer {
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new Error('Payment token ciphertext is malformed');
  }
  return decoded;
}
