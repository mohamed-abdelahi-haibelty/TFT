/**
 * Mauritanian mobile numbers: 8 local digits starting 2, 3, or 4. Stored
 * everywhere (DB, WhatsApp links) as the full `222XXXXXXXX` form. The
 * checkout form only ever collects the 8-digit local part (a fixed "+222"
 * prefix sits beside the input), but this normalizer also accepts a pasted
 * `222…` / `+222…` / `00222…` value so a copy-pasted number still works.
 */
export function normalizeMauritanianPhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");

  if (digits.startsWith("00222")) digits = digits.slice(5);
  else if (digits.startsWith("222") && digits.length === 11) digits = digits.slice(3);

  if (!/^[234]\d{7}$/.test(digits)) return null;

  return `222${digits}`;
}

export function isValidMauritanianPhone(input: string): boolean {
  return normalizeMauritanianPhone(input) !== null;
}
