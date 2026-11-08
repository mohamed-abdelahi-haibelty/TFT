import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/src/db/client";
import { bundleItems, products, productVariants, stockMovements } from "@/src/db/schema";

// --- Stock adjustment: shared by confirm / cancel / item edits ------------
// (also reused by `pos.ts` for a completed counter sale and its void — see
// task 14, which needed the exact same atomic-decrement/rollback shape one
// level up in its own order/void orchestration rather than duplicating it.)

export type StockLine = {
  itemLabel: string;
  productId: string;
  variantId: string | null;
  usesVariantStock: boolean;
  qty: number;
  allowBackorder: boolean;
  /**
   * A cashier vouching that the item is physically here even though the count
   * says otherwise (POS only — gated on `inventory.adjust`). Carried on the
   * line so a whole basket can be expanded in one `loadStockLines` call
   * instead of one call per line, which is what it used to take to keep each
   * line's own flag attached to its components.
   */
  overridden: boolean;
};

/** What one stock-tracked unit holds after a write — what the register redraws its tiles from. */
export type StockLevel = { productId: string; variantId: string | null; stockQty: number };

export type StockLineSource = {
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  qty: number;
  nameSnapshot: string;
  /** POS only; defaults to `false` everywhere else. */
  overridden?: boolean;
};

/**
 * Expands order lines into flat stock-adjustment units — a product/variant
 * line is one unit, a bundle line is expanded into one unit per current
 * component (qty × the component's own qty), re-read fresh from
 * `bundle_items` at call time (not a snapshot of the bundle's composition
 * when the order was placed — this codebase doesn't version bundle
 * composition, same simplification `createOrderCore`'s own availability
 * check already makes).
 */
export async function loadStockLines(tx: Tx, sources: StockLineSource[]): Promise<StockLine[]> {
  const productIds = [...new Set(sources.filter((s) => s.productId).map((s) => s.productId!))];
  const variantIds = [...new Set(sources.filter((s) => s.variantId).map((s) => s.variantId!))];
  const bundleIds = [...new Set(sources.filter((s) => s.bundleId).map((s) => s.bundleId!))];

  const [productRows, variantRows, bundleComponentRows] = await Promise.all([
    productIds.length
      ? tx.select({ id: products.id, allowBackorder: products.allowBackorder }).from(products).where(inArray(products.id, productIds))
      : Promise.resolve([]),
    variantIds.length
      ? tx
          .select({ id: productVariants.id, stockQty: productVariants.stockQty })
          .from(productVariants)
          .where(inArray(productVariants.id, variantIds))
      : Promise.resolve([]),
    bundleIds.length
      ? tx
          .select({
            bundleId: bundleItems.bundleId,
            qty: bundleItems.qty,
            productId: bundleItems.productId,
            variantId: bundleItems.variantId,
            productAllowBackorder: products.allowBackorder,
            variantStockQty: productVariants.stockQty,
          })
          .from(bundleItems)
          .innerJoin(products, eq(bundleItems.productId, products.id))
          .leftJoin(productVariants, eq(bundleItems.variantId, productVariants.id))
          .where(inArray(bundleItems.bundleId, bundleIds))
      : Promise.resolve([]),
  ]);

  const productById = new Map(productRows.map((row) => [row.id, row]));
  const variantById = new Map(variantRows.map((row) => [row.id, row]));
  const componentsByBundle = new Map<string, typeof bundleComponentRows>();
  for (const row of bundleComponentRows) {
    const list = componentsByBundle.get(row.bundleId) ?? [];
    list.push(row);
    componentsByBundle.set(row.bundleId, list);
  }

  const lines: StockLine[] = [];
  for (const source of sources) {
    if (source.productId) {
      const product = productById.get(source.productId);
      if (!product) continue;
      const variant = source.variantId ? variantById.get(source.variantId) : null;
      const usesVariantStock = !!variant && variant.stockQty !== null;
      lines.push({
        itemLabel: source.nameSnapshot,
        productId: source.productId,
        variantId: usesVariantStock ? source.variantId! : null,
        usesVariantStock,
        qty: source.qty,
        allowBackorder: product.allowBackorder,
        overridden: source.overridden ?? false,
      });
    } else if (source.bundleId) {
      const components = componentsByBundle.get(source.bundleId) ?? [];
      for (const component of components) {
        const usesVariantStock = component.variantId != null && component.variantStockQty !== null;
        lines.push({
          itemLabel: source.nameSnapshot,
          productId: component.productId,
          variantId: usesVariantStock ? component.variantId : null,
          usesVariantStock,
          qty: source.qty * component.qty,
          allowBackorder: component.productAllowBackorder,
          // A bundle's components inherit the top-level line's override, so a
          // cashier overriding a box overrides everything inside it.
          overridden: source.overridden ?? false,
        });
      }
    }
  }
  return lines;
}

