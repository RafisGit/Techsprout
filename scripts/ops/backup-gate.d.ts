export interface BackupManifest {
  environment: 'staging' | 'production' | 'local';
  resourceId: string;
  sourceResourceId?: string;
  postgresMajorVersion: number;
  postgresServerVersion?: string;
  pgDumpVersion?: string;
  pgRestoreVersion?: string;
  backupTimestamp?: string;
  createdAt?: string;
  backupFile: string;
  fileSizeBytes: number;
  sha256: string;
  archiveValidation: 'passed' | 'failed';
  restoreTest?: {
    status: 'passed' | 'failed';
    postgresMajorVersion: number;
    testedBackupSha256: string;
    testedAt?: string;
  } | null;
  format?: string;
  flags?: string;
}

export interface ValidationResult {
  isValid: boolean;
  environment: string;
  resourceId: string;
  postgresMajorVersion: number;
  backupTimestamp: string;
  sha256: string;
  fileSizeBytes: number;
  restoreTestedAt: string;
}

export interface ValidateOptions {
  targetEnvironment?: 'staging' | 'production' | 'local';
  expectedResourceId?: string;
  fileSizeBytes?: number;
  computedSha256?: string;
  now?: Date;
  maxAgeMs?: number;
}

export declare const DEFAULT_RESOURCE_IDS: {
  staging: string;
  production: string;
};

export declare const MAX_BACKUP_AGE_MS: number;

export declare function computeFileSha256(filePath: string): string;

export declare function validateBackupManifest(
  manifest: unknown,
  options?: ValidateOptions
): ValidationResult;

export declare function validatePreMigrationBackup(
  backupDir: string,
  targetEnvironment: 'staging' | 'production' | 'local',
  options?: ValidateOptions
): ValidationResult;
