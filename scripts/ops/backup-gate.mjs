/**
 * TechSprout LMS — Pre-Migration Backup Manifest & Gate Validation Engine
 *
 * Enforces strict, zero-trust validation of pre-migration backup artifacts
 * prior to applying database schema migrations in staging or production.
 *
 * Rules:
 * 1. Target environment must match manifest environment (cross-environment prohibited).
 * 2. Database resource ID must match target expected resource ID.
 * 3. Backup timestamp must be within the configured 24-hour safety window.
 * 4. Dump file must exist on disk and have non-zero size.
 * 5. SHA-256 cryptographic checksum must match manifest.
 * 6. Archive validation must be 'passed' (verified via pg_restore --list).
 * 7. PostgreSQL major version must be recorded (e.g. 16).
 * 8. Isolated restore test must be recorded as 'passed'.
 * 9. Restore test verified checksum must match backup sha256.
 * 10. Restore test PostgreSQL major version must match source major version.
 * 11. Fail closed on missing, malformed, or mismatched evidence.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export const DEFAULT_RESOURCE_IDS = {
  staging: 'dpg-db474ae0tbcc73dcgr10-a',
  production: 'dpg-dasmr1e0tbcc73849i90-a',
};

export const MAX_BACKUP_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Calculates SHA-256 hash of a file synchronously.
 */
