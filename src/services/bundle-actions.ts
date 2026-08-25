"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import type { ServiceResult } from "@/src/lib/errors";
import { readJsonArray } from "@/src/lib/form-data";
import { createBundle, deleteBundle, toggleBundleActive, updateBundle } from "@/src/services/bundles";

async function revalidateBundles(bundleId?: string) {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/bundles`);
  if (bundleId) revalidatePath(`/${locale}/admin/bundles/${bundleId}`);
  revalidateTag("bundles", "max");
}

function readBundleInput(formData: FormData) {
  return {
    nameAr: formData.get("nameAr"),
    nameFr: formData.get("nameFr"),
    descriptionAr: formData.get("descriptionAr") || null,
    descriptionFr: formData.get("descriptionFr") || null,
    price: Number(formData.get("price")),
    isActive: formData.get("isActive") === "on",
    slug: formData.get("slug"),
    images: readJsonArray(formData, "images"),
    items: readJsonArray(formData, "items"),
  };
}

export async function createBundleAction(
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await createBundle(readBundleInput(formData));
  if (!result.ok) return result;

  await revalidateBundles(result.data.id);
  const locale = await getLocale();
  redirect(`/${locale}/admin/bundles/${result.data.id}`);
}

export async function updateBundleAction(
  id: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await updateBundle(id, readBundleInput(formData));
  if (!result.ok) return result;

  await revalidateBundles(id);
  const locale = await getLocale();
  redirect(`/${locale}/admin/bundles`);
}

export async function deleteBundleAction(
  id: string,
  _prev: ServiceResult<null> | null,
): Promise<ServiceResult<null>> {
  const result = await deleteBundle(id);
  if (!result.ok) return result;

  await revalidateBundles();
  const locale = await getLocale();
  redirect(`/${locale}/admin/bundles`);
}

export type ToggleBundleActiveState = ServiceResult<null> | null;

export async function toggleBundleActiveAction(
  bundleId: string,
  nextActive: boolean,
  _prev: ToggleBundleActiveState,
  _formData: FormData,
): Promise<ToggleBundleActiveState> {
  const result = await toggleBundleActive(bundleId, nextActive);
  if (!result.ok) return result;

  await revalidateBundles(bundleId);
  return { ok: true, data: null };
}
