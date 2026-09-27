import * as crypto from 'crypto';

export class CryptoUtil {
  private static readonly KEY_LEN = 64;

  /**
   * Hashes a password using Scrypt with a 16-byte cryptographically random salt.
   * Format: saltHex:keyHex
   */
  static async hashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16).toString('hex');
      crypto.scrypt(password, salt, this.KEY_LEN, (err, derivedKey) => {
        if (err) return reject(err);
        resolve(`${salt}:${derivedKey.toString('hex')}`);
      });
    });
  }

  /**
   * Verifies a password against stored Scrypt salt:keyHex using timingSafeEqual to prevent timing attacks.
   */
  static async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    return new Promise((resolve) => {
      const parts = storedHash.split(':');
      if (parts.length !== 2) return resolve(false);

      const [salt, keyHex] = parts;
      const keyBuffer = Buffer.from(keyHex, 'hex');

      crypto.scrypt(password, salt, this.KEY_LEN, (err, derivedKey) => {
        if (err) return resolve(false);
        try {
          const match = crypto.timingSafeEqual(keyBuffer, derivedKey);
          resolve(match);
        } catch {
          resolve(false);
        }
      });
    });
  }

  /**
   * Generates a secure 6-digit numeric OTP code.
   */
  static generateOtp(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Hashes an OTP code with SHA-256 before database storage.
   */
  static hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  /**
   * Generates a cryptographically random session token (64 hex characters).
   */
  static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
