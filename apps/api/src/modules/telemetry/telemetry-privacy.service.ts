import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { env } from '../../config/env.config';

/**
 * Privacy-preserving telemetry identifier hashing service.
 * Implements ADR-P7-001 Section 2:
 * 1. Hashes user and session identifiers using HMAC-SHA256 with a rotating daily salt.
 * 2. Salt rotates strictly on UTC day boundaries (00:00:00 UTC).
 * 3. Salt is held purely in process memory; never persisted alongside events.
 * 4. Fails closed when the required salt is unavailable. Never falls back to raw identifiers or unkeyed hashes.
 * 5. Deliberately limits cross-day learner linkage; zero stable cross-day tracking identifiers are introduced.
 */
@Injectable()
export class TelemetryPrivacyService {
  private readonly logger = new Logger(TelemetryPrivacyService.name);

  // In-process memory store for daily salts: Map<YYYY-MM-DD, hexSalt>
  private dailySalts = new Map<string, string>();

  // Configurable master key override (for unit testing)
  private masterSecretOverride: string | null = null;

  // Fail-closed simulation toggle for testing
  private saltUnavailableForTesting = false;

  /**
   * Retrieves or derives the rotating salt for the given UTC date.
   * Salt is generated and maintained purely in process memory.
   */
  public getDailySalt(date: Date = new Date()): string {
    if (this.saltUnavailableForTesting) {
      throw new Error('Telemetry salt unavailable: secure key store unreachable');
    }

    const masterKey = this.masterSecretOverride ?? env.TELEMETRY_SALT_KEY ?? env.AUTH_SECRET;
    if (!masterKey || masterKey.trim().length === 0) {
      throw new Error('Telemetry salt unavailable: master salt secret not configured');
    }

    // Strict UTC day boundary formatting: 'YYYY-MM-DD'
    const utcDay = date.toISOString().slice(0, 10);

    let salt = this.dailySalts.get(utcDay);
    if (!salt) {
      salt = crypto
        .createHmac('sha256', masterKey)
        .update(`techsprout:telemetry:salt:${utcDay}`)
        .digest('hex');
      this.dailySalts.set(utcDay, salt);
    }

    return salt;
  }

  /**
   * Hashes a raw identifier (e.g. userId or sessionId) using HMAC-SHA256 with the active daily salt.
   * Fails closed if the salt is unavailable.
   */
  public hashIdentifier(rawIdentifier: string, date: Date = new Date()): string {
    if (!rawIdentifier || typeof rawIdentifier !== 'string' || rawIdentifier.trim().length === 0) {
      throw new Error('Invalid identifier to hash');
    }

    const salt = this.getDailySalt(date);
    if (!salt) {
      throw new Error('Telemetry salt unavailable');
    }

    return crypto.createHmac('sha256', salt).update(rawIdentifier.trim()).digest('hex');
  }

  // --- Test & Operational Lifecycle Helpers ---

  public setMasterSecretOverride(secret: string | null): void {
    this.masterSecretOverride = secret;
    this.dailySalts.clear();
  }

  public setSaltUnavailableForTesting(unavailable: boolean): void {
    this.saltUnavailableForTesting = unavailable;
  }

  public clearSalts(): void {
    this.dailySalts.clear();
  }
}
