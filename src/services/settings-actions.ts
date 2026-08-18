"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import type { ServiceResult } from "@/src/lib/errors";
import { updateShopSettings } from "@/src/services/settings";

export async function updateShopSettingsAction(
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await updateShopSettings({
    whatsappNumber: formData.get("whatsappNumber") ?? "",
    addressAr: formData.get("addressAr") ?? "",
    addressFr: formData.get("addressFr") ?? "",
    mapsUrl: formData.get("mapsUrl") ?? "",
  });
  if (!result.ok) return result;

  const locale = await getLocale();
  // The storefront home and boxes pages are prerendered (● SSG in the build
  // output) and the footer renders on every storefront route, so invalidating
  // the tag alone is not enough — without the layout revalidation a saved
  // number would not appear until the next deploy.
  revalidateTag("shop-settings", "max");
  revalidatePath("/[locale]", "layout");
  revalidatePath(`/${locale}/admin/settings`);

  return { ok: true, data: null };
}
