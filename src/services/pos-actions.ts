"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import type { ServiceResult } from "@/src/lib/errors";
import { currentMonthKey, dashboardMonthTag } from "@/src/services/dashboard";
import { completeSale, resolvePosScan, type CompleteSaleResult, type PosScanResult } from "@/src/services/pos";

/** Called directly from client handlers (a scanner keystroke, a quick-pick tap, a manual-search pick) — not form-bound, since it fires on events that aren't form submissions. */
export async function resolvePosScanAction(sku: string): Promise<ServiceResult<PosScanResult>> {
  const locale = await getLocale();
  return resolvePosScan(sku, locale);
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
    reason: "wrong_scan" | "changed_mind";
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
