import { and, asc, count, desc, eq, gt, ilike, inArray, or } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/src/db/client";
import { bundles, categories, products, promotionItems, promotions } from "@/src/db/schema";
import type { ServiceResult } from "@/src/lib/errors";
import { computePromotionStatus, type PromotionStatus } from "@/src/lib/promotion-status";
import { containsTerm } from "@/src/lib/search";
import { requirePermission } from "@/src/services/authz";

export { computePromotionStatus, type PromotionStatus } from "@/src/lib/promotion-status";

export type PromotionListItem = {
  id: string;
  nameAr: string;
  nameFr: string;
  kind: "percent" | "fixed";
  value: number;
  startsAt: Date;
  endsAt: Date;
  channel: "web" | "pos" | "both";
  isActive: boolean;
  status: PromotionStatus;
  itemCount: number;
};

export type PromotionItemRef = {
  kind: "product" | "bundle";
  id: string;
  nameAr: string;
  nameFr: string;
  sku: string;
  price: number;
};

export type PromotionDetail = PromotionListItem & { items: PromotionItemRef[] };

export type PromotionMessages = {
  invalidInput: string;
  fixedExceedsBase: (names: string) => string;
};

const PROMOTION_SELECT = {
  id: promotions.id,
  nameAr: promotions.nameAr,
  nameFr: promotions.nameFr,
  kind: promotions.kind,
  value: promotions.value,
  startsAt: promotions.startsAt,
  endsAt: promotions.endsAt,
  channel: promotions.channel,
  isActive: promotions.isActive,
};

async function countItemsByPromotion(promotionIds: string[]): Promise<Map<string, number>> {
  if (!promotionIds.length) return new Map();

  const rows = await db
    .select({ promotionId: promotionItems.promotionId, itemCount: count() })
    .from(promotionItems)
    .where(inArray(promotionItems.promotionId, promotionIds))
    .groupBy(promotionItems.promotionId);

  return new Map(rows.map((row) => [row.promotionId, Number(row.itemCount)]));
}

export async function listPromotions(filters: {
  search?: string;
  status?: PromotionStatus;
}): Promise<ServiceResult<PromotionListItem[]>> {
  const auth = await requirePermission("promotions.manage");
  if (!auth.ok) return auth;

  return { ok: true, data: await listPromotionsCore(filters, new Date()) };
}

export async function listPromotionsCore(
  filters: { search?: string; status?: PromotionStatus },
  now: Date,
): Promise<PromotionListItem[]> {
  const conditions = [];
  const term = containsTerm(filters.search);
  if (term) {
    conditions.push(or(ilike(promotions.nameFr, term), ilike(promotions.nameAr, term)));
  }

  const rows = await db
    .select(PROMOTION_SELECT)
    .from(promotions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(promotions.createdAt));

  const itemCounts = await countItemsByPromotion(rows.map((row) => row.id));

  const withStatus = rows.map((row) => ({
    ...row,
    status: computePromotionStatus(row, now),
    itemCount: itemCounts.get(row.id) ?? 0,
  }));

  return filters.status ? withStatus.filter((row) => row.status === filters.status) : withStatus;
}

export async function getPromotion(id: string): Promise<ServiceResult<PromotionDetail>> {
  const auth = await requirePermission("promotions.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("promotionErrors");
  return getPromotionCore(id, { notFound: t("notFound") }, new Date());
}

export async function getPromotionCore(
  id: string,
  messages: { notFound: string },
  now: Date,
): Promise<ServiceResult<PromotionDetail>> {
  const [row] = await db
    .select(PROMOTION_SELECT)
    .from(promotions)
    .where(eq(promotions.id, id))
    .limit(1);

  if (!row) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };

  const itemRows = await db
    .select({
      productId: promotionItems.productId,
      bundleId: promotionItems.bundleId,
      productNameAr: products.nameAr,
      productNameFr: products.nameFr,
      productSku: products.sku,
      productPrice: products.price,
      bundleNameAr: bundles.nameAr,
      bundleNameFr: bundles.nameFr,
      bundleSku: bundles.sku,
      bundlePrice: bundles.price,
    })
    .from(promotionItems)
    .leftJoin(products, eq(promotionItems.productId, products.id))
    .leftJoin(bundles, eq(promotionItems.bundleId, bundles.id))
    .where(eq(promotionItems.promotionId, id));

  const items: PromotionItemRef[] = itemRows.map((item) =>
    item.productId
      ? {
          kind: "product" as const,
          id: item.productId,
          nameAr: item.productNameAr!,
          nameFr: item.productNameFr!,
          sku: item.productSku!,
          price: item.productPrice!,
        }
      : {
          kind: "bundle" as const,
          id: item.bundleId!,
          nameAr: item.bundleNameAr!,
          nameFr: item.bundleNameFr!,
          sku: item.bundleSku!,
          price: item.bundlePrice!,
        },
  );

  return {
    ok: true,
    data: { ...row, status: computePromotionStatus(row, now), itemCount: items.length, items },
  };
}

