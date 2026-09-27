import * as crypto from 'crypto';

export class CryptoUtil {
  private static readonly KEY_LEN = 64;
  private static readonly DEFAULT_PEPPER =
    process.env.AUTH_SECRET || 'techsprout_secure_otp_hmac_pepper_minimum_32_characters';

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
   * Hashes an OTP code with HMAC-SHA256 and server-side pepper before database storage.
   * Prevents precomputed rainbow table attacks on the 6-digit keyspace.
   */
  static hashOtp(otp: string, pepper: string = this.DEFAULT_PEPPER): string {
    return crypto.createHmac('sha256', pepper).update(otp).digest('hex');
  }

  /**
   * Verifies an OTP code against stored HMAC-SHA256 hash using timingSafeEqual.
   */
  static verifyOtpHash(
    otp: string,
    storedHash: string,
    pepper: string = this.DEFAULT_PEPPER
  ): boolean {
    const computedHash = this.hashOtp(otp, pepper);
    const computedBuffer = Buffer.from(computedHash, 'hex');
    const storedBuffer = Buffer.from(storedHash, 'hex');
    if (computedBuffer.length !== storedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(computedBuffer, storedBuffer);
  }

  /**
   * Generates a cryptographically random session token (64 hex characters).
   */
  static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generates a cryptographically random OAuth state token.
   */
  static generateOAuthState(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  /**
   * Generates PKCE code_verifier and code_challenge (S256).
   */
  static generatePkce(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return { codeVerifier, codeChallenge };
  }
}
