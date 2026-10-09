import type { CourseEnrollmentItem } from './api/instructor';

/**
 * Escapes and sanitizes a single CSV field in accordance with RFC-4180
 * while defending against formula injection (CSV / DDE injection).
 *
 * Rules:
 * 1. Null or undefined values produce an empty field.
 * 2. Any field that starts with a spreadsheet formula character (=, +, -, @, \t, \r)
 *    is prefixed with a single quote (') to force spreadsheet software to treat it
 *    as a literal text label rather than an executable command.
 * 3. Any field containing double-quotes, commas, carriage returns, newlines,
 *    or leading single quotes is wrapped in double quotes, with internal quotes doubled.
 */
export function escapeCsvField(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) {
    return '';
  }

  let str = String(raw);

  // Detect and neutralize formula injection
  const isFormula = /^[=+\-@\t\r]/.test(str);
  if (isFormula) {
    str = `'${str}`;
  }

  // Quote if contains commas, double quotes, newlines, or begins with formula-neutralizing quote
  const needsQuotes = /[",\r\n]/.test(str) || isFormula;

  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Serializes an array of CourseEnrollmentItem objects into an RFC-4180 compliant CSV string.
 * Prepends a UTF-8 Byte Order Mark (\uFEFF) to guarantee Excel / spreadsheet Unicode compatibility.
 */
export function serializeRosterToCsv(items: CourseEnrollmentItem[]): string {
  const headers = [
    'Student Name',
    'Email',
    'Enrollment Status',
    'Enrolled Date',
    'Completion Date',
    'Progress Percentage',
  ];

  const headerRow = headers.map(escapeCsvField).join(',');

  const dataRows = items.map((item) => {
    return [
      escapeCsvField(item.student.name),
      escapeCsvField(item.student.email),
      escapeCsvField(item.status),
      escapeCsvField(new Date(item.enrolledAt).toLocaleDateString()),
      escapeCsvField(item.completedAt ? new Date(item.completedAt).toLocaleDateString() : 'N/A'),
      escapeCsvField(`${item.progressPercentage}%`),
    ].join(',');
  });

  // Prepend UTF-8 BOM and join rows with CRLF
  return '\uFEFF' + [headerRow, ...dataRows].join('\r\n');
}

/**
 * Generates an RFC-friendly, human-readable filename for course roster exports.
 */
export function generateRosterCsvFilename(
  courseSlugOrId: string,
  date: Date = new Date()
): string {
  const sanitized = courseSlugOrId
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const dateStr = date.toISOString().slice(0, 10);
  return `techsprout-roster-${sanitized || 'course'}-${dateStr}.csv`;
}

/**
 * Triggers a client-side download of a generated CSV string.
 */
export function downloadCsvFile(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
