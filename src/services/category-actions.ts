"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import type { ServiceResult } from "@/src/lib/errors";
import {
  createCategory,
  deleteCategory,
  reorderCategories,
  updateCategory,
} from "@/src/services/categories";

async function revalidateCategories() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/categories`);
  revalidateTag("categories", "max");
}

function readCategoryInput(formData: FormData) {
  return {
    nameAr: formData.get("nameAr"),
    nameFr: formData.get("nameFr"),
    slug: formData.get("slug"),
  };
}

export async function createCategoryAction(
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await createCategory(readCategoryInput(formData));
  if (!result.ok) return result;

  await revalidateCategories();
  return { ok: true, data: null };
}

export async function updateCategoryAction(
  id: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await updateCategory(id, readCategoryInput(formData));
  if (!result.ok) return result;

  await revalidateCategories();
  return { ok: true, data: null };
}

export async function deleteCategoryAction(
  id: string,
  _prev: ServiceResult<null> | null,
): Promise<ServiceResult<null>> {
  const result = await deleteCategory(id);
  if (!result.ok) return result;

  await revalidateCategories();
  return { ok: true, data: null };
}

export async function reorderCategoriesAction(orderedIds: string[]): Promise<ServiceResult<null>> {
  const result = await reorderCategories(orderedIds);
  if (!result.ok) return result;

  await revalidateCategories();
  return { ok: true, data: null };
}
