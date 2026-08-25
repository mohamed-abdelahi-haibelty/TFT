/**
 * `%` and `_` are wildcards to `LIKE`/`ILIKE`. Every search box in this app
 * interpolates its term into `%term%`, so an unescaped `%` typed by a user
 * silently matches everything and an `_` matches any single character. The
 * queries are parameterised (no injection risk) — this is purely about the
 * term meaning what the person typed.
 *
 * `\` is the default `ESCAPE` character for `LIKE`, so escaping it first, then
 * the two wildcards, needs no explicit `ESCAPE` clause.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** `%escaped%`, ready to hand to `ilike()`. Returns `null` for a blank term. */
export function containsTerm(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return `%${escapeLikeTerm(trimmed)}%`;
}
