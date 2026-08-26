import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, withTransaction } from "@/src/db/client";

/**
 * These three indexes exist because a read that runs constantly had nothing to
 * use — `order_items.order_id` in particular was never indexed at all, which
 * Postgres does not do for a foreign key on your behalf. On a dev branch with a
 * handful of rows the planner correctly prefers a sequential scan regardless,
 * so `enable_seqscan = off` is what makes the question answerable here: not
 * "is this plan chosen today" but "does an index of the right shape exist for
 * this query at all".
 */
async function planWithoutSeqScan(query: ReturnType<typeof sql>): Promise<string> {
  return withTransaction(async (tx) => {
    await tx.execute(sql`set local enable_seqscan = off`);
    const explained = await tx.execute(sql`explain ${query}`);
    return explained.rows.map((row) => row["QUERY PLAN"]).join("\n");
  });
}

describe("indexes", () => {
  it("exist", async () => {
    const { rows } = await db.execute(sql`select indexname from pg_indexes where schemaname = 'public'`);
    const names = rows.map((row) => row.indexname as string);

    expect(names).toContain("order_items_order_id_idx");
    expect(names).toContain("orders_status_created_at_idx");
    expect(names).toContain("stock_movements_created_at_idx");
    // Superseded by the composite, whose leading column it duplicates.
    expect(names).not.toContain("orders_status_idx");
  });

  it("serve the reads they were added for", async () => {
    // `listStockMovements` with no product filter — the default view.
    expect(await planWithoutSeqScan(sql`select * from stock_movements order by created_at desc limit 50`)).toContain(
      "stock_movements_created_at_idx",
    );

    // `listOrdersAdmin` filtered by status, and the dashboard's pending panel.
    expect(
      await planWithoutSeqScan(sql`select * from orders where status = 'pending' order by created_at desc limit 50`),
    ).toContain("orders_status_created_at_idx");

    // Every order detail read, `recomputeOrderTotals`, and the cascade delete.
    // A literal, not `gen_random_uuid()`: a volatile function in the predicate
    // rules an index scan out on its own, whatever indexes exist.
    expect(await planWithoutSeqScan(sql`select * from order_items where order_id = '00000000-0000-0000-0000-000000000000'::uuid`)).toContain(
      "order_items_order_id_idx",
    );
  });
});