/**
 * Thrown when a non-backorder line cannot be satisfied, to abort the
 * transaction it is running in.
 *
 * This is how "all or nothing" is expressed now. It used to be a `false`
 * return value that each caller had to notice and answer by replaying its own
 * writes backwards — a compensating-undo scheme that was, by some distance,
 * the most delicate code in the repo, and that could itself fail halfway and
 * leave recorded stock permanently adrift. `ROLLBACK` does the same job
 * unconditionally, so the label is all that has to survive the unwind.
 */
export class InsufficientStockError extends Error {
  constructor(readonly itemLabel: string) {
    super(`Insufficient stock for ${itemLabel}`);
    this.name = "InsufficientStockError";
  }
}

/**
 * Atomic, conditional decrement (task 13: "conditional update") — a
 * non-backorder line's `WHERE` clause requires enough stock, so a race lost
 * between a pre-check and this write still can't drive it negative; a
 * backorder line has no floor at all and is allowed to go negative,
 * visibly (see the relaxed `products_stock_qty_non_negative` check,
 * migration `0003`).
 *
 * The conditional `WHERE` still earns its keep inside a transaction: it is
 * what makes the decrement safe against a concurrent register, which
 * `READ COMMITTED` on its own does not give.
 *
 * Throws `InsufficientStockError` when the conditional update matches no rows.
 * Returns the level the decrement left behind, so a caller can tell a client
 * what the new count is without reading it back.
 */
export async function decrementStockLine(
  tx: Tx,
  line: StockLine,
  orderId: string,
  actorId: string | null,
  reason: (typeof stockMovements.reason.enumValues)[number],
  note?: string,
): Promise<StockLevel> {
  let remaining: number | undefined;

  if (line.usesVariantStock) {
    const where = line.allowBackorder
      ? eq(productVariants.id, line.variantId!)
      : and(eq(productVariants.id, line.variantId!), gte(productVariants.stockQty, line.qty));
    const rows = await tx
      .update(productVariants)
      .set({ stockQty: sql`${productVariants.stockQty} - ${line.qty}` })
      .where(where)
      .returning({ stockQty: productVariants.stockQty });
    remaining = rows[0]?.stockQty ?? undefined;
  } else {
    const where = line.allowBackorder
      ? eq(products.id, line.productId)
      : and(eq(products.id, line.productId), gte(products.stockQty, line.qty));
    const rows = await tx
      .update(products)
      .set({ stockQty: sql`${products.stockQty} - ${line.qty}` })
      .where(where)
      .returning({ stockQty: products.stockQty });
    remaining = rows[0]?.stockQty;
  }

  if (remaining === undefined) throw new InsufficientStockError(line.itemLabel);

  await tx.insert(stockMovements).values({
    productId: line.productId,
    variantId: line.variantId,
    delta: -line.qty,
    reason,
    orderId,
    actorId,
    note: note ?? null,
  });

  return { productId: line.productId, variantId: line.variantId, stockQty: remaining };
}

export async function incrementStockLine(
  tx: Tx,
  line: StockLine,
  orderId: string,
  actorId: string | null,
  reason: (typeof stockMovements.reason.enumValues)[number],
  note?: string,
): Promise<void> {
  if (line.usesVariantStock) {
    await tx
      .update(productVariants)
      .set({ stockQty: sql`${productVariants.stockQty} + ${line.qty}` })
      .where(eq(productVariants.id, line.variantId!));
  } else {
    await tx
      .update(products)
      .set({ stockQty: sql`${products.stockQty} + ${line.qty}` })
      .where(eq(products.id, line.productId));
  }

  await tx.insert(stockMovements).values({
    productId: line.productId,
    variantId: line.variantId,
    delta: line.qty,
    reason,
    orderId,
    actorId,
    note: note ?? null,
  });
}

/** Every line or none: the first one that cannot be satisfied throws, and the transaction takes the rest back. */
export async function decrementStockLines(
  tx: Tx,
  lines: StockLine[],
  orderId: string,
  actorId: string | null,
  reason: (typeof stockMovements.reason.enumValues)[number],
): Promise<void> {
  for (const line of lines) await decrementStockLine(tx, line, orderId, actorId, reason);
}
