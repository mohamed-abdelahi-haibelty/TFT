import { sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/src/db/client";
import { isUniqueViolation } from "@/src/lib/db-errors";

// Catalog writes run on `db` (neon-http), one statement per request, so there
// is no transaction here to hold a lock in — the way `order-code.ts` now
// serialises order numbering with `pg_advisory_xact_lock`. Instead each insert
// is retried on a unique-violation against a number that is guaranteed to
// advance every attempt, which is adequate because two admins saving a new
// product at the same instant is rare and the retry is cheap. A caller that
// ever needs this *inside* a transaction must switch to the lock: a violation
// poisons its own transaction, leaving nothing to retry with.
//
// The sequence is the table's current high-water mark, NOT its row count: a
// count is blind to gaps, so deleting anything but the last row made every
// subsequent create collide with an existing SKU forever, and the retry loop —
// which recomputed the same count each time — could never escape it.
const MAX_SKU_ATTEMPTS = 5;

export function formatSku(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(6, "0")}`;
}

/**
 * Highest numeric suffix currently issued under `prefix`, + 1. Rows whose SKU
 * doesn't match `PREFIX-<digits>` (hand-edited, imported) contribute nothing
 * rather than breaking the cast.
 */
async function nextSkuNumber(table: PgTable, column: PgColumn, prefix: string): Promise<number> {
  const pattern = `^${prefix}-([0-9]+)$`;
  const [row] = await db
    .select({ value: sql<number | null>`max(substring(${column} from ${pattern})::int)` })
    .from(table);
  return (row?.value ?? 0) + 1;
}

/**
 * Formats a `PREFIX-NNNNNN` SKU from `table`'s current high-water mark and
 * calls `insert` with it, retrying when `insert` throws a unique-violation on
 * `constraint`. Each retry re-reads the mark and, if it hasn't moved, steps
 * past its own last candidate — so the same number is never tried twice.
 */
export async function insertWithUniqueSku<T>(
  table: PgTable,
  column: PgColumn,
  prefix: string,
  constraint: string,
  insert: (sku: string) => Promise<T>,
): Promise<T> {
  let sequence = await nextSkuNumber(table, column, prefix);

  for (let attempt = 0; attempt < MAX_SKU_ATTEMPTS; attempt++) {
    try {
      return await insert(formatSku(prefix, sequence));
    } catch (error) {
      if (!isUniqueViolation(error, constraint) || attempt === MAX_SKU_ATTEMPTS - 1) {
        throw error;
      }
      const rechecked = await nextSkuNumber(table, column, prefix);
      sequence = Math.max(rechecked, sequence + 1);
    }
  }

  throw new Error("Could not assign a unique SKU");
}
