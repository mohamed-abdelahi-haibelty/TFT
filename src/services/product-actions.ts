"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import type { ServiceResult } from "@/src/lib/errors";
import { readJsonArray } from "@/src/lib/form-data";
import type { DeactivatedBundleRef } from "@/src/services/bundles";
import {
  createProduct,
  deleteProduct,
  reorderQuickPicks,
  toggleProductActive,
  toggleQuickPick,
  toggleVariantActive,
  updateProduct,
} from "@/src/services/products";

async function revalidateProducts(productId?: string) {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/products`);
  if (productId) revalidatePath(`/${locale}/admin/products/${productId}`);
  revalidateTag("products", "max");
  // A deactivation here can cascade into dependent bundles (task-07) — cheap
  // to always revalidate the bundles list alongside products rather than
  // conditioning it on whether this particular call happened to cascade.
  revalidatePath(`/${locale}/admin/bundles`);
  revalidateTag("bundles", "max");
}

function readProductInput(formData: FormData) {
  return {
    nameAr: formData.get("nameAr"),
    nameFr: formData.get("nameFr"),
    descriptionAr: formData.get("descriptionAr") || null,
    descriptionFr: formData.get("descriptionFr") || null,
    categoryId: formData.get("categoryId"),
    price: Number(formData.get("price")),
    discountPrice: formData.get("discountPrice") ? Number(formData.get("discountPrice")) : null,
    stockQty: Number(formData.get("stockQty") ?? 0),
    lowStockThreshold: Number(formData.get("lowStockThreshold") ?? 5),
    allowBackorder: formData.get("allowBackorder") === "on",
    isActive: formData.get("isActive") === "on",
    slug: formData.get("slug"),
    images: readJsonArray(formData, "images"),
    variants: readJsonArray(formData, "variants"),
  };
}

export async function createProductAction(
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await createProduct(readProductInput(formData));
  if (!result.ok) return result;

  await revalidateProducts(result.data.id);
  const locale = await getLocale();
  redirect(`/${locale}/admin/products/${result.data.id}`);
}

export async function updateProductAction(
  id: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await updateProduct(id, readProductInput(formData));
  if (!result.ok) return result;

  await revalidateProducts(id);
  const locale = await getLocale();
  redirect(`/${locale}/admin/products`);
}

export async function deleteProductAction(
  id: string,
  _prev: ServiceResult<null> | null,
): Promise<ServiceResult<null>> {
  const result = await deleteProduct(id);
  if (!result.ok) return result;

  await revalidateProducts();
  const locale = await getLocale();
  redirect(`/${locale}/admin/products`);
}

export type ToggleProductActiveState = ServiceResult<{ deactivatedBundles: DeactivatedBundleRef[] }> | null;

export async function toggleProductActiveAction(
  productId: string,
  nextActive: boolean,
  _prev: ToggleProductActiveState,
  _formData: FormData,
): Promise<ToggleProductActiveState> {
  const result = await toggleProductActive(productId, nextActive);
  if (!result.ok) return result;

  await revalidateProducts(productId);
  return { ok: true, data: { deactivatedBundles: result.data.deactivatedBundles } };
}

/**
 * Returns its result rather than swallowing it. This used to be `void`: a
 * refused permission or a database error left the toggle looking untouched,
 * which is the worst shape a gate can take — correct, and indistinguishable
 * from broken.
 */
export async function toggleVariantActiveAction(
  productId: string,
  variantId: string,
  nextActive: boolean,
): Promise<ServiceResult<null>> {
  const result = await toggleVariantActive(variantId, nextActive);
  if (!result.ok) return result;

  await revalidateProducts(productId);
  return { ok: true, data: null };
}

export type ToggleQuickPickState = ServiceResult<null> | null;

export async function toggleQuickPickAction(
  productId: string,
  nextQuickPick: boolean,
  _prev: ToggleQuickPickState,
  _formData: FormData,
): Promise<ToggleQuickPickState> {
  const result = await toggleQuickPick(productId, nextQuickPick);
  if (!result.ok) return result;

  await revalidateProducts(productId);
  return { ok: true, data: null };
}

export async function reorderQuickPicksAction(orderedIds: string[]): Promise<ServiceResult<null>> {
  const result = await reorderQuickPicks(orderedIds);
  if (!result.ok) return result;

  await revalidateProducts();
  return { ok: true, data: null };
}
