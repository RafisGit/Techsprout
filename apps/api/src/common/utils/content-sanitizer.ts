import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../errors/api-error';

/**
 * Validates and sanitizes text/markdown content for discussions and assignments.
 * Strictly rejects scripts, event handlers, and unsafe URL schemes.
 */
export function validateAndSanitizeContent(input: string, fieldName = 'content'): string {
  if (!input) return '';

  // 1. Strictly detect and reject malicious executable markup or URI schemes
  const maliciousPatterns = [
    /<\s*script\b/i,
    /<\s*\/\s*script\s*>/i,
    /javascript\s*:/i,
    /vbscript\s*:/i,
    /data\s*:\s*text\/html/i,
    /\son[a-z]+\s*=/i, // onload=, onerror=, onclick=, etc.
    /<\s*(iframe|object|embed|applet|meta|base|link|form)\b/i,
  ];

  for (const pattern of maliciousPatterns) {
    if (pattern.test(input)) {
      throw new ApiException(
        `MALICIOUS_CONTENT_REJECTED: Field "${fieldName}" contains disallowed executable markup, script tags, or unsafe URL schemes`,
        HttpStatus.BAD_REQUEST,
        'MALICIOUS_CONTENT_REJECTED'
      );
    }
  }

  // 2. Extra defense-in-depth: strip any residual dangerous tags or patterns
  let sanitized = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?(iframe|object|embed|applet|form|input|button|link|style|meta|base)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
    .replace(/\[([^\]]+)\]\((?:javascript|vbscript|data):[^\)]*\)/gi, '[$1](#)');

  return sanitized.trim();
}
