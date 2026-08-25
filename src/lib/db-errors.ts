/**
 * Postgres reports a broken unique index as SQLSTATE `23505` plus the
 * constraint name. Several services check a value's availability with a
 * `SELECT` and then insert it — which is not atomic, and can't be made atomic
 * here because `neon-http` has no transactions. Recognising the violation lets
 * those callers return the message they already prepared for that exact
 * outcome instead of letting a raw driver error escape the server action.
 *
 * The code and constraint are NOT on the error Drizzle throws: it wraps the
 * driver's `NeonDbError` in a `DrizzleQueryError` carrying it as `cause`. A
 * check that only looked at the top-level object therefore matched nothing —
 * which silently disabled the collision retries in `sku.ts` and
 * `order-code.ts` as well. Walking the chain is what makes any of them work.
 */
const MAX_CAUSE_DEPTH = 5;

type PgErrorShape = { code?: unknown; constraint?: unknown; cause?: unknown };

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (typeof current !== "object" || current === null) return false;

    const candidate = current as PgErrorShape;
    if (candidate.code === "23505" && candidate.constraint === constraint) return true;

    if (!("cause" in candidate)) return false;
    current = candidate.cause;
  }

  return false;
}
