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

  revalidatePath(`/${locale}/admin/orders`);
  revalidatePath(`/${locale}/admin/pos`);
  revalidatePath(`/${locale}/admin`);
  revalidateTag("products", "max");
  revalidateTag("bundles", "max");
  revalidateTag(dashboardMonthTag(currentMonthKey()), "max");

  return result;
}