const promotionBaseSchema = z
  .object({
    nameAr: z.string().trim().min(1).max(200),
    nameFr: z.string().trim().min(1).max(200),
    kind: z.enum(["percent", "fixed"]),
    value: z.number().int().positive(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    channel: z.enum(["web", "pos", "both"]),
    isActive: z.boolean(),
    productIds: z.array(z.string().uuid()).default([]),
    bundleIds: z.array(z.string().uuid()).default([]),
  })
  .refine((data) => data.endsAt > data.startsAt, { path: ["endsAt"] })
  .refine((data) => data.kind !== "percent" || (data.value >= 1 && data.value <= 90), { path: ["value"] })
  .refine((data) => data.productIds.length + data.bundleIds.length > 0, { path: ["productIds"] });

type PromotionInput = z.infer<typeof promotionBaseSchema>;

/** Loads price/name rows for every requested product and bundle id, doubling as an existence check. */
async function loadCoveredItems(productIds: string[], bundleIds: string[]) {
  const productRows = productIds.length
    ? await db
        .select({ id: products.id, nameAr: products.nameAr, nameFr: products.nameFr, price: products.price })
        .from(products)
        .where(inArray(products.id, productIds))
    : [];
  const bundleRows = bundleIds.length
    ? await db
        .select({ id: bundles.id, nameAr: bundles.nameAr, nameFr: bundles.nameFr, price: bundles.price })
        .from(bundles)
        .where(inArray(bundles.id, bundleIds))
    : [];

  return { productRows, bundleRows };
}

async function resolveCoveredItemsOrError(
  data: PromotionInput,
  messages: PromotionMessages,
): Promise<
  | { ok: true; productRows: { id: string; nameFr: string; price: number }[]; bundleRows: { id: string; nameFr: string; price: number }[] }
  | { ok: false; error: { code: "VALIDATION" | "CONFLICT"; message: string } }
> {
  const { productRows, bundleRows } = await loadCoveredItems(data.productIds, data.bundleIds);

  if (productRows.length !== data.productIds.length || bundleRows.length !== data.bundleIds.length) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  if (data.kind === "fixed") {
    const violators = [...productRows, ...bundleRows].filter((row) => data.value >= row.price);
    if (violators.length) {
      return {
        ok: false,
        error: { code: "CONFLICT", message: messages.fixedExceedsBase(violators.map((v) => v.nameFr).join(", ")) },
      };
    }
  }

  return { ok: true, productRows, bundleRows };
}

export async function createPromotion(input: unknown): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("promotions.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("promotionErrors");
  return createPromotionCore(input, {
    invalidInput: t("invalidInput"),
    fixedExceedsBase: (names: string) => t("fixedExceedsBase", { names }),
  });
}

export async function createPromotionCore(
  input: unknown,
  messages: PromotionMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = promotionBaseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  const resolved = await resolveCoveredItemsOrError(parsed.data, messages);
  if (!resolved.ok) return resolved;

  const [created] = await db
    .insert(promotions)
    .values({
      nameAr: parsed.data.nameAr,
      nameFr: parsed.data.nameFr,
      kind: parsed.data.kind,
      value: parsed.data.value,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      channel: parsed.data.channel,
      isActive: parsed.data.isActive,
    })
    .returning({ id: promotions.id });

  await insertPromotionItems(created.id, resolved.productRows, resolved.bundleRows);

  return { ok: true, data: { id: created.id } };
}

async function insertPromotionItems(
  promotionId: string,
  productRows: { id: string }[],
  bundleRows: { id: string }[],
) {
  const rows = [
    ...productRows.map((row) => ({ promotionId, productId: row.id, bundleId: null })),
    ...bundleRows.map((row) => ({ promotionId, productId: null, bundleId: row.id })),
  ];
  if (rows.length) await db.insert(promotionItems).values(rows);
}

export async function updatePromotion(id: string, input: unknown): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("promotions.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("promotionErrors");
  return updatePromotionCore(id, input, {
    invalidInput: t("invalidInput"),
    fixedExceedsBase: (names: string) => t("fixedExceedsBase", { names }),
  });
}

export async function updatePromotionCore(
  id: string,
  input: unknown,
  messages: PromotionMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = promotionBaseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  const resolved = await resolveCoveredItemsOrError(parsed.data, messages);
  if (!resolved.ok) return resolved;

  await db
    .update(promotions)
    .set({
      nameAr: parsed.data.nameAr,
      nameFr: parsed.data.nameFr,
      kind: parsed.data.kind,
      value: parsed.data.value,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      channel: parsed.data.channel,
      isActive: parsed.data.isActive,
    })
    .where(eq(promotions.id, id));

  // Same rationale as bundle items: no independent identity worth diffing,
  // replace the covered-item set wholesale.
  await db.delete(promotionItems).where(eq(promotionItems.promotionId, id));
  await insertPromotionItems(id, resolved.productRows, resolved.bundleRows);

  return { ok: true, data: { id } };
}

export async function togglePromotionActive(id: string, isActive: boolean): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("promotions.manage");
  if (!auth.ok) return auth;

  return togglePromotionActiveCore(id, isActive);
}