export function computeFileSha256(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found for checksum calculation: ${filePath}`);
  }
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();
}

/**
 * Core validation function for a backup manifest object.
 */
export function validateBackupManifest(manifest, options = {}) {
  const {
    targetEnvironment,
    expectedResourceId,
    fileSizeBytes,
    computedSha256,
    now = new Date(),
    maxAgeMs = MAX_BACKUP_AGE_MS,
  } = options;

  if (!manifest || typeof manifest !== 'object') {
    throw new Error('FAIL: Manifest is empty or not a valid object.');
  }

  // 1. Environment Check
  const manifestEnv = manifest.environment;
  if (!manifestEnv || !['staging', 'production', 'local'].includes(manifestEnv)) {
    throw new Error(`FAIL: Manifest contains invalid or missing environment: "${manifestEnv}".`);
  }

  if (targetEnvironment && manifestEnv !== targetEnvironment) {
    throw new Error(
      `FAIL: Target environment "${targetEnvironment}" does not match backup environment "${manifestEnv}". Cross-environment backups are strictly prohibited.`
    );
  }

  // 2. Resource ID Check
  const manifestResourceId = manifest.resourceId || manifest.sourceResourceId;
  if (!manifestResourceId) {
    throw new Error('FAIL: Manifest is missing database resourceId.');
  }

  const requiredResourceId = expectedResourceId || DEFAULT_RESOURCE_IDS[targetEnvironment || manifestEnv];
  if (requiredResourceId && manifestResourceId !== requiredResourceId) {
    throw new Error(
      `FAIL: Database resource ID mismatch: expected "${requiredResourceId}", but backup is for "${manifestResourceId}".`
    );
  }

  // 3. PostgreSQL Major Version Check
  const pgMajor = parseInt(manifest.postgresMajorVersion, 10);
  if (isNaN(pgMajor) || pgMajor < 14) {
    throw new Error(
      `FAIL: Manifest contains invalid or missing PostgreSQL major version: "${manifest.postgresMajorVersion}". Expected integer >= 14.`
    );
  }

  // 4. Timestamp & Freshness Check
  const timestampStr = manifest.backupTimestamp || manifest.createdAt;
  if (!timestampStr) {
    throw new Error('FAIL: Manifest is missing backupTimestamp.');
  }

  const backupDate = new Date(timestampStr);
  if (isNaN(backupDate.getTime())) {
    throw new Error(`FAIL: Manifest contains invalid backupTimestamp ISO string: "${timestampStr}".`);
  }

  const currentTime = now.getTime();
  const backupTime = backupDate.getTime();

  // Allow 1 hour future skew for clock differences
  if (backupTime > currentTime + 3600 * 1000) {
    throw new Error(`FAIL: Backup timestamp "${timestampStr}" is in the future.`);
  }

  const ageMs = currentTime - backupTime;
  if (ageMs > maxAgeMs) {
    const ageHours = (ageMs / (60 * 60 * 1000)).toFixed(1);
    throw new Error(
      `FAIL: Backup is expired. Timestamp "${timestampStr}" is ${ageHours} hours old (maximum allowed age is 24.0 hours). A fresh pre-migration backup is mandatory.`
    );
  }

  // 5. File Size Check
  const manifestSize = parseInt(manifest.fileSizeBytes, 10);
  if (isNaN(manifestSize) || manifestSize <= 0) {
    throw new Error(`FAIL: Manifest records invalid fileSizeBytes: "${manifest.fileSizeBytes}".`);
  }

  if (typeof fileSizeBytes === 'number' && manifestSize !== fileSizeBytes) {
    throw new Error(
      `FAIL: File size mismatch: manifest records ${manifestSize} bytes, but actual file is ${fileSizeBytes} bytes.`
    );
  }

  // 6. Cryptographic SHA-256 Check
  const manifestHash = (manifest.sha256 || '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(manifestHash)) {
    throw new Error(`FAIL: Manifest contains invalid SHA-256 hash: "${manifest.sha256}".`);
  }

  if (computedSha256 && manifestHash !== computedSha256.toUpperCase()) {
    throw new Error(
      `FAIL: Cryptographic checksum mismatch: manifest sha256 "${manifestHash}" does not match file checksum "${computedSha256.toUpperCase()}".`
    );
  }

  // 7. Archive Validation (pg_restore --list)
  if (manifest.archiveValidation !== 'passed') {
    throw new Error(
      `FAIL: Archive validation status is "${manifest.archiveValidation}". Expected "passed" from pg_restore --list.`
    );
  }

  // 8. Isolated Restore Test Verification
  const restoreTest = manifest.restoreTest;
  if (!restoreTest || typeof restoreTest !== 'object') {
    throw new Error(
      'FAIL: Manifest missing restoreTest verification block. A successful isolated restore test is mandatory before migration.'
    );
  }

  if (restoreTest.status !== 'passed') {
    throw new Error(
      `FAIL: Isolated restore test status is "${restoreTest.status}". Expected "passed".`
    );
  }

  const testedHash = (restoreTest.testedBackupSha256 || '').toUpperCase();
  if (testedHash !== manifestHash) {
    throw new Error(
      `FAIL: Restore test verified checksum "${testedHash}" does not match backup sha256 "${manifestHash}".`
    );
  }

  const restorePgMajor = parseInt(restoreTest.postgresMajorVersion, 10);
  if (isNaN(restorePgMajor) || restorePgMajor !== pgMajor) {
    throw new Error(
      `FAIL: Restore test major version mismatch: restore test ran on PostgreSQL ${restorePgMajor}, but backup is PostgreSQL ${pgMajor}. Same-major version verification is required.`
    );
  }

  return {
    isValid: true,
    environment: manifestEnv,
    resourceId: manifestResourceId,
    postgresMajorVersion: pgMajor,
    backupTimestamp: timestampStr,
    sha256: manifestHash,
    fileSizeBytes: manifestSize,
    restoreTestedAt: restoreTest.testedAt || 'recorded',
  };
}

/**
 * Validates a backup directory and finds the newest valid manifest for the target environment.
 */
export function validatePreMigrationBackup(backupDir, targetEnvironment, options = {}) {
  if (!fs.existsSync(backupDir)) {
    throw new Error(`FAIL: Backup directory "${backupDir}" does not exist. Pre-migration backup is mandatory.`);
  }

  const manifestFiles = fs.readdirSync(backupDir).filter((file) => {
    return file.endsWith('.manifest.json') && file.startsWith(`techsprout-${targetEnvironment}-`);
  });

  if (manifestFiles.length === 0) {
    throw new Error(
      `FAIL: No verified pre-migration backup manifest found for environment "${targetEnvironment}" in "${backupDir}". Execute backup-postgres first.`
    );
  }

  // Sort newest first by filename timestamp or mtime
  manifestFiles.sort().reverse();
  const latestManifestFile = manifestFiles[0];
  const manifestPath = path.join(backupDir, latestManifestFile);

  let manifest;
  try {
    const rawContent = fs.readFileSync(manifestPath, 'utf-8').replace(/^\uFEFF/, '');
    manifest = JSON.parse(rawContent);
  } catch (err) {
    throw new Error(`FAIL: Corrupt manifest JSON at "${manifestPath}": ${err.message}`);
  }

  // Locate associated dump file
  const dumpFileName = manifest.backupFile || latestManifestFile.replace('.manifest.json', '.dump');
  const dumpFilePath = path.join(backupDir, dumpFileName);

  if (!fs.existsSync(dumpFilePath)) {
    throw new Error(`FAIL: Backup dump file "${dumpFilePath}" referenced in manifest does not exist.`);
  }

  const stat = fs.statSync(dumpFilePath);
  if (stat.size === 0) {
    throw new Error(`FAIL: Backup dump file "${dumpFilePath}" is empty (0 bytes).`);
  }

  const computedSha256 = computeFileSha256(dumpFilePath);

  return validateBackupManifest(manifest, {
    targetEnvironment,
    expectedResourceId: options.expectedResourceId,
    fileSizeBytes: stat.size,
    computedSha256,
    now: options.now || new Date(),
    maxAgeMs: options.maxAgeMs || MAX_BACKUP_AGE_MS,
  });
}

// CLI Execution if run directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  const args = process.argv.slice(2);
  const targetEnv = args[0] || 'staging';
  const backupDir = args[1] || path.join(process.env.USERPROFILE || process.env.HOME || '', 'TechSproutBackups');

  try {
    console.log(`[CHECK] Validating pre-migration backup gate for environment: ${targetEnv}...`);
    const result = validatePreMigrationBackup(backupDir, targetEnv);
    console.log(`[PASS] Backup gate verified:`);
    console.log(`       Environment: ${result.environment}`);
    console.log(`       Resource ID: ${result.resourceId}`);
    console.log(`       PostgreSQL:  v${result.postgresMajorVersion}`);
    console.log(`       SHA-256:     ${result.sha256}`);
    console.log(`       Timestamp:   ${result.backupTimestamp}`);
    process.exit(0);
  } catch (err) {
    console.error(`[BLOCKED] ${err.message}`);
    process.exit(1);
  }
}
