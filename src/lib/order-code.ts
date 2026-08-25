import { like, sql } from "drizzle-orm";
import { db } from "@/src/db/client";
import { isUniqueViolation } from "@/src/lib/db-errors";
import { orders } from "@/src/db/schema";

const MAX_ORDER_CODE_ATTEMPTS = 5;

/**
 * `TFT-YYMM`. Was `PPT-` (the "Papeterie" scaffolding name) — PRODUCT.md
 * declares THE FIRST TRADE / TFT the real name, and this prefix is
 * customer-visible on the confirmation, the tracking result, and the track
 * field's placeholder. Codes already issued keep their old prefix; lookup
 * matches on the stored code, so they keep resolving.
 */
export function orderCodeMonthPrefix(date: Date): string {
  const yy = String(date.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `TFT-${yy}${mm}`;
}

export function formatOrderCode(date: Date, sequence: number): string {
  return `${orderCodeMonthPrefix(date)}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Highest sequence issued this month, + 1 — a high-water mark, not a row
 * count. Both order-creation paths delete their own order row when a later
 * write fails (`neon-http` has no transaction to roll back), so a count would
 * hand the next order a code that already exists and the retry below could
 * never escape it. Same reasoning as `sku.ts`.
 */
async function nextOrderSequence(date: Date): Promise<number> {
  const prefix = orderCodeMonthPrefix(date);
  const [row] = await db
    .select({ value: sql<number | null>`max(substring(${orders.code} from ${`^${prefix}-([0-9]+)$`})::int)` })
    .from(orders)
    .where(like(orders.code, `${prefix}-%`));
  return (row?.value ?? 0) + 1;
}

/**
 * Formats a `TFT-YYMM-NNN` code and calls `insert` with it, retrying against a
 * strictly-advancing sequence on a unique-violation — same collision-retry
 * shape as `insertWithUniqueSku` (`sku.ts`), necessary because `neon-http` has
 * no transaction to lock the sequence with.
 */
export async function insertWithUniqueOrderCode<T>(date: Date, insert: (code: string) => Promise<T>): Promise<T> {
  let sequence = await nextOrderSequence(date);

  for (let attempt = 0; attempt < MAX_ORDER_CODE_ATTEMPTS; attempt++) {
    try {
      return await insert(formatOrderCode(date, sequence));
    } catch (error) {
      if (!isUniqueViolation(error, "orders_code_unique") || attempt === MAX_ORDER_CODE_ATTEMPTS - 1) throw error;
      const rechecked = await nextOrderSequence(date);
      sequence = Math.max(rechecked, sequence + 1);
    }
  }
  throw new Error("Could not assign a unique order code");
}
