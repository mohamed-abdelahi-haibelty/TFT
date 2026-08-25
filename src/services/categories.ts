import { asc, count, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/src/db/client";
import { categories, products } from "@/src/db/schema";
import { isUniqueViolation } from "@/src/lib/db-errors";
import type { ServiceResult } from "@/src/lib/errors";
import { slugify } from "@/src/lib/slug";
import { requirePermission } from "@/src/services/authz";

export type CategoryListItem = {
  id: string;
  nameAr: string;
  nameFr: string;
  slug: string;
  sort: number;
};

export type CategoryMessages = {
  invalidInput: string;
  slugTaken: string;
};

export async function listCategories(): Promise<ServiceResult<CategoryListItem[]>> {
  const auth = await requirePermission("catalog.view");
  if (!auth.ok) return auth;

  const rows = await db
    .select({
      id: categories.id,
      nameAr: categories.nameAr,
      nameFr: categories.nameFr,
      slug: categories.slug,
      sort: categories.sort,
    })
    .from(categories)
    .orderBy(asc(categories.sort), asc(categories.createdAt));

  return { ok: true, data: rows };
}

const categoryInputSchema = z.object({
  nameAr: z.string().trim().min(1).max(120),
  nameFr: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80),
});

async function resolveUniqueSlug(
  requestedSlug: string,
  nameFr: string,
  excludeId?: string,
): Promise<string | null> {
  const base = slugify(requestedSlug) || slugify(nameFr);
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, base))
    .limit(1);

  if (existing && existing.id !== excludeId) return null;
  return base;
}

export async function createCategory(
  input: unknown,
): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("categoryErrors");
  return createCategoryCore(input, {
    invalidInput: t("invalidInput"),
    slugTaken: t("slugTaken"),
  });
}

export async function createCategoryCore(
  input: unknown,
  messages: CategoryMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  const slug = await resolveUniqueSlug(parsed.data.slug, parsed.data.nameFr);
  if (!slug) {
    return { ok: false, error: { code: "CONFLICT", message: messages.slugTaken } };
  }

  const [{ value: nextSort }] = await db.select({ value: count() }).from(categories);

  try {
    const [created] = await db
      .insert(categories)
      .values({
        nameAr: parsed.data.nameAr,
        nameFr: parsed.data.nameFr,
        slug,
        sort: nextSort,
      })
      .returning({ id: categories.id });

    return { ok: true, data: { id: created.id } };
  } catch (error) {
    // Check-then-insert is not atomic; see `createProductCore`.
    if (isUniqueViolation(error, "categories_slug_unique")) {
      return { ok: false, error: { code: "CONFLICT", message: messages.slugTaken } };
    }
    throw error;
  }
}

export async function updateCategory(
  id: string,
  input: unknown,
): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("categoryErrors");
  return updateCategoryCore(id, input, {
    invalidInput: t("invalidInput"),
    slugTaken: t("slugTaken"),
  });
}

export async function updateCategoryCore(
  id: string,
  input: unknown,
  messages: CategoryMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  const slug = await resolveUniqueSlug(parsed.data.slug, parsed.data.nameFr, id);
  if (!slug) {
    return { ok: false, error: { code: "CONFLICT", message: messages.slugTaken } };
  }

  try {
    await db
      .update(categories)
      .set({ nameAr: parsed.data.nameAr, nameFr: parsed.data.nameFr, slug })
      .where(eq(categories.id, id));
  } catch (error) {
    if (isUniqueViolation(error, "categories_slug_unique")) {
      return { ok: false, error: { code: "CONFLICT", message: messages.slugTaken } };
    }
    throw error;
  }

  return { ok: true, data: { id } };
}

export async function reorderCategories(
  orderedIds: string[],
): Promise<ServiceResult<null>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  await Promise.all(
    orderedIds.map((id, index) => db.update(categories).set({ sort: index }).where(eq(categories.id, id))),
  );

  return { ok: true, data: null };
}

export type DeleteCategoryMessages = { hasProducts: string };

export async function deleteCategory(id: string): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("categoryErrors");
  return deleteCategoryCore(id, { hasProducts: t("hasProducts") });
}

export async function deleteCategoryCore(
  id: string,
  messages: DeleteCategoryMessages,
): Promise<ServiceResult<{ id: string }>> {
  const [productInCategory] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, id))
    .limit(1);

  if (productInCategory) {
    return { ok: false, error: { code: "CONFLICT", message: messages.hasProducts } };
  }

  await db.delete(categories).where(eq(categories.id, id));

  return { ok: true, data: { id } };
}
