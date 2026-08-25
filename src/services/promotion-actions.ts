"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import type { ServiceResult } from "@/src/lib/errors";
import { readJsonArray } from "@/src/lib/form-data";
import { createPromotion, togglePromotionActive, updatePromotion } from "@/src/services/promotions";

async function revalidatePromotions(promotionId?: string) {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/promotions`);
  if (promotionId) revalidatePath(`/${locale}/admin/promotions/${promotionId}`);
  // A promo changes what price a covered product/bundle shows or charges —
  // revalidate the same tags a product/bundle mutation would.
  revalidateTag("products", "max");
  revalidateTag("bundles", "max");
}

function readPromotionInput(formData: FormData) {
  return {
    nameAr: formData.get("nameAr"),
    nameFr: formData.get("nameFr"),
    kind: formData.get("kind"),
    value: Number(formData.get("value")),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    channel: formData.get("channel"),
    isActive: formData.get("isActive") === "on",
    productIds: readJsonArray(formData, "productIds"),
    bundleIds: readJsonArray(formData, "bundleIds"),
  };
}

export async function createPromotionAction(
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await createPromotion(readPromotionInput(formData));
  if (!result.ok) return result;

  await revalidatePromotions(result.data.id);
  const locale = await getLocale();
  redirect(`/${locale}/admin/promotions`);
}

export async function updatePromotionAction(
  id: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await updatePromotion(id, readPromotionInput(formData));
  if (!result.ok) return result;

  await revalidatePromotions(id);
  const locale = await getLocale();
  redirect(`/${locale}/admin/promotions`);
}

export type TogglePromotionActiveState = ServiceResult<null> | null;

export async function togglePromotionActiveAction(
  promotionId: string,
  nextActive: boolean,
  _prev: TogglePromotionActiveState,
  _formData: FormData,
): Promise<TogglePromotionActiveState> {
  const result = await togglePromotionActive(promotionId, nextActive);
  if (!result.ok) return result;

  await revalidatePromotions(promotionId);
  return { ok: true, data: null };
}
