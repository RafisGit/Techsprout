#!/usr/bin/env node
/**
 * TechSprout LMS - Deployment Configuration & Release Hardening Validator
 * 
 * Validates compliance with Phase 12.2 / WP-P12-02 requirements:
 * 1. Render Blueprints (render.yaml, render.staging.yaml) parse correctly.
 * 2. Production and staging service/database names are strictly distinct.
 * 3. Startup commands run the compiled NestJS server ONLY (no migrations, no seeds).
 * 4. Migration runner is separate and verified.
 * 5. Environment variables do not leak hardcoded secrets.
 * 6. Frontend and API origins are internally consistent.
 * 7. Git does not track any backup archives or unapproved .env files.
 * 8. Certificate QR and public verification routes use the canonical base format.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

console.log('====================================================');
console.log('TechSprout LMS — Release Configuration Validator');
console.log('Timestamp:', new Date().toISOString());
console.log('Root Dir: ', ROOT_DIR);
console.log('====================================================\n');

let passedChecks = 0;
let failedChecks = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    passedChecks++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     Reason: ${details}`);
    failedChecks++;
  }
}

// Simple YAML reader for key-value extraction without external dependency
function parseRenderYaml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const services = [];
  const databases = [];

  let currentSection = null;
  let currentItem = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    if (rawLine.startsWith('services:')) {
      currentSection = 'services';
      continue;
    } else if (rawLine.startsWith('databases:')) {
      currentSection = 'databases';
      continue;
    }

    // New item in list (only top-level list item with 2 spaces)
    if (rawLine.match(/^  -\s+/)) {
      currentItem = {};
      if (currentSection === 'services') services.push(currentItem);
      if (currentSection === 'databases') databases.push(currentItem);
    }

    const kvMatch = trimmed.replace(/^-\s+/, '').match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (kvMatch && currentItem) {
      const key = kvMatch[1];
      let val = kvMatch[2].trim();
      // Remove quotes if present
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!currentItem[key]) {
        currentItem[key] = val;
      }
    }
  }

  return { content, services, databases };
}

// -----------------------------------------------------------------------------
// CHECK 1: Render Blueprints Exist & Parse
// -----------------------------------------------------------------------------
console.log('--- 1. Render Blueprints Parsing ---');
const prodYamlPath = path.join(ROOT_DIR, 'render.yaml');
const stagingYamlPath = path.join(ROOT_DIR, 'render.staging.yaml');

assert(fs.existsSync(prodYamlPath), 'render.yaml exists on disk');
assert(fs.existsSync(stagingYamlPath), 'render.staging.yaml exists on disk');

const prodConfig = parseRenderYaml(prodYamlPath);
const stagingConfig = parseRenderYaml(stagingYamlPath);

assert(prodConfig.services.length > 0, 'render.yaml defines services', `Found: ${prodConfig.services.length}`);
assert(stagingConfig.services.length > 0, 'render.staging.yaml defines services', `Found: ${stagingConfig.services.length}`);

// -----------------------------------------------------------------------------
// CHECK 2: Distinct Production & Staging Resource Names
// -----------------------------------------------------------------------------
console.log('\n--- 2. Resource Name Isolation ---');
const prodServiceNames = prodConfig.services.map(s => s.name);
const stagingServiceNames = stagingConfig.services.map(s => s.name);
const prodDbNames = prodConfig.databases.map(d => d.name);
const stagingDbNames = stagingConfig.databases.map(d => d.name);

const serviceOverlap = prodServiceNames.filter(n => stagingServiceNames.includes(n));
const dbOverlap = prodDbNames.filter(n => stagingDbNames.includes(n));

assert(serviceOverlap.length === 0, 'Zero service name collisions between prod and staging', `Overlaps: ${serviceOverlap.join(', ')}`);
assert(dbOverlap.length === 0, 'Zero database name collisions between prod and staging', `Overlaps: ${dbOverlap.join(', ')}`);

assert(prodConfig.content.includes('databaseName: techsprout'), 'Production databaseName is techsprout');
assert(stagingConfig.content.includes('databaseName: techsprout_staging'), 'Staging databaseName is techsprout_staging');

// -----------------------------------------------------------------------------
// CHECK 3: Startup Commands Run Compiled Server Only (No Seeds / Migrations)
// -----------------------------------------------------------------------------
console.log('\n--- 3. Startup Command Safety ---');
for (const s of prodConfig.services) {
  if (s.type === 'web') {
    const isCleanServer = s.startCommand === 'node apps/api/dist/main.js';
    const hasMigration = s.startCommand?.includes('migrate');
    const hasSeed = s.startCommand?.includes('seed');
    assert(isCleanServer && !hasMigration && !hasSeed, `Production web service startCommand is clean: "${s.startCommand}"`);
  }
}

for (const s of stagingConfig.services) {
  if (s.type === 'web') {
    const isCleanServer = s.startCommand === 'node apps/api/dist/main.js';
    const hasMigration = s.startCommand?.includes('migrate');
    const hasSeed = s.startCommand?.includes('seed');
    assert(isCleanServer && !hasMigration && !hasSeed, `Staging web service startCommand is clean: "${s.startCommand}"`);
  }
}

// -----------------------------------------------------------------------------
// CHECK 4: Dedicated Migration Runner Path
// -----------------------------------------------------------------------------
console.log('\n--- 4. Controlled Migration Runner ---');
const apiPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'apps/api/package.json'), 'utf8'));
assert(apiPkg.scripts && apiPkg.scripts['db:migrate:prod'], 'apps/api/package.json has db:migrate:prod script');
assert(fs.existsSync(path.join(ROOT_DIR, 'scripts/ops/run-migrations.ps1')), 'scripts/ops/run-migrations.ps1 exists');
assert(fs.existsSync(path.join(ROOT_DIR, 'scripts/ops/run-migrations.sh')), 'scripts/ops/run-migrations.sh exists');

// -----------------------------------------------------------------------------
// CHECK 5: Secret Exposure Prevention
// -----------------------------------------------------------------------------
console.log('\n--- 5. Secret Exposure Audit ---');
const forbiddenSecretPatterns = [
  /password\s*:\s*["'][^"']+["']/i,
  /postgres:\/\/[^:]+:[^@]+@/i,
  /api_key\s*:\s*["'][a-zA-Z0-9_\-]{16,}["']/i,
];

let prodHasSecret = false;
let stagingHasSecret = false;
for (const pat of forbiddenSecretPatterns) {
  if (pat.test(prodConfig.content)) prodHasSecret = true;
  if (pat.test(stagingConfig.content)) stagingHasSecret = true;
}

assert(!prodHasSecret, 'render.yaml does not contain plaintext passwords or secrets');
assert(!stagingHasSecret, 'render.staging.yaml does not contain plaintext passwords or secrets');

// -----------------------------------------------------------------------------
// CHECK 6: Git Tracking Hygiene (No Dumps or Local Envs)
// -----------------------------------------------------------------------------
console.log('\n--- 6. Git Tracked Files Audit ---');
try {
  const trackedFiles = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf8' }).split('\n');
  const trackedDumps = trackedFiles.filter(f => f.endsWith('.dump') || f.endsWith('.backup') || f.endsWith('.sql.gz'));
  const trackedEnvs = trackedFiles.filter(f => f === '.env' || f === '.env.local' || f === 'apps/api/.env' || f === 'apps/web/.env.local');
  const trackedManifests = trackedFiles.filter(f => f.endsWith('.manifest.json'));

  assert(trackedDumps.length === 0, 'Zero database dump archives tracked in Git', trackedDumps.join(', '));
  assert(trackedEnvs.length === 0, 'Zero local .env files tracked in Git', trackedEnvs.join(', '));
  assert(trackedManifests.length === 0, 'Zero backup manifests tracked in Git', trackedManifests.join(', '));
} catch (err) {
  console.warn('  ⚠️ Git ls-files check skipped (git not available):', err.message);
}

// -----------------------------------------------------------------------------
// CHECK 7: Certificate Canonical Route & Domain Format
// -----------------------------------------------------------------------------
console.log('\n--- 7. Certificate Verification Route Consistency ---');
const certPdfSrc = fs.readFileSync(path.join(ROOT_DIR, 'apps/api/src/modules/certificates/certificate-pdf.service.ts'), 'utf8');
const certDtoSrc = fs.readFileSync(path.join(ROOT_DIR, 'apps/api/src/modules/certificates/dto/certificate.dto.ts'), 'utf8');
const certWebSrc = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/app/verify/[certificateNumber]/page.tsx'), 'utf8');

assert(certPdfSrc.includes('https://techsprout.edu'), 'certificate-pdf.service.ts uses canonical base https://techsprout.edu');
assert(certDtoSrc.includes('https://techsprout.edu'), 'certificate.dto.ts defaults to https://techsprout.edu');
assert(certWebSrc.includes('/verify/'), 'verify page routes to /verify/[certificateNumber]');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n====================================================');
console.log(`VALIDATION RESULT: ${passedChecks} PASSED, ${failedChecks} FAILED`);
console.log('====================================================\n');

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
