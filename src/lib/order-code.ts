import { like, sql } from "drizzle-orm";
import type { Tx } from "@/src/db/client";
import { orders } from "@/src/db/schema";

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
 * count, so a gap left by any deleted or rolled-back order can never hand the
 * next order a code that already exists. Same reasoning as `sku.ts`.
 */
async function nextOrderSequence(tx: Tx, date: Date): Promise<number> {
  const prefix = orderCodeMonthPrefix(date);
  const [row] = await tx
    .select({ value: sql<number | null>`max(substring(${orders.code} from ${`^${prefix}-([0-9]+)$`})::int)` })
    .from(orders)
    .where(like(orders.code, `${prefix}-%`));
  return (row?.value ?? 0) + 1;
}

/**
 * Formats a `TFT-YYMM-NNN` code and calls `insert` with it, inside the caller's
 * transaction.
 *
 * Reading the high-water mark and inserting against it is a read-then-write
 * race: two registers ringing up at once both see the same maximum and both
 * try the same code. This used to be handled by catching the unique violation
 * and retrying with a higher sequence, which worked only because each
 * statement was its own `neon-http` request. Inside a real transaction that
 * approach is broken — a constraint violation poisons the whole transaction,
 * so every statement after it fails too and there is nothing left to retry
 * with.
 *
 * So the race is prevented rather than recovered from. The transaction-scoped
 * advisory lock serialises code assignment for this month across concurrent
 * transactions and is released automatically on commit *or* rollback, with no
 * unlock path to forget. It is held only for the few statements a sale takes,
 * and orders are written rarely next to how often they are read.
 */
export async function insertWithUniqueOrderCode<T>(
  tx: Tx,
  date: Date,
  insert: (code: string) => Promise<T>,
): Promise<T> {
  const prefix = orderCodeMonthPrefix(date);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`);

  return insert(formatOrderCode(date, await nextOrderSequence(tx, date)));
}
