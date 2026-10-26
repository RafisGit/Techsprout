import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseAllowedOrigins, buildCspDirectives } from '../common/security/csp.util';
import { envSchema } from '../config/env.config';
import { runMigrations } from '../database/migrate';

/**
 * Robust, indentation-aware parser for Render Blueprint YAML manifests.
 * Extracts services, databases, and environment variables for safety assertions.
 */
function parseRenderManifest(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const services: Array<{
    name: string;
    type: string;
    branch?: string;
    startCommand?: string;
    buildCommand?: string;
    envVars: Record<string, string>;
  }> = [];

  const databases: Array<{
    name: string;
    databaseName?: string;
    user?: string;
  }> = [];

  let currentSection: 'services' | 'databases' | null = null;
  let currentService: any = null;
  let currentDb: any = null;
  let inEnvVars = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) continue;

    if (/^services:\s*$/.test(rawLine)) {
      currentSection = 'services';
      currentService = null;
      inEnvVars = false;
      continue;
    }

    if (/^databases:\s*$/.test(rawLine)) {
      currentSection = 'databases';
      currentDb = null;
      inEnvVars = false;
      continue;
    }

    if (currentSection === 'services') {
      if (/^\s{2}-\s+type:\s*(.+)$/.test(rawLine)) {
        const m = rawLine.match(/^\s{2}-\s+type:\s*(.+)$/);
        currentService = {
          type: m![1].trim(),
          name: '',
          envVars: {},
        };
        services.push(currentService);
        inEnvVars = false;
        continue;
      }
      if (currentService) {
        if (/^\s{4}name:\s*(.+)$/.test(rawLine)) {
          const m = rawLine.match(/^\s{4}name:\s*(.+)$/);
          currentService.name = m![1].trim();
        } else if (/^\s{4}branch:\s*(.+)$/.test(rawLine)) {
          const m = rawLine.match(/^\s{4}branch:\s*(.+)$/);
          currentService.branch = m![1].trim();
        } else if (/^\s{4}startCommand:\s*(.+)$/.test(rawLine)) {
          const m = rawLine.match(/^\s{4}startCommand:\s*(.+)$/);
          currentService.startCommand = m![1].trim();
        } else if (/^\s{4}buildCommand:\s*(.+)$/.test(rawLine)) {
          const m = rawLine.match(/^\s{4}buildCommand:\s*(.+)$/);
          currentService.buildCommand = m![1].trim();
        } else if (/^\s{4}envVars:\s*$/.test(rawLine)) {
          inEnvVars = true;
        } else if (inEnvVars && /^\s{6}-\s+key:\s*(.+)$/.test(rawLine)) {
          const mKey = rawLine.match(/^\s{6}-\s+key:\s*(.+)$/);
          const key = mKey![1].trim();
          let value = '';
          for (let j = i + 1; j < lines.length; j++) {
            const nextRaw = lines[j];
            if (/^\s{8}value:\s*(.*)$/.test(nextRaw)) {
              const mV = nextRaw.match(/^\s{8}value:\s*(.*)$/);
              value = mV![1].trim().replace(/^["']|["']$/g, '');
              break;
            }
            if (
              /^\s{6}-\s+key:/.test(nextRaw) ||
              /^\s{2}-/.test(nextRaw) ||
              /^[a-z]+:/.test(nextRaw)
            ) {
              break;
            }
          }
          currentService.envVars[key] = value;
        }
      }
    } else if (currentSection === 'databases') {
      if (/^\s{2}-\s+name:\s*(.+)$/.test(rawLine)) {
        const m = rawLine.match(/^\s{2}-\s+name:\s*(.+)$/);
        currentDb = {
          name: m![1].trim(),
        };
        databases.push(currentDb);
        continue;
      }
      if (currentDb) {
        if (/^\s{4}databaseName:\s*(.+)$/.test(rawLine)) {
          const m = rawLine.match(/^\s{4}databaseName:\s*(.+)$/);
          currentDb.databaseName = m![1].trim();
        } else if (/^\s{4}user:\s*(.+)$/.test(rawLine)) {
          const m = rawLine.match(/^\s{4}user:\s*(.+)$/);
          currentDb.user = m![1].trim();
        }
      }
    }
  }

  return { content, services, databases };
}

