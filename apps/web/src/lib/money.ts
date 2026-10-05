/**
 * Shared P5 money display helpers.
 *
 * BDT is always rendered as `BDT 1,000.00` — never with a `$` symbol.
 */

function groupedFixed2(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a major-unit amount (e.g. "1000" or 1000) for a currency code.
 * BDT -> "BDT 1,000.00". Other codes are rendered as "<CODE> 1,000.00" as well,
 * so a currency symbol can never be mismatched with the currency code.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string | null | undefined = 'BDT'
): string {
  const code = (currency || 'BDT').toUpperCase();
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  return `${code} ${groupedFixed2(safe)}`;
}

/** Format integer minor units (poisha / cents) for a currency code. */
export function formatMinorUnits(
  minor: number | null | undefined,
  currency: string | null | undefined = 'BDT'
): string {
  if (minor === null || minor === undefined || isNaN(minor)) {
    return formatMoney(0, currency);
  }
  return formatMoney(minor / 100, currency);
}
