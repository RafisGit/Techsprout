#!/usr/bin/env node
/**
 * TechSprout LMS - Reusable Internationalization (i18n) Validator
 *
 * Verifies:
 * 1. 100% bidirectional dictionary key parity between English (en.ts) and Bangla (bn.ts).
 * 2. Absence of empty string values in all translation nodes.
 * 3. Absence of unfinished placeholder markers (TODO, FIXME, [TRANSLATE], TBD).
 * 4. Validity of t('key') references across client and server source files.
 * 5. Strict BDT currency formatting compliance (zero unescaped naked '$' symbols in financial UIs).
 *
 * Run with: node --experimental-strip-types scripts/validate-i18n.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  console.log('===========================================================');
  console.log(' TechSprout LMS - i18n Dictionary & Regression Validator   ');
  console.log('===========================================================\n');

  let hasErrors = false;

  // 1. Load English and Bangla dictionaries
  const enModulePath = path.resolve(rootDir, 'src/i18n/messages/en.ts');
  const bnModulePath = path.resolve(rootDir, 'src/i18n/messages/bn.ts');

  const enMod = await import(pathToFileURL(enModulePath).href);
  const bnMod = await import(pathToFileURL(bnModulePath).href);

  const en = enMod.en;
  const bn = bnMod.bn;

  function extractLeafNodes(obj, prefix = '') {
    const map = new Map();
    for (const key of Object.keys(obj)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [subPath, subValue] of extractLeafNodes(value, currentPath)) {
          map.set(subPath, subValue);
        }
      } else {
        map.set(currentPath, value);
      }
    }
    return map;
  }

  const enLeaves = extractLeafNodes(en);
  const bnLeaves = extractLeafNodes(bn);

  console.log(`[CHECK 1] Dictionary Key Parity:`);
  console.log(`  - English total leaf keys: ${enLeaves.size}`);
  console.log(`  - Bangla total leaf keys:  ${bnLeaves.size}`);

  const missingInBn = [];
  for (const key of enLeaves.keys()) {
    if (!bnLeaves.has(key)) missingInBn.push(key);
  }

  const missingInEn = [];
  for (const key of bnLeaves.keys()) {
    if (!enLeaves.has(key)) missingInEn.push(key);
  }

  if (missingInBn.length > 0) {
    console.error(`  FAIL: ${missingInBn.length} keys missing in Bangla dictionary:`, missingInBn.slice(0, 10));
    hasErrors = true;
  } else {
    console.log(`  PASS: Zero missing keys in Bangla dictionary.`);
  }

  if (missingInEn.length > 0) {
    console.error(`  FAIL: ${missingInEn.length} orphan keys found in Bangla that are missing in English:`, missingInEn.slice(0, 10));
    hasErrors = true;
  } else {
    console.log(`  PASS: Zero missing/orphan keys in English dictionary.`);
  }

  // 2. Check for empty strings
  console.log(`\n[CHECK 2] Value Completeness (Empty Strings):`);
  const emptyEn = [...enLeaves.entries()].filter(([, v]) => typeof v === 'string' && v.trim() === '');
  const emptyBn = [...bnLeaves.entries()].filter(([, v]) => typeof v === 'string' && v.trim() === '');

  if (emptyEn.length > 0) {
    console.error(`  FAIL: ${emptyEn.length} empty values in English:`, emptyEn.map(([k]) => k));
    hasErrors = true;
  } else {
    console.log(`  PASS: No empty string values in English.`);
  }

  if (emptyBn.length > 0) {
    console.error(`  FAIL: ${emptyBn.length} empty values in Bangla:`, emptyBn.map(([k]) => k));
    hasErrors = true;
  } else {
    console.log(`  PASS: No empty string values in Bangla.`);
  }

  // 3. Check for placeholder markers
  console.log(`\n[CHECK 3] Placeholder Detection (TODO, FIXME, [TRANSLATE]):`);
  const forbiddenMarkers = ['TODO', 'FIXME', '[TRANSLATE]', 'TBD'];
  const placeholderBn = [...bnLeaves.entries()].filter(([, v]) =>
    typeof v === 'string' && forbiddenMarkers.some((m) => v.toUpperCase().includes(m))
  );

  if (placeholderBn.length > 0) {
    console.error(`  FAIL: ${placeholderBn.length} placeholder values detected in Bangla:`, placeholderBn);
    hasErrors = true;
  } else {
    console.log(`  PASS: No placeholder markers found in translation dictionaries.`);
  }

  // 4. Scan source files for t('...') calls
  console.log(`\n[CHECK 4] Source Code Translation Key Verification:`);
  const srcDir = path.resolve(rootDir, 'src');
  const allowedExtensions = ['.ts', '.tsx'];
  let totalFilesScanned = 0;
  let totalKeysScanned = 0;
  const invalidKeyUsages = [];

  function scanDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
          scanDirectory(fullPath);
        }
      } else if (allowedExtensions.includes(path.extname(entry.name))) {
        totalFilesScanned++;
        const content = fs.readFileSync(fullPath, 'utf8');

        // Match t('key.path' or t("key.path"
        const regex = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
          totalKeysScanned++;
          const keyPath = match[1];
          if (!enLeaves.has(keyPath)) {
            invalidKeyUsages.push({ file: path.relative(rootDir, fullPath), key: keyPath });
          }
        }
      }
    }
  }

  scanDirectory(srcDir);
  console.log(`  - Files scanned: ${totalFilesScanned}`);
  console.log(`  - Total t('...') key references checked: ${totalKeysScanned}`);

  if (invalidKeyUsages.length > 0) {
    console.error(`  FAIL: ${invalidKeyUsages.length} invalid translation keys found in source code:`);
    for (const item of invalidKeyUsages.slice(0, 10)) {
      console.error(`    - ${item.file}: "${item.key}"`);
    }
    hasErrors = true;
  } else {
    console.log(`  PASS: All static t('...') references resolve to valid dictionary keys.`);
  }

  // 5. Scan financial UI files for accidental naked dollar signs
  console.log(`\n[CHECK 5] Financial Display Standard (BDT Compliance):`);
  const financialDirs = [
    path.resolve(srcDir, 'app/admin/finance'),
    path.resolve(srcDir, 'components/admin'),
    path.resolve(srcDir, 'components/instructor'),
  ];

  const dollarViolations = [];
  for (const fDir of financialDirs) {
    if (!fs.existsSync(fDir)) continue;
    const files = fs.readdirSync(fDir, { recursive: true });
    for (const file of files) {
      if (typeof file === 'string' && (file.endsWith('.tsx') || file.endsWith('.ts'))) {
        const filePath = path.join(fDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        // Match naked dollar before numbers, like $100 or $ 100, excluding template literals or regex
        const dollarRegex = /(?:>|'|"|\s)\s*\$\s*[0-9]+(?:\.[0-9]+)?/g;
        let match;
        while ((match = dollarRegex.exec(fileContent)) !== null) {
          dollarViolations.push({ file: path.relative(rootDir, filePath), match: match[0].trim() });
        }
      }
    }
  }

  if (dollarViolations.length > 0) {
    console.error(`  FAIL: ${dollarViolations.length} naked dollar sign(s) detected in financial components:`, dollarViolations);
    hasErrors = true;
  } else {
    console.log(`  PASS: Zero naked dollar sign violations in financial modules.`);
  }

  console.log('\n===========================================================');
  if (hasErrors) {
    console.error(' [FAILED] Internationalization verification failed with errors. ');
    console.error('===========================================================');
    process.exit(1);
  } else {
    console.log(' [SUCCESS] All i18n checks passed with 100% integrity.       ');
    console.log('===========================================================');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal validator error:', err);
  process.exit(1);
});
