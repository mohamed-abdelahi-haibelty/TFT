import { count } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/src/db/client";

// The `neon-http` driver has no transaction support (see progress-tracker.md),
// so sequential SKU numbering can't be made atomic with a lock. Instead each
// insert is retried against a freshly recounted number on a unique-violation
// — cheap and correct since a collision only ever comes from a concurrent
// insert that already committed its own number.
const MAX_SKU_ATTEMPTS = 5;

function isSkuConstraintViolation(error: unknown, constraint: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505" &&
    (error as { constraint?: unknown }).constraint === constraint
  );
}

async function nextSkuNumber(table: PgTable): Promise<number> {
  const [{ value }] = await db.select({ value: count() }).from(table);
  return value + 1;
}

/**
 * Formats a `PREFIX-NNNNNN` SKU from `table`'s current row count and calls
 * `insert` with it, retrying against a freshly recounted number when `insert`
 * throws a unique-violation on `constraint`.
 */
export async function insertWithUniqueSku<T>(
  table: PgTable,
  prefix: string,
  constraint: string,
  insert: (sku: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_SKU_ATTEMPTS; attempt++) {
    const sku = `${prefix}-${String(await nextSkuNumber(table)).padStart(6, "0")}`;
    try {
      return await insert(sku);
    } catch (error) {
      if (!isSkuConstraintViolation(error, constraint) || attempt === MAX_SKU_ATTEMPTS - 1) {
        throw error;
      }
    }
  }
  throw new Error("Could not assign a unique SKU");
}
