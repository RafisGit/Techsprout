/**
 * TechSprout School LMS - Content Security Policy & Origin Utilities
 *
 * Normalizes multi-origin environment variables (e.g. Render / Vercel comma-separated WEB_ORIGIN)
 * into individual source entries for Helmet CSP and CORS.
 */

/**
 * Normalizes a comma-separated origin string into a clean, deduplicated array of origins.
 * Strips whitespace, removes empty entries, deduplicates origins, and rejects invalid strings.
 */
export function parseAllowedOrigins(rawOrigins?: string): string[] {
  if (!rawOrigins) {
    return [];
  }

  const seen = new Set<string>();
  const origins: string[] = [];

  for (const item of rawOrigins.split(',')) {
    const trimmed = item.trim();
    // Validate: non-empty, no internal whitespace, no comma remnants, deduplicated
    if (trimmed && !/\s/.test(trimmed) && !trimmed.includes(',') && !seen.has(trimmed)) {
      seen.add(trimmed);
      origins.push(trimmed);
    }
  }

  return origins;
}

/**
 * Builds the Helmet Content Security Policy directives object.
 * Guarantees every allowed origin is passed as an individual source entry into connect-src.
 * Never allows '*' or comma-delimited strings within a directive value.
 */
export function buildCspDirectives(customOrigins: string[]) {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", ...customOrigins],
    frameAncestors: ["'none'"],
  };
}
