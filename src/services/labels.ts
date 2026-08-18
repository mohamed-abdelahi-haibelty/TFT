import { and, asc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/src/db/client";
import {
  bundles,
  categories,
  labelSheetSelections,
  productVariants,
  products,
  type LabelSheetItem,
} from "@/src/db/schema";
import type { ServiceResult } from "@/src/lib/errors";
import { requirePermission } from "@/src/services/authz";

export type BundleLabelData = {
  id: string;
  nameAr: string;
  nameFr: string;
  sku: string;
  price: number;
  isActive: boolean;
};

export type LabelMessages = {
  notFound: string;
  invalidSelection: string;
};

export async function getBundleLabelData(id: string): Promise<ServiceResult<BundleLabelData>> {
  const auth = await requirePermission("labels.print");
  if (!auth.ok) return auth;

  const t = await getTranslations("labelErrors");
  return getBundleLabelDataCore(id, { notFound: t("notFound") });
}

export async function getBundleLabelDataCore(
  id: string,
  messages: Pick<LabelMessages, "notFound">,
): Promise<ServiceResult<BundleLabelData>> {
  const [bundle] = await db
    .select({
      id: bundles.id,
      nameAr: bundles.nameAr,
      nameFr: bundles.nameFr,
      sku: bundles.sku,
      price: bundles.price,
      isActive: bundles.isActive,
    })
    .from(bundles)
    .where(eq(bundles.id, id))
    .limit(1);

  if (!bundle) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
  return { ok: true, data: bundle };
}

export type LabelPickerItem = {
  type: "product" | "variant" | "bundle";
  id: string;
  sku: string;
  nameAr: string;
  nameFr: string;
  price: number;
  categoryId: string | null;
  categoryNameFr: string | null;
};

/** Every active, sellable product/variant/bundle — source list for the counter sheet's client-side search/filter picker. */
export async function listLabelItems(): Promise<ServiceResult<LabelPickerItem[]>> {
  const auth = await requirePermission("labels.print");
  if (!auth.ok) return auth;

  return { ok: true, data: await listLabelItemsCore() };
}

export async function listLabelItemsCore(): Promise<LabelPickerItem[]> {
  const productRows = await db
    .select({
      id: products.id,
      sku: products.sku,
      nameAr: products.nameAr,
      nameFr: products.nameFr,
      price: products.price,
      discountPrice: products.discountPrice,
      categoryId: products.categoryId,
      categoryNameFr: categories.nameFr,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.isActive, true))
    .orderBy(asc(products.nameFr));

  const variantRows = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      nameAr: productVariants.nameAr,
      nameFr: productVariants.nameFr,
      productNameAr: products.nameAr,
      productNameFr: products.nameFr,
      price: products.price,
      discountPrice: products.discountPrice,
      categoryId: products.categoryId,
      categoryNameFr: categories.nameFr,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(productVariants.isActive, true), eq(products.isActive, true)))
    .orderBy(asc(products.nameFr));

  const bundleRows = await db
    .select({
      id: bundles.id,
      sku: bundles.sku,
      nameAr: bundles.nameAr,
      nameFr: bundles.nameFr,
      price: bundles.price,
    })
    .from(bundles)
    .where(eq(bundles.isActive, true))
    .orderBy(asc(bundles.nameFr));

  return [
    ...productRows.map((p) => ({
      type: "product" as const,
      id: p.id,
      sku: p.sku,
      nameAr: p.nameAr,
      nameFr: p.nameFr,
      price: p.discountPrice ?? p.price,
      categoryId: p.categoryId,
      categoryNameFr: p.categoryNameFr,
    })),
    ...variantRows.map((v) => ({
      type: "variant" as const,
      id: v.id,
      sku: v.sku,
      nameAr: `${v.productNameAr} — ${v.nameAr}`,
      nameFr: `${v.productNameFr} — ${v.nameFr}`,
      price: v.discountPrice ?? v.price,
      categoryId: v.categoryId,
      categoryNameFr: v.categoryNameFr,
    })),
    ...bundleRows.map((b) => ({
      type: "bundle" as const,
      id: b.id,
      sku: b.sku,
      nameAr: b.nameAr,
      nameFr: b.nameFr,
      price: b.price,
      categoryId: null,
      categoryNameFr: null,
    })),
  ];
}

export async function getLabelSheetSelection(): Promise<ServiceResult<LabelSheetItem[]>> {
  const auth = await requirePermission("labels.print");
  if (!auth.ok) return auth;

  return { ok: true, data: await getLabelSheetSelectionCore(auth.data.id) };
}

export async function getLabelSheetSelectionCore(userId: string): Promise<LabelSheetItem[]> {
  const [row] = await db
    .select({ items: labelSheetSelections.items })
    .from(labelSheetSelections)
    .where(eq(labelSheetSelections.userId, userId))
    .limit(1);

  return row?.items ?? [];
}

const sheetItemSchema = z.object({
  type: z.enum(["product", "variant", "bundle"]),
  id: z.string().uuid(),
});

export async function saveLabelSheetSelection(input: unknown): Promise<ServiceResult<null>> {
  const auth = await requirePermission("labels.print");
  if (!auth.ok) return auth;

  const t = await getTranslations("labelErrors");
  return saveLabelSheetSelectionCore(input, auth.data.id, { invalidSelection: t("invalidSelection") });
}

export async function saveLabelSheetSelectionCore(
  input: unknown,
  userId: string,
  messages: Pick<LabelMessages, "invalidSelection">,
): Promise<ServiceResult<null>> {
  const parsed = z.array(sheetItemSchema).max(1000).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidSelection } };
  }

  await db
    .insert(labelSheetSelections)
    .values({ userId, items: parsed.data })
    .onConflictDoUpdate({
      target: labelSheetSelections.userId,
      set: { items: parsed.data, updatedAt: new Date() },
    });

  return { ok: true, data: null };
}