export async function togglePromotionActiveCore(id: string, isActive: boolean): Promise<ServiceResult<{ id: string }>> {
  await db.update(promotions).set({ isActive }).where(eq(promotions.id, id));
  return { ok: true, data: { id } };
}

/**
 * The largest `fixed` discount currently covering `productId` among live
 * promotions — what a new price has to stay above, so lowering a price can't
 * leave a standing promotion resolving that item to nothing.
 * `null` when no fixed promotion covers it.
 */
export async function maxFixedDiscountForProduct(productId: string, now: Date = new Date()): Promise<number | null> {
  const rows = await db
    .select({ value: promotions.value })
    .from(promotionItems)
    .innerJoin(promotions, eq(promotionItems.promotionId, promotions.id))
    .where(
      and(
        eq(promotionItems.productId, productId),
        eq(promotions.kind, "fixed"),
        eq(promotions.isActive, true),
        gt(promotions.endsAt, now),
      ),
    );

  if (!rows.length) return null;
  return Math.max(...rows.map((row) => row.value));
}

export type PromotionPickerCategory = { id: string; nameAr: string; nameFr: string };
export type PromotionPickerProduct = {
  id: string;
  nameAr: string;
  nameFr: string;
  sku: string;
  price: number;
  categoryId: string;
  categoryNameAr: string;
  categoryNameFr: string;
};
export type PromotionPickerBundle = { id: string; nameAr: string; nameFr: string; sku: string; price: number };

/** Source data for the item picker: every active category, product, and bundle — client-side search + "add whole category" run against this. */
export async function listPromotionPickerData(): Promise<
  ServiceResult<{
    categories: PromotionPickerCategory[];
    products: PromotionPickerProduct[];
    bundles: PromotionPickerBundle[];
  }>
> {
  const auth = await requirePermission("promotions.manage");
  if (!auth.ok) return auth;

  const [categoryRows, productRows, bundleRows] = await Promise.all([
    db
      .select({ id: categories.id, nameAr: categories.nameAr, nameFr: categories.nameFr })
      .from(categories)
      .orderBy(asc(categories.sort)),
    db
      .select({
        id: products.id,
        nameAr: products.nameAr,
        nameFr: products.nameFr,
        sku: products.sku,
        price: products.price,
        categoryId: products.categoryId,
        categoryNameAr: categories.nameAr,
        categoryNameFr: categories.nameFr,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.isActive, true))
      .orderBy(asc(products.nameFr)),
    db
      .select({ id: bundles.id, nameAr: bundles.nameAr, nameFr: bundles.nameFr, sku: bundles.sku, price: bundles.price })
      .from(bundles)
      .where(eq(bundles.isActive, true))
      .orderBy(asc(bundles.nameFr)),
  ]);

  return { ok: true, data: { categories: categoryRows, products: productRows, bundles: bundleRows } };
}
