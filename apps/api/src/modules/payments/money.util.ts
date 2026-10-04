/**
 * TechSprout Financial Money Utilities
 *
 * Strict deterministic conversions between integer minor units (cents/poisha)
 * and gateway decimal string representations.
 * Binary floating-point arithmetic is strictly avoided for financial decisions.
 */

export function decimalStringToCents(amount: string | number): number {
  if (amount == null) {
    throw new Error('Amount is required');
  }

  const str = typeof amount === 'number' ? amount.toFixed(2) : String(amount).trim();

  if (!str || !/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error(`Invalid decimal amount format: "${amount}"`);
  }

  const [wholePart, fractionPart = ''] = str.split('.');
  const whole = parseInt(wholePart, 10);
  const fraction = parseInt(fractionPart.padEnd(2, '0').slice(0, 2), 10);

  return whole * 100 + fraction;
}

export function centsToDecimalString(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`Invalid cents amount: ${cents}`);
  }

  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;

  return `${whole}.${fraction.toString().padStart(2, '0')}`;
}

export function calculateDiscountCents(
  subtotalCents: number,
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT',
  discountValue: number,
  maxDiscountAmountCents?: number | null
): number {
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
    throw new Error(`Invalid subtotalCents: ${subtotalCents}`);
  }

  if (subtotalCents === 0 || discountValue <= 0) {
    return 0;
  }

  let calculatedDiscount = 0;

  if (discountType === 'PERCENTAGE') {
    // Integer arithmetic: (subtotal * percentage) / 100 rounded
    calculatedDiscount = Math.round((subtotalCents * discountValue) / 100);
  } else if (discountType === 'FIXED_AMOUNT') {
    // Fixed amount value is in minor units (cents/poisha)
    calculatedDiscount = discountValue;
  }

  // Cap at max discount if configured
  if (maxDiscountAmountCents != null && maxDiscountAmountCents > 0) {
    calculatedDiscount = Math.min(calculatedDiscount, maxDiscountAmountCents);
  }

  // Discount can never exceed subtotal
  return Math.min(calculatedDiscount, subtotalCents);
}
