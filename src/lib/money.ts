/**
 * Shared money formatter — integer MRU, always Western digits (even in the
 * Arabic locale) so it lines up with Geist Mono in tabular price columns,
 * per DESIGN.md's numerals rule.
 */
export function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat("en-US").format(amount)} MRU`;
}
