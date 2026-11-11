import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import {
  validateBackupManifest,
  validatePreMigrationBackup,
  DEFAULT_RESOURCE_IDS,
  MAX_BACKUP_AGE_MS,
} from '../../../../scripts/ops/backup-gate.mjs';

describe('Phase 12.3: Pre-Migration Backup Verification Gate', () => {
  let tempDir: string;
  const mockSha256 = 'D8406730D54A6CF29595371257251BE3A0B74A0EA34005F27D0395404A11254E';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'techsprout-test-backup-gate-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createValidManifest(env: 'staging' | 'production' = 'staging', overrides: Record<string, any> = {}) {
    return {
      environment: env,
      resourceId: DEFAULT_RESOURCE_IDS[env],
      postgresMajorVersion: 16,
      backupTimestamp: new Date().toISOString(),
      backupFile: `techsprout-${env}-2026-11-01-000000.dump`,
      fileSizeBytes: 150149,
      sha256: mockSha256,
      archiveValidation: 'passed',
      restoreTest: {
        status: 'passed',
        postgresMajorVersion: 16,
        testedBackupSha256: mockSha256,
        testedAt: new Date().toISOString(),
      },
      ...overrides,
    };
  }

  describe('validateBackupManifest logic', () => {
    it('passes validation for a complete, healthy staging manifest', () => {
      const manifest = createValidManifest('staging');
      const result = validateBackupManifest(manifest, {
        targetEnvironment: 'staging',
        expectedResourceId: DEFAULT_RESOURCE_IDS.staging,
        fileSizeBytes: 150149,
        computedSha256: mockSha256,
      });

      expect(result.isValid).toBe(true);
      expect(result.environment).toBe('staging');
      expect(result.resourceId).toBe(DEFAULT_RESOURCE_IDS.staging);
      expect(result.postgresMajorVersion).toBe(16);
      expect(result.sha256).toBe(mockSha256);
    });

    it('passes validation for a complete, healthy production manifest', () => {
      const manifest = createValidManifest('production');
      const result = validateBackupManifest(manifest, {
        targetEnvironment: 'production',
        expectedResourceId: DEFAULT_RESOURCE_IDS.production,
        fileSizeBytes: 150149,
        computedSha256: mockSha256,
      });

      expect(result.isValid).toBe(true);
      expect(result.environment).toBe('production');
      expect(result.resourceId).toBe(DEFAULT_RESOURCE_IDS.production);
    });

    it('fails closed when target environment differs from manifest environment (cross-environment reject)', () => {
      const prodManifest = createValidManifest('production');

      expect(() =>
        validateBackupManifest(prodManifest, {
          targetEnvironment: 'staging',
        })
      ).toThrow(/Cross-environment backups are strictly prohibited/);
    });

    it('fails closed when database resource ID does not match expected target resource', () => {
      const manifest = createValidManifest('staging', {
        resourceId: 'dpg-wrong-resource-id-1234',
      });

      expect(() =>
        validateBackupManifest(manifest, {
          targetEnvironment: 'staging',
          expectedResourceId: DEFAULT_RESOURCE_IDS.staging,
        })
      ).toThrow(/Database resource ID mismatch/);
    });

    it('fails closed when backup timestamp is older than 24 hours', () => {
      const expiredDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const manifest = createValidManifest('staging', {
        backupTimestamp: expiredDate,
      });

      expect(() =>
        validateBackupManifest(manifest, {
          targetEnvironment: 'staging',
        })
      ).toThrow(/Backup is expired.*maximum allowed age is 24\.0 hours/);
    });

    it('fails closed when backup timestamp is in the future', () => {
      const futureDate = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      const manifest = createValidManifest('staging', {
        backupTimestamp: futureDate,
      });

      expect(() =>
        validateBackupManifest(manifest, {
          targetEnvironment: 'staging',
        })
      ).toThrow(/in the future/);
    });

    it('fails closed when cryptographic SHA-256 differs between manifest and disk', () => {
      const manifest = createValidManifest('staging');
      const tamperedChecksum = '1111111111111111111111111111111111111111111111111111111111111111';

      expect(() =>
        validateBackupManifest(manifest, {
          targetEnvironment: 'staging',
          computedSha256: tamperedChecksum,
        })
      ).toThrow(/Cryptographic checksum mismatch/);
    });

    it('fails closed when archiveValidation is not "passed"', () => {
      const manifest = createValidManifest('staging', {
        archiveValidation: 'failed',
      });

      expect(() =>
        validateBackupManifest(manifest, {
          targetEnvironment: 'staging',
        })
      ).toThrow(/Archive validation status is "failed"/);
    });

    it('fails closed when restoreTest block is missing', () => {
      const manifest = createValidManifest('staging', {
        restoreTest: null,
      });

      expect(() =>
        validateBackupManifest(manifest, {
          targetEnvironment: 'staging',
        })
      ).toThrow(/Manifest missing restoreTest verification block/);
    });

    it('fails closed when restoreTest status is not "passed"', () => {
      const manifest = createValidManifest('staging', {
        restoreTest: {
          status: 'failed',
          postgresMajorVersion: 16,
          testedBackupSha256: mockSha256,
        },
      });

      expect(() =>
        validateBackupManifest(manifest, {
          targetEnvironment: 'staging',
        })
      ).toThrow(/Isolated restore test status is "failed"/);
    });

    it('fails closed when restoreTest testedBackupSha256 does not match backup checksum', () => {
      const manifest = createValidManifest('staging', {
        restoreTest: {
          status: 'passed',
          postgresMajorVersion: 16,
          testedBackupSha256: '9999999999999999999999999999999999999999999999999999999999999999',
        },
      });

      expect(() =>
        validateBackupManifest(manifest, {
          targetEnvironment: 'staging',
        })
      ).toThrow(/Restore test verified checksum.*does not match backup sha256/);
    });

    it('fails closed when restoreTest ran on different PostgreSQL major version (not same-major)', () => {
      const manifest = createValidManifest('staging', {
        postgresMajorVersion: 16,
        restoreTest: {
          status: 'passed',
          postgresMajorVersion: 18, // PG 18 used instead of required PG 16
          testedBackupSha256: mockSha256,
        },
      });

      expect(() =>
        validateBackupManifest(manifest, {
          targetEnvironment: 'staging',
        })
      ).toThrow(/Same-major version verification is required/);
    });

    it('fails closed when file size recorded in manifest does not match disk size', () => {
      const manifest = createValidManifest('staging', {
        fileSizeBytes: 1000,
      });

      expect(() =>
        validateBackupManifest(manifest, {
          targetEnvironment: 'staging',
          fileSizeBytes: 2000,
        })
      ).toThrow(/File size mismatch/);
    });
  });

  describe('validatePreMigrationBackup filesystem integration', () => {
    it('discovers and verifies valid backup dump and manifest from directory', () => {
      const testContent = Buffer.from('mock postgres custom dump format bytes');
      const actualHash = crypto.createHash('sha256').update(testContent).digest('hex').toUpperCase();

      const dumpName = 'techsprout-staging-2026-11-01-120000.dump';
      const manifestName = 'techsprout-staging-2026-11-01-120000.manifest.json';

      fs.writeFileSync(path.join(tempDir, dumpName), testContent);

      const manifest = createValidManifest('staging', {
        backupFile: dumpName,
        fileSizeBytes: testContent.length,
        sha256: actualHash,
        restoreTest: {
          status: 'passed',
          postgresMajorVersion: 16,
          testedBackupSha256: actualHash,
          testedAt: new Date().toISOString(),
        },
      });

      fs.writeFileSync(path.join(tempDir, manifestName), JSON.stringify(manifest, null, 2));

      const result = validatePreMigrationBackup(tempDir, 'staging');
      expect(result.isValid).toBe(true);
      expect(result.sha256).toBe(actualHash);
      expect(result.environment).toBe('staging');
    });

    it('fails when backup directory has no matching manifests for the requested environment', () => {
      expect(() => validatePreMigrationBackup(tempDir, 'staging')).toThrow(
        /No verified pre-migration backup manifest found for environment "staging"/
      );
    });

    it('fails when referenced dump file is missing', () => {
      const manifestName = 'techsprout-staging-2026-11-01-120000.manifest.json';
      const manifest = createValidManifest('staging', {
        backupFile: 'non-existent.dump',
      });
      fs.writeFileSync(path.join(tempDir, manifestName), JSON.stringify(manifest, null, 2));

      expect(() => validatePreMigrationBackup(tempDir, 'staging')).toThrow(/does not exist/);
    });

    it('fails when dump file exists but is empty (0 bytes)', () => {
      const dumpName = 'techsprout-staging-2026-11-01-120000.dump';
      const manifestName = 'techsprout-staging-2026-11-01-120000.manifest.json';

      fs.writeFileSync(path.join(tempDir, dumpName), Buffer.alloc(0));
      const manifest = createValidManifest('staging', {
        backupFile: dumpName,
        fileSizeBytes: 0,
      });
      fs.writeFileSync(path.join(tempDir, manifestName), JSON.stringify(manifest, null, 2));

      expect(() => validatePreMigrationBackup(tempDir, 'staging')).toThrow(/is empty \(0 bytes\)/);
    });
  });
});
