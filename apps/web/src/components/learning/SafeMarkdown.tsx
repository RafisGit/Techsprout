'use client';

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Lightweight safe markdown renderer that converts standard markdown (bold, italic, code, links, lists)
 * and thoroughly sanitizes the HTML via DOMPurify to eliminate all XSS, script injection, and unsafe protocols.
 */
export function SafeMarkdown({ content, className = '' }: SafeMarkdownProps) {
  const sanitizedHtml = useMemo(() => {
    if (!content) return '';

    // Simple markdown to HTML transforms
    let rawHtml = content
      // Escape HTML entities first to avoid raw markup injection
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // Code blocks: ```code```
    rawHtml = rawHtml.replace(
      /```([a-z0-9_-]*)\n([\s\S]*?)```/g,
      '<pre class="bg-gray-900 text-gray-100 p-3 rounded-xl overflow-x-auto text-xs my-2 font-mono"><code>$2</code></pre>'
    );

    // Inline code: `code`
    rawHtml = rawHtml.replace(
      /`([^`]+)`/g,
      '<code class="bg-gray-100 text-purple-700 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>'
    );

    // Bold: **text**
    rawHtml = rawHtml.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    rawHtml = rawHtml.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers: # Header
    rawHtml = rawHtml.replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-gray-900 mt-2 mb-1">$1</h3>');
    rawHtml = rawHtml.replace(/^## (.*$)/gim, '<h2 class="text-base font-bold text-gray-900 mt-3 mb-1">$1</h2>');
    rawHtml = rawHtml.replace(/^# (.*$)/gim, '<h1 class="text-lg font-bold text-gray-900 mt-3 mb-1">$1</h1>');

    // Markdown links: [text](url) -> only allow http, https, mailto
    rawHtml = rawHtml.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/gi, (match, text, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium">${text}</a>`;
    });

    // Line breaks to <br />
    rawHtml = rawHtml.replace(/\n/g, '<br />');

    // Client-side DOMPurify pass
    if (typeof window !== 'undefined') {
      return DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
          'strong',
          'em',
          'u',
          'code',
          'pre',
          'h1',
          'h2',
          'h3',
          'a',
          'p',
          'br',
          'ul',
          'ol',
          'li',
          'blockquote',
        ],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      });
    }

    return rawHtml;
  }, [content]);

  return (
    <div
      className={`prose prose-sm max-w-none text-gray-800 break-words leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