describe('Production Blueprint & Startup Safety Remediation (WP-P7-17)', () => {
  const rootDir = path.resolve(__dirname, '../../../../');
  const prodManifestPath = path.join(rootDir, 'render.yaml');
  const stagingManifestPath = path.join(rootDir, 'render.staging.yaml');

  describe('1. Production Manifest (render.yaml) Safety Invariants', () => {
    it('1.1 should exist and declare the authoritative production service', () => {
      expect(fs.existsSync(prodManifestPath)).toBe(true);
      const manifest = parseRenderManifest(prodManifestPath);
      const apiService = manifest.services.find((s) => s.name === 'techsprout-api');
      expect(apiService).toBeDefined();
      expect(apiService?.type).toBe('web');
    });

    it('1.2 should declare branch: main for production tracking', () => {
      const manifest = parseRenderManifest(prodManifestPath);
      const apiService = manifest.services.find((s) => s.name === 'techsprout-api');
      expect(apiService?.branch).toBe('main');
    });

    it('1.3 should strictly prohibit database seeding in production startCommand', () => {
      const manifest = parseRenderManifest(prodManifestPath);
      const apiService = manifest.services.find((s) => s.name === 'techsprout-api');
      expect(apiService?.startCommand).toBeDefined();

      const startCmd = apiService!.startCommand!;
      expect(startCmd).not.toContain('seed.js');
      expect(startCmd).not.toContain('seed.ts');
      expect(startCmd).not.toContain('db:seed');
    });

    it('1.4 should separate database migration execution from routine web process startup', () => {
      const manifest = parseRenderManifest(prodManifestPath);
      const apiService = manifest.services.find((s) => s.name === 'techsprout-api');
      const startCmd = apiService!.startCommand!;

      // Routine startup must be dedicated to running the API server
      expect(startCmd).not.toContain('migrate.js');
      expect(startCmd).not.toContain('migrate.ts');
      expect(startCmd).not.toContain('db:migrate');
      expect(startCmd).toBe('node apps/api/dist/main.js');
    });

    it('1.5 should configure stable canonical production web origin for WEB_ORIGIN', () => {
      const manifest = parseRenderManifest(prodManifestPath);
      const apiService = manifest.services.find((s) => s.name === 'techsprout-api');
      const webOrigin = apiService?.envVars['WEB_ORIGIN'];

      expect(webOrigin).toBe('https://techsprout-web.vercel.app');
      expect(webOrigin).not.toContain('feat-p1-foundation-security');
      expect(webOrigin).not.toContain('frthqjqb8');
      expect(webOrigin).not.toContain('localhost');
      expect(webOrigin).not.toContain('*');
    });

    it('1.6 should configure stable canonical production web origin for WEB_PUBLIC_ORIGIN', () => {
      const manifest = parseRenderManifest(prodManifestPath);
      const apiService = manifest.services.find((s) => s.name === 'techsprout-api');
      const publicOrigin = apiService?.envVars['WEB_PUBLIC_ORIGIN'];

      expect(publicOrigin).toBe('https://techsprout-web.vercel.app');
      expect(publicOrigin).not.toContain(',');
      expect(publicOrigin).not.toContain('feat-p1');
    });

    it('1.7 should verify production database configuration identity', () => {
      const manifest = parseRenderManifest(prodManifestPath);
      const prodDb = manifest.databases.find((d) => d.name === 'techsprout-postgres');
      expect(prodDb).toBeDefined();
      expect(prodDb?.databaseName).toBe('techsprout');
      expect(prodDb?.user).toBe('techsprout');
    });
  });

  describe('2. Staging Manifest (render.staging.yaml) Isolation', () => {
    it('2.1 should preserve dedicated staging branch and separate origin configuration', () => {
      expect(fs.existsSync(stagingManifestPath)).toBe(true);
      const manifest = parseRenderManifest(stagingManifestPath);
      const stagingService = manifest.services.find((s) => s.name === 'techsprout-api-staging');

      expect(stagingService).toBeDefined();
      expect(stagingService?.branch).toBe('release/p6.3-candidate');
      expect(stagingService?.envVars['WEB_ORIGIN']).toContain(
        'https://staging.techsprout-web.vercel.app'
      );
      expect(stagingService?.envVars['WEB_PUBLIC_ORIGIN']).toBe(
        'https://staging.techsprout-web.vercel.app'
      );
    });

    it('2.2 should verify staging database isolation from production', () => {
      const manifest = parseRenderManifest(stagingManifestPath);
      const stagingDb = manifest.databases.find((d) => d.name === 'techsprout-postgres-staging');
      expect(stagingDb).toBeDefined();
      expect(stagingDb?.databaseName).toBe('techsprout_staging');
      expect(stagingDb?.user).toBe('techsprout_staging');
    });
  });

  describe('3. CORS & CSP Security Directives Verification', () => {
    it('3.1 should correctly parse production origin without trailing spaces or commas', () => {
      const parsed = parseAllowedOrigins('https://techsprout-web.vercel.app');
      expect(parsed).toEqual(['https://techsprout-web.vercel.app']);
    });

    it('3.2 should generate strict CSP directives binding connect-src to production origin', () => {
      const origins = parseAllowedOrigins('https://techsprout-web.vercel.app');
      const directives = buildCspDirectives(origins);

      expect(directives.defaultSrc).toEqual(["'self'"]);
      expect(directives.connectSrc).toEqual(["'self'", 'https://techsprout-web.vercel.app']);
      expect(directives.connectSrc).not.toContain('*');
      expect(directives.frameAncestors).toEqual(["'none'"]);
    });

    it('3.3 should strip whitespace and invalid entries during origin parsing', () => {
      const raw = ' https://techsprout-web.vercel.app , , invalid origin with space ';
      const parsed = parseAllowedOrigins(raw);
      expect(parsed).toEqual(['https://techsprout-web.vercel.app']);
    });
  });

  describe('4. Environment Configuration Schema Safety Assertions', () => {
    it('4.1 should validate correct production configuration against envSchema', () => {
      const result = envSchema.safeParse({
        NODE_ENV: 'production',
        PORT: 10000,
        DATABASE_URL: 'postgresql://techsprout:mock_secret@oregon-postgres.render.com/techsprout',
        AUTH_SECRET: 'super_secure_production_auth_secret_minimum_32_characters_long',
        WEB_ORIGIN: 'https://techsprout-web.vercel.app',
        WEB_PUBLIC_ORIGIN: 'https://techsprout-web.vercel.app',
        SSLCOMMERZ_STORE_ID: 'prod_store_id',
        SSLCOMMERZ_STORE_PASSWORD: 'prod_store_password',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.WEB_ORIGIN).toBe('https://techsprout-web.vercel.app');
        expect(result.data.WEB_PUBLIC_ORIGIN).toBe('https://techsprout-web.vercel.app');
      }
    });

    it('4.2 should reject comma-separated WEB_PUBLIC_ORIGIN in production', () => {
      const result = envSchema.safeParse({
        NODE_ENV: 'production',
        PORT: 10000,
        DATABASE_URL: 'postgresql://techsprout:mock_secret@oregon-postgres.render.com/techsprout',
        AUTH_SECRET: 'super_secure_production_auth_secret_minimum_32_characters_long',
        WEB_ORIGIN: 'https://techsprout-web.vercel.app,https://admin.techsprout.edu',
        WEB_PUBLIC_ORIGIN: 'https://techsprout-web.vercel.app,https://admin.techsprout.edu',
        SSLCOMMERZ_STORE_ID: 'prod_store_id',
        SSLCOMMERZ_STORE_PASSWORD: 'prod_store_password',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues;
        const publicOriginIssue = issues.find((i) => i.path.includes('WEB_PUBLIC_ORIGIN'));
        expect(publicOriginIssue).toBeDefined();
        expect(publicOriginIssue?.message).toContain('no commas');
      }
    });
  });

  describe('5. Database Migration Runner Technical Properties', () => {
    it('5.1 should export runMigrations as a callable asynchronous function', () => {
      expect(typeof runMigrations).toBe('function');
    });

    it('5.2 should define db:migrate:prod script in package.json separate from routine start', () => {
      const apiPkgJsonPath = path.join(__dirname, '../../package.json');
      const pkg = JSON.parse(fs.readFileSync(apiPkgJsonPath, 'utf-8'));

      expect(pkg.scripts['start']).toBe('node dist/main');
      expect(pkg.scripts['db:migrate:prod']).toBe('node dist/database/migrate.js');
      expect(pkg.scripts['start']).not.toContain('migrate');
      expect(pkg.scripts['start']).not.toContain('seed');
    });
  });
});
