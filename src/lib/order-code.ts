import { count, like } from "drizzle-orm";
import { db } from "@/src/db/client";
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

function isOrderCodeConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505" &&
    (error as { constraint?: unknown }).constraint === "orders_code_unique"
  );
}

async function nextOrderSequence(date: Date): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(orders)
    .where(like(orders.code, `${orderCodeMonthPrefix(date)}-%`));
  return value + 1;
}

/**
 * Formats a `TFT-YYMM-NNN` code from this month's current order count and
 * calls `insert` with it, retrying against a freshly recounted sequence on a
 * unique-violation — same collision-retry shape as `insertWithUniqueSku`
 * (`sku.ts`), necessary because `neon-http` has no transaction to lock the
 * count with.
 */
export async function insertWithUniqueOrderCode<T>(date: Date, insert: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_ORDER_CODE_ATTEMPTS; attempt++) {
    const code = formatOrderCode(date, await nextOrderSequence(date));
    try {
      return await insert(code);
    } catch (error) {
      if (!isOrderCodeConstraintViolation(error) || attempt === MAX_ORDER_CODE_ATTEMPTS - 1) throw error;
    }
  }
  throw new Error("Could not assign a unique order code");
}
