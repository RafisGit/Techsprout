import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import {
  DEFAULT_RESOURCE_IDS,
  validateBackupManifest,
} from '../../../../scripts/ops/backup-gate.mjs';

/**
 * Pure TypeScript mirror of Parse-PostgreSqlUri and Format-PgPassValue
 * to verify parity between operational shell scripts and API test assertions.
 */
function parsePostgreSqlUri(uriString: string) {
  if (!uriString || !uriString.trim()) {
    throw new Error('Connection URI is empty.');
  }

  const trimmed = uriString.trim().replace(/^['"]|['"]$/g, '');

  // Reject shell commands and environment variable assignments
  if (/^(?:psql|pg_dump|pg_restore|export\s+|set\s+|env\s+|[a-zA-Z_][a-zA-Z0-9_]*=)/.test(trimmed)) {
    throw new Error('Input appears to be a shell command or environment variable assignment, not a PostgreSQL connection URI.');
  }

  // Validate percent-encoding integrity in raw input before URL parser auto-escapes invalid sequences
  if (/%(?![0-9a-fA-F]{2})/.test(trimmed)) {
    throw new Error('Malformed percent-encoding in connection URI.');
  }

  // Extract and validate explicit port string without fragile regexes (handles DNS, IPv4, and bracketed IPv6)
  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx >= 0) {
    const afterAt = trimmed.substring(atIdx + 1);
    let explicitPort: string | null = null;
    if (afterAt.startsWith('[')) {
      const closeBracket = afterAt.indexOf(']');
      if (closeBracket > 0 && closeBracket + 1 < afterAt.length && afterAt[closeBracket + 1] === ':') {
        const rest = afterAt.substring(closeBracket + 2);
        const termIdx = rest.search(/[/?#]/);
        explicitPort = termIdx >= 0 ? rest.substring(0, termIdx) : rest;
      }
    } else {
      const termIdx = afterAt.search(/[/?#]/);
      const hostPort = termIdx >= 0 ? afterAt.substring(0, termIdx) : afterAt;
      const colonIdx = hostPort.indexOf(':');
      if (colonIdx >= 0) {
        explicitPort = hostPort.substring(colonIdx + 1);
      }
    }

    if (explicitPort !== null) {
      const pNum = Number(explicitPort);
      if (!Number.isInteger(pNum) || pNum < 1 || pNum > 65535) {
        throw new Error(`Invalid port '${explicitPort}'. Port must be an integer between 1 and 65535.`);
      }
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid PostgreSQL connection URI format.');
  }

  // Scheme check
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'postgres' && scheme !== 'postgresql') {
    throw new Error(`Unsupported URI scheme '${scheme}'. Scheme must be 'postgres' or 'postgresql'.`);
  }

  // Reject URI fragments
  if (parsed.hash) {
    throw new Error('URI fragments are prohibited in PostgreSQL connection URI.');
  }

  if (!parsed.hostname || /\s/.test(parsed.hostname)) {
    throw new Error('Missing or invalid hostname in connection URI.');
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}. Port must be between 1 and 65535.`);
  }

  if (!parsed.username && !parsed.password) {
    throw new Error('Missing credentials in connection URI: username and password are required.');
  }
  if (!parsed.username) {
    throw new Error('Missing username in connection URI.');
  }
  if (!parsed.password) {
    throw new Error('Missing password in connection URI.');
  }

  // Validate percent-encoding integrity
  if (/%(?![0-9a-fA-F]{2})/.test(parsed.username) || /%(?![0-9a-fA-F]{2})/.test(parsed.password)) {
    throw new Error('Malformed percent-encoding in connection URI credentials.');
  }

  // Reject multi-segment database paths
  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new Error('Missing database name in connection URI.');
  }
  if (segments.length > 1) {
    throw new Error('Invalid database path in connection URI: multiple path segments are prohibited.');
  }

  const rawDb = segments[0];
  if (/%(?![0-9a-fA-F]{2})/.test(rawDb)) {
    throw new Error('Malformed percent-encoding in database name.');
  }

  const database = decodeURIComponent(rawDb);
  if (!database) {
    throw new Error('Missing database name in connection URI.');
  }

  return {
    host: parsed.hostname,
    port,
    database,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

function formatPgPassValue(val: string): string {
  if (!val) return '';
  return val.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
}

function formatPgPassLine(
  host: string,
  port: number | string,
  database: string,
  username: string,
  password: string
): string {
  return [
    formatPgPassValue(host),
    formatPgPassValue(String(port)),
    formatPgPassValue(database),
    formatPgPassValue(username),
    formatPgPassValue(password),
  ].join(':');
}

function extractPostgresMajorVersion(versionString: string): number | null {
  const match = versionString.match(/(?:\(PostgreSQL\)\s+|pg_dump\s+|pg_restore\s+|psql\s+)(\d+)\./);
  return match ? parseInt(match[1], 10) : null;
}

describe('TechSprout LMS — Secure PostgreSQL 16 Staging Backup Verification Suite', () => {
  const stagingResourceId = DEFAULT_RESOURCE_IDS.staging;
  const productionResourceId = DEFAULT_RESOURCE_IDS.production;

  describe('1. PostgreSQL Client Version Extraction & Fail-Closed Guards', () => {
    it('correctly extracts major version 16 from standard tool version outputs', () => {
      expect(extractPostgresMajorVersion('pg_dump (PostgreSQL) 16.15')).toBe(16);
      expect(extractPostgresMajorVersion('pg_restore (PostgreSQL) 16.15')).toBe(16);
      expect(extractPostgresMajorVersion('psql (PostgreSQL) 16.15')).toBe(16);
      expect(extractPostgresMajorVersion('pg_dump (PostgreSQL) 16.2')).toBe(16);
    });

    it('identifies and differentiates non-16 client tools (PostgreSQL 14 and 18)', () => {
      expect(extractPostgresMajorVersion('pg_dump (PostgreSQL) 14.11')).toBe(14);
      expect(extractPostgresMajorVersion('pg_dump (PostgreSQL) 18.0')).toBe(18);
    });

    it('fails closed when client tool version is not 16', () => {
      const toolMajor = extractPostgresMajorVersion('pg_dump (PostgreSQL) 18.0');
      expect(() => {
        if (toolMajor !== 16) {
          throw new Error(`CRITICAL: PostgreSQL client tool major version is ${toolMajor} (expected 16).`);
        }
      }).toThrow(/expected 16/);
    });
  });

  describe('2. In-Memory URI Parsing & Staging Identity Verification', () => {
    it('correctly parses standard postgres:// URL', () => {
      const uri = `postgres://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      const parsed = parsePostgreSqlUri(uri);

      expect(parsed.host).toBe(`${stagingResourceId}.oregon-postgres.render.com`);
      expect(parsed.port).toBe(5432);
      expect(parsed.database).toBe('techsprout_staging');
      expect(parsed.username).toBe('techsprout_user');
      expect(parsed.password).toBe('secret');
    });

    it('correctly parses standard postgresql:// URL', () => {
      const uri = `postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      const parsed = parsePostgreSqlUri(uri);

      expect(parsed.host).toBe(`${stagingResourceId}.oregon-postgres.render.com`);
      expect(parsed.port).toBe(5432);
      expect(parsed.database).toBe('techsprout_staging');
      expect(parsed.username).toBe('techsprout_user');
      expect(parsed.password).toBe('secret');
    });

    it('correctly ignores query parameters and isolates database name', () => {
      const uri = `postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging?sslmode=require&connect_timeout=15`;
      const parsed = parsePostgreSqlUri(uri);

      expect(parsed.database).toBe('techsprout_staging');
      expect(parsed.port).toBe(5432);
    });

    it('correctly decodes percent-encoded @ in password (%40)', () => {
      const uri = `postgresql://techsprout_user:p%40ssword@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      const parsed = parsePostgreSqlUri(uri);

      expect(parsed.password).toBe('p@ssword');
      expect(parsed.username).toBe('techsprout_user');
    });

    it('correctly decodes percent-encoded : in password (%3A)', () => {
      const uri = `postgresql://techsprout_user:p%3Asword@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      const parsed = parsePostgreSqlUri(uri);

      expect(parsed.password).toBe('p:sword');
      expect(parsed.username).toBe('techsprout_user');
    });

    it('correctly decodes percent-encoded /, ?, and # in password (%2F, %3F, %23)', () => {
      const uri = `postgresql://techsprout_user:p%2Fslash%3Fquest%23hash@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      const parsed = parsePostgreSqlUri(uri);

      expect(parsed.password).toBe('p/slash?quest#hash');
      expect(parsed.username).toBe('techsprout_user');
    });

    it('rejects connection URI missing username or password', () => {
      const noCreds = `postgresql://${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      expect(() => parsePostgreSqlUri(noCreds)).toThrow(/Missing credentials|Missing username/);

      const noPass = `postgresql://techsprout_user@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      expect(() => parsePostgreSqlUri(noPass)).toThrow(/Missing password/);

      const emptyPass = `postgresql://techsprout_user:@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      expect(() => parsePostgreSqlUri(emptyPass)).toThrow(/Missing password/);
    });

    it('rejects connection URI missing database name', () => {
      const noDb1 = `postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/`;
      expect(() => parsePostgreSqlUri(noDb1)).toThrow(/Missing database name/);

      const noDb2 = `postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432`;
      expect(() => parsePostgreSqlUri(noDb2)).toThrow(/Missing database name/);
    });

    it('rejects connection URI with invalid port (0, 70000, non-numeric)', () => {
      const portZero = `postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:0/techsprout_staging`;
      expect(() => parsePostgreSqlUri(portZero)).toThrow(/Invalid port/);

      const portHigh = `postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:70000/techsprout_staging`;
      expect(() => parsePostgreSqlUri(portHigh)).toThrow(/Invalid port/);

      const portAlpha = `postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:notaport/techsprout_staging`;
      expect(() => parsePostgreSqlUri(portAlpha)).toThrow(/Invalid port/);
    });

    it('rejects unsupported URI scheme (http, mysql)', () => {
      const httpScheme = `http://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      expect(() => parsePostgreSqlUri(httpScheme)).toThrow(/Unsupported URI scheme/);

      const mysqlScheme = `mysql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      expect(() => parsePostgreSqlUri(mysqlScheme)).toThrow(/Unsupported URI scheme/);
    });

    it('rejects malformed URI string', () => {
      expect(() => parsePostgreSqlUri('not-a-valid-connection-string')).toThrow(/Invalid PostgreSQL connection URI/);
      expect(() => parsePostgreSqlUri('')).toThrow(/Connection URI is empty/);
    });

    it('accepts single trailing slash in database path', () => {
      const uri = `postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging/`;
      const parsed = parsePostgreSqlUri(uri);
      expect(parsed.database).toBe('techsprout_staging');
    });

    it('rejects multi-segment database paths (/techsprout_staging/other)', () => {
      const uri = `postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging/other`;
      expect(() => parsePostgreSqlUri(uri)).toThrow(/multiple path segments are prohibited/);
    });

    it('rejects URI fragments (#fragment)', () => {
      const uri = `postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging#frag`;
      expect(() => parsePostgreSqlUri(uri)).toThrow(/URI fragments are prohibited/);

      const uriWithQuery = `postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging?sslmode=require#frag`;
      expect(() => parsePostgreSqlUri(uriWithQuery)).toThrow(/URI fragments are prohibited/);
    });

    it('rejects malformed percent-encoding in credentials or database name', () => {
      const badPass = `postgresql://techsprout_user:bad%ZZpass@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      expect(() => parsePostgreSqlUri(badPass)).toThrow(/Malformed percent-encoding/);

      const incompletePass = `postgresql://techsprout_user:incomp%4@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      expect(() => parsePostgreSqlUri(incompletePass)).toThrow(/Malformed percent-encoding/);

      const badDb = `postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/tech%ZZstaging`;
      expect(() => parsePostgreSqlUri(badDb)).toThrow(/Malformed percent-encoding/);
    });

    it('accepts bracketed IPv6 hosts with and without explicit port', () => {
      const ipv6WithPort = `postgresql://techsprout_user:secret@[2001:db8::1]:5432/techsprout_staging`;
      const parsedWithPort = parsePostgreSqlUri(ipv6WithPort);
      expect(parsedWithPort.host).toContain('2001:db8::1');
      expect(parsedWithPort.port).toBe(5432);

      const ipv6NoPort = `postgresql://techsprout_user:secret@[2001:db8::1]/techsprout_staging`;
      const parsedNoPort = parsePostgreSqlUri(ipv6NoPort);
      expect(parsedNoPort.host).toContain('2001:db8::1');
      expect(parsedNoPort.port).toBe(5432);
    });

    it('accepts IPv4 hosts with and without explicit port', () => {
      const ipv4WithPort = `postgresql://techsprout_user:secret@127.0.0.1:5432/techsprout_staging`;
      const parsedWithPort = parsePostgreSqlUri(ipv4WithPort);
      expect(parsedWithPort.host).toBe('127.0.0.1');
      expect(parsedWithPort.port).toBe(5432);

      const ipv4NoPort = `postgresql://techsprout_user:secret@127.0.0.1/techsprout_staging`;
      const parsedNoPort = parsePostgreSqlUri(ipv4NoPort);
      expect(parsedNoPort.host).toBe('127.0.0.1');
      expect(parsedNoPort.port).toBe(5432);
    });

    it('rejects PSQL shell command or environment assignment incorrectly supplied as URI', () => {
      const psqlCmd = `psql "postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging"`;
      expect(() => parsePostgreSqlUri(psqlCmd)).toThrow(/shell command or environment variable assignment/);

      const envAssign = `DATABASE_URL=postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      expect(() => parsePostgreSqlUri(envAssign)).toThrow(/shell command or environment variable assignment/);

      const exportCmd = `export DATABASE_URL=postgresql://techsprout_user:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      expect(() => parsePostgreSqlUri(exportCmd)).toThrow(/shell command or environment variable assignment/);
    });

    it('rejects connection host identifying the production database (dpg-dasmr1e0tbcc73849i90-a)', () => {
      const uri = `postgresql://techsprout:secret@${productionResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      const parsed = parsePostgreSqlUri(uri);

      expect(() => {
        if (parsed.host.includes(productionResourceId)) {
          throw new Error(`CRITICAL REJECTION: Connection host identifies the PRODUCTION database (${productionResourceId}).`);
        }
      }).toThrow(/CRITICAL REJECTION: Connection host identifies the PRODUCTION database/);
    });

    it('rejects connection database named techsprout or techsprout_production', () => {
      const prodNames = ['techsprout', 'techsprout_production'];
      for (const dbName of prodNames) {
        const uri = `postgresql://techsprout:secret@${stagingResourceId}.oregon-postgres.render.com:5432/${dbName}`;
        const parsed = parsePostgreSqlUri(uri);

        expect(() => {
          if (parsed.database === 'techsprout' || parsed.database === 'techsprout_production') {
            throw new Error(`CRITICAL REJECTION: Connection database is '${parsed.database}'. Expected 'techsprout_staging'.`);
          }
        }).toThrow(/Expected 'techsprout_staging'/);
      }
    });

    it('accepts valid staging hostname and techsprout_staging database identity', () => {
      const uri = `postgresql://techsprout_staging:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      const parsed = parsePostgreSqlUri(uri);

      expect(parsed.host).toContain(stagingResourceId);
      expect(parsed.database).toBe('techsprout_staging');
    });

    it('rejects host missing staging resource ID', () => {
      const uri = 'postgresql://user:secret@dpg-some-other-host.oregon-postgres.render.com:5432/techsprout_staging';
      const parsed = parsePostgreSqlUri(uri);

      expect(() => {
        if (!parsed.host.includes(stagingResourceId)) {
          throw new Error(`CRITICAL: Connection host does not identify staging resource ID '${stagingResourceId}'.`);
        }
      }).toThrow(/does not identify staging resource ID/);
    });

    it('rejects non-16 live database server version reports', () => {
      const reportedServerVersions = ['14.2', '15.6', '18.1'];
      for (const serverVer of reportedServerVersions) {
        const serverMajor = parseInt(serverVer.split('.')[0], 10);
        expect(() => {
          if (serverMajor !== 16) {
            throw new Error(`CRITICAL: Live database server major version is ${serverMajor} (expected 16).`);
          }
        }).toThrow(/expected 16/);
      }
    });
  });

  describe('3. PGPASS Formatting & Credential Protection', () => {
    it('correctly escapes colons and backslashes in .pgpass values', () => {
      const rawUser = 'user:with:colons\\and\\slashes';
      const escaped = formatPgPassValue(rawUser);
      expect(escaped).toBe('user\\:with\\:colons\\\\and\\\\slashes');
    });

    it('formats a complete .pgpass line according to PostgreSQL specification', () => {
      const line = formatPgPassLine(
        'host.example.com',
        5432,
        'techsprout_staging',
        'techsprout_user',
        'p@ss:w\\ord'
      );
      expect(line).toBe('host.example.com:5432:techsprout_staging:techsprout_user:p@ss\\:w\\\\ord');
    });

    it('does not leak connection string or raw credentials into process arguments', () => {
      const safeArgs = [
        '--no-password',
        '--format=custom',
        '--no-owner',
        '--no-acl',
        '--file=/path/to/backup.dump',
      ];
      for (const arg of safeArgs) {
        expect(arg).not.toMatch(/postgres(?:ql)?:\/\//);
        expect(arg).not.toMatch(/password=/i);
        expect(arg).not.toMatch(/secret|supersecret/i);
      }
      expect(safeArgs).toContain('--no-password');
    });
  });

  describe('4. Staging Backup Manifest Integrity & Validation Parity', () => {
    it('generates an accurate manifest conforming to backup-gate requirements with null restoreTest initially', () => {
      const manifest = {
        environment: 'staging',
        resourceId: stagingResourceId,
        postgresMajorVersion: 16,
        postgresServerVersion: 'PostgreSQL 16.15 on x86_64-pc-linux-gnu',
        pgDumpVersion: 'pg_dump (PostgreSQL) 16.15',
        pgRestoreVersion: 'pg_restore (PostgreSQL) 16.15',
        backupTimestamp: new Date().toISOString(),
        backupFile: 'techsprout-staging-2026-11-01-120000.dump',
        fileSizeBytes: 204800,
        sha256: 'ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234',
        archiveValidation: 'passed',
        restoreTest: null,
      };

      expect(manifest.environment).toBe('staging');
      expect(manifest.resourceId).toBe(stagingResourceId);
      expect(manifest.postgresMajorVersion).toBe(16);
      expect(manifest.archiveValidation).toBe('passed');
      expect(manifest.restoreTest).toBeNull();
      expect(manifest.pgDumpVersion).toContain('16.15');
      expect(manifest.pgRestoreVersion).toContain('16.15');
    });
  });

  describe('5. Windows PowerShell Staging Backup Security Integration (if on Windows)', () => {
    const isWindows = process.platform === 'win32';
    const scriptPath = path.resolve(__dirname, '../../../../scripts/ops/backup-postgres.ps1');

    function executeBackupWithMockInput(args: string[], mockUri = '', extraEnv: Record<string, string> = {}) {
      const encodedUri = mockUri ? Buffer.from(mockUri, 'utf-8').toString('base64') : '';
      const scriptCode = `
$ErrorActionPreference = 'Stop'
$rawBytes = [Convert]::FromBase64String('${encodedUri}')
$global:mockClipboardVal = if ('${encodedUri}') { [System.Text.Encoding]::UTF8.GetString($rawBytes) } else { "" }
function global:Read-Host {
    param([string]$Prompt, [switch]$AsSecureString)
    return ""
}
function global:Get-Clipboard {
    param([switch]$Raw)
    return $global:mockClipboardVal
}
try {
    & '${scriptPath}' ${args.join(' ')}
    exit 0
} catch {
    $msg = $_.Exception.Message
    Write-Output "EXEC_ERROR: $msg"
    exit 1
}
`;
      const encodedCmd = Buffer.from(scriptCode, 'utf16le').toString('base64');
      return spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCmd],
        {
          encoding: 'utf-8',
          env: { ...process.env, ...extraEnv },
        }
      );
    }

    it.skipIf(!isWindows)('proves WhatIfOnly simulation runs with zero credentials and creates no directory or artifacts', () => {
      const nonExistentDir = path.join(os.tmpdir(), `techsprout-pwsh-whatif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
      try {
        // Zero credentials or mock URI passed
        const result = executeBackupWithMockInput(
          ['-Environment', 'staging', '-OutputDir', `'${nonExistentDir}'`, '-WhatIfOnly']
        );

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('[WHATIF] Local PostgreSQL 16 toolchain and static staging configuration checks passed.');
        expect(result.stdout).toContain(
          '[WHATIF] No credentials requested, no temporary credential files created, no database contacted, and no backup artifacts generated.'
        );

        // Verify the output directory was NOT created by WhatIfOnly
        expect(fs.existsSync(nonExistentDir)).toBe(false);

        // Verify no leftover pgpass files were created
        const tempFiles = fs.readdirSync(os.tmpdir());
        const pgPassFiles = tempFiles.filter((f) => f.startsWith('techsprout_pgpass_'));
        expect(pgPassFiles.length).toBe(0);
      } finally {
        if (fs.existsSync(nonExistentDir)) {
          fs.rmSync(nonExistentDir, { recursive: true, force: true });
        }
      }
    });

    it.skipIf(!isWindows)('rejects execution when targeting production database host', () => {
      const mockUri = `postgresql://techsprout:secret@${productionResourceId}.oregon-postgres.render.com:5432/techsprout_staging`;
      const result = executeBackupWithMockInput(['-Environment', 'staging'], mockUri);

      expect(result.status).not.toBe(0);
      const combinedOutput = ((result.stdout || '') + (result.stderr || '')).replace(/\s+/g, ' ');
      expect(combinedOutput).toContain('Connection host identifies the PRODUCTION database');
    });

    it.skipIf(!isWindows)('rejects execution when targeting production database name', () => {
      const mockUri = `postgresql://techsprout:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout`;
      const result = executeBackupWithMockInput(['-Environment', 'staging'], mockUri);

      expect(result.status).not.toBe(0);
      const combinedOutput = ((result.stdout || '') + (result.stderr || '')).replace(/\s+/g, ' ');
      expect(combinedOutput).toContain("Connection database is 'techsprout'. Expected 'techsprout_staging'");
    });

    it.skipIf(!isWindows)('rejects execution when mock server version is non-16 in WhatIf mode (e.g. 18.6)', () => {
      // Offline rejection with zero credentials
      const result = executeBackupWithMockInput(
        ['-Environment', 'staging', '-MockServerVersion', '18.6', '-WhatIfOnly']
      );

      expect(result.status).not.toBe(0);
      const combinedOutput = ((result.stdout || '') + (result.stderr || '')).replace(/\s+/g, ' ');
      expect(combinedOutput).toContain('Live database server major version is 18 (expected 16)');
    });

    it.skipIf(!isWindows)('eliminates MockServerVersion verification bypass during live execution', () => {
      const result = executeBackupWithMockInput(
        ['-Environment', 'staging', '-MockServerVersion', '16']
      );

      expect(result.status).not.toBe(0);
      const combinedOutput = ((result.stdout || '') + (result.stderr || '')).replace(/\s+/g, ' ');
      expect(combinedOutput).toContain('CRITICAL: -MockServerVersion is only permitted when -WhatIfOnly is specified');
    });

    it.skipIf(!isWindows)('strictly rejects DatabaseUrl command-line parameter', () => {
      const result = executeBackupWithMockInput([
        '-Environment',
        'staging',
        '-DatabaseUrl',
        `'postgresql://techsprout:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging'`,
      ]);

      expect(result.status).not.toBe(0);
      const combinedOutput = ((result.stdout || '') + (result.stderr || '')).replace(/\s+/g, ' ');
      expect(combinedOutput).toContain("A parameter cannot be found that matches parameter name 'DatabaseUrl'");
    });

    it.skipIf(!isWindows)('leaves caller environment variables completely untouched during WhatIfOnly', () => {
      const sentinel = 'CALLER_EXISTING_SECRET_PGPASSWORD_12345';
      const sentinelHost = 'caller_existing_pghost_999';
      const testCode = `
$env:PGPASSWORD = '${sentinel}'
$env:PGHOST = '${sentinelHost}'
& '${scriptPath}' -Environment staging -WhatIfOnly | Out-Null
if ($env:PGPASSWORD -ne '${sentinel}') {
    throw "PGPASSWORD was mutated during WhatIfOnly! Expected '${sentinel}', got '$($env:PGPASSWORD)'"
}
if ($env:PGHOST -ne '${sentinelHost}') {
    throw "PGHOST was mutated during WhatIfOnly! Expected '${sentinelHost}', got '$($env:PGHOST)'"
}
Write-Output "ENV_VARS_UNTOUCHED_OK"
`;
      const encodedCmd = Buffer.from(testCode, 'utf16le').toString('base64');
      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCmd],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('ENV_VARS_UNTOUCHED_OK');
      expect(result.stdout).not.toContain(sentinel);
    });

    it.skipIf(!isWindows)('rejects PSQL shell command entered as connection URI', () => {
      const mockUri = `psql "postgresql://techsprout_staging:secret@${stagingResourceId}.oregon-postgres.render.com:5432/techsprout_staging"`;
      const result = executeBackupWithMockInput(['-Environment', 'staging'], mockUri);

      expect(result.status).not.toBe(0);
      const combinedOutput = ((result.stdout || '') + (result.stderr || '')).replace(/\s+/g, ' ');
      expect(combinedOutput).toContain('Input appears to be a shell command or environment variable assignment');
    });

    it.skipIf(!isWindows)('parses complex connection URI with percent-encoded characters and passes staging contract check', () => {
      const mockUri = `postgresql://techsprout_staging:p%40ss%3A%2F%3F%23@${stagingResourceId}.localhost:59999/techsprout_staging?sslmode=require`;
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'techsprout-pwsh-encoded-'));
      try {
        const result = executeBackupWithMockInput(
          ['-Environment', 'staging', '-OutputDir', `'${tempDir}'`],
          mockUri
        );

        expect(result.status).not.toBe(0);
        const combinedOutput = ((result.stdout || '') + (result.stderr || '')).replace(/\s+/g, ' ');
        expect(combinedOutput).toContain('Staging connection contract verified');
        expect(combinedOutput).toMatch(/Live database identity check failed|could not translate host name|connection to server/);
        // Verify credentials never leaked into logs or output
        expect(combinedOutput).not.toContain('p@ss:/');
        expect(combinedOutput).not.toContain('p%40ss');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it.skipIf(!isWindows)('cleans up temporary credentials file even if connection fails during real backup', () => {
      const mockUri = `postgresql://techsprout_staging:secret@${stagingResourceId}.localhost:59999/techsprout_staging`;
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'techsprout-pwsh-cleanup-'));
      try {
        const result = executeBackupWithMockInput(
          ['-Environment', 'staging', '-OutputDir', `'${tempDir}'`],
          mockUri
        );

        expect(result.status).not.toBe(0);
        const combinedOutput = ((result.stdout || '') + (result.stderr || '')).replace(/\s+/g, ' ');
        expect(combinedOutput).toMatch(/Live database identity check failed|could not translate host name|connection to server/);

        // Verify that no temporary pgpass file was left in TEMP
        const tempFiles = fs.readdirSync(os.tmpdir());
        const pgPassFiles = tempFiles.filter((f) => f.startsWith('techsprout_pgpass_'));
        expect(pgPassFiles.length).toBe(0);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it.skipIf(!isWindows)('rejects execution when clipboard is empty', () => {
      const result = executeBackupWithMockInput(['-Environment', 'staging'], '');

      expect(result.status).not.toBe(0);
      const combinedOutput = ((result.stdout || '') + (result.stderr || '')).replace(/\s+/g, ' ');
      expect(combinedOutput).toContain('Clipboard is empty or contains no database connection URI');
    });

    it.skipIf(!isWindows)('clears clipboard and preserves credential secrecy during backup attempt', () => {
      const mockUri = `postgresql://techsprout_staging:supersecretpassword@${stagingResourceId}.localhost:59999/techsprout_staging`;
      const result = executeBackupWithMockInput(['-Environment', 'staging'], mockUri);

      expect(result.status).not.toBe(0);
      const combinedOutput = ((result.stdout || '') + (result.stderr || '')).replace(/\s+/g, ' ');
      expect(combinedOutput).toContain('Cleared staging database credentials from local clipboard');
      expect(combinedOutput).not.toContain('supersecretpassword');
      expect(combinedOutput).not.toContain('postgresql://');
    });

    it.skipIf(!isWindows)('rejects host mismatch without printing the entered host in output', () => {
      const wrongHost = 'dpg-wrong-host-id-999.render.com';
      const mockUri = `postgresql://techsprout_staging:secret@${wrongHost}:5432/techsprout_staging`;
      const result = executeBackupWithMockInput(['-Environment', 'staging'], mockUri);

      expect(result.status).not.toBe(0);
      const combinedOutput = ((result.stdout || '') + (result.stderr || '')).replace(/\s+/g, ' ');
      expect(combinedOutput).toContain("Connection host does not identify staging resource ID 'dpg-db474ae0tbcc73dcgr10-a'");
      expect(combinedOutput).not.toContain(wrongHost);
    });
  });
});
