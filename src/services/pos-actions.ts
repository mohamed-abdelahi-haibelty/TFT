"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import type { ServiceResult } from "@/src/lib/errors";
import { currentMonthKey, dashboardMonthTag } from "@/src/services/dashboard";
import { completeSale, resolvePosItem, type CompleteSaleResult, type PosLookupResult } from "@/src/services/pos";

/** Called directly from client handlers (a quick-pick tap, a manual-search pick) — not form-bound, since it fires on events that aren't form submissions. */
export async function resolvePosItemAction(sku: string): Promise<ServiceResult<PosLookupResult>> {
  const locale = await getLocale();
  return resolvePosItem(sku, locale);
}

export type CompleteSalePayload = {
  paymentMethod: "cash" | "bankily" | "masrvi" | "sedad" | "other";
  /** One key per sale, reused across retries — see `orders.idempotencyKey`. */
  idempotencyKey?: string;
  lines: {
    kind: "product" | "bundle";
    productId?: string;
    variantId?: string;
    bundleId?: string;
    qty: number;
    overridden: boolean;
  }[];
  removedLines: {
    nameSnapshot: string;
    unitPrice: number;
    qty: number;
    reason: "added_by_mistake" | "changed_mind";
  }[];
};

export async function completeSaleAction(payload: CompleteSalePayload): Promise<ServiceResult<CompleteSaleResult>> {
  const locale = await getLocale();
  const result = await completeSale({ locale, ...payload });
  if (!result.ok) return result;

  // Not `/admin/pos`, and not the storefront's `"products"` / `"bundles"`
  // tags. A sale moves stock and nothing else — no name, price, image or
  // active flag — and both of those were rebuilding whole pages to reflect it.
  //
  // The register redraws itself from the levels the sale returns (see
  // `CompleteSaleResult`), and the storefront tolerates a stock number up to
  // `STOREFRONT_REVALIDATE_SECONDS` old, which cannot oversell anything
  // because `createOrderCore` re-checks availability before accepting an
  // order. Between them that removes the busiest surface in the shop from the
  // database's workload — see `revalidateOrder` in order-actions.ts, which
  // draws the same line for the order desk.
  revalidatePath(`/${locale}/admin/orders`);
  revalidatePath(`/${locale}/admin`);
  revalidateTag(dashboardMonthTag(currentMonthKey()), "max");

  return result;
}
