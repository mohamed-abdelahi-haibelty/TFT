"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import type { ServiceResult } from "@/src/lib/errors";
import { adjustStock } from "@/src/services/inventory";

export type AdjustStockState = ServiceResult<{ stockQty: number }> | null;

export async function adjustStockAction(
  productId: string,
  variantId: string | null,
  _prev: AdjustStockState,
  formData: FormData,
): Promise<AdjustStockState> {
  const result = await adjustStock({
    productId,
    variantId,
    mode: formData.get("mode"),
    value: Number(formData.get("value")),
    reason: formData.get("reason"),
    note: formData.get("note") || null,
  });
  if (!result.ok) return result;

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/inventory`);
  revalidatePath(`/${locale}/admin/inventory/movements`);
  revalidatePath(`/${locale}/admin/products`);
  revalidatePath(`/${locale}/admin/products/${productId}`);
  revalidatePath(`/${locale}/admin/pos`);
  revalidateTag("products", "max");

  return result;
}
