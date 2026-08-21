import { and, eq, gt, lte, or } from "drizzle-orm";
import { db } from "@/src/db/client";
import { promotionItems, promotions } from "@/src/db/schema";

export type PricingChannel = "web" | "pos";

/**
 * A variant carries no price of its own (see `bundles.ts`'s own convention)
 * and `promotion_items` only ever names a product or a bundle — so a variant
 * is priced by passing its parent product's id/price/discountPrice here.
 */
export type PricingItem =
  | { kind: "product"; id: string; price: number; discountPrice: number | null }
  | { kind: "bundle"; id: string; price: number };

export type EffectivePrice = {
  price: number;
  base: number;
  promo?: { nameAr: string; nameFr: string; endsAt: Date };
};

/** Pure promo-price math, split out so rounding/floor rules are unit-testable without a database. */
export function computePromoPrice(kind: "percent" | "fixed", value: number, base: number): number {
  if (kind === "percent") return Math.round((base * (100 - value)) / 100);
  return Math.max(base - value, 0);
}

async function activePromosCoveringItem(item: PricingItem, channel: PricingChannel, now: Date) {
  const itemMatch =
    item.kind === "product" ? eq(promotionItems.productId, item.id) : eq(promotionItems.bundleId, item.id);

  return db
    .select({
      nameAr: promotions.nameAr,
      nameFr: promotions.nameFr,
      kind: promotions.kind,
      value: promotions.value,
      endsAt: promotions.endsAt,
    })
    .from(promotionItems)
    .innerJoin(promotions, eq(promotionItems.promotionId, promotions.id))
    .where(
      and(
        itemMatch,
        eq(promotions.isActive, true),
        lte(promotions.startsAt, now),
        gt(promotions.endsAt, now),
        or(eq(promotions.channel, channel), eq(promotions.channel, "both")),
      ),
    );
}

/**
 * The one authoritative pricing function (invariant #11 in architecture.md):
 * every price shown or charged, on storefront, checkout, or POS, must come
 * from here. Precedence, no stacking: an active promo for this channel wins
 * outright over `discount_price`; several covering promos resolve to the
 * cheapest. `starts_at` is inclusive, `ends_at` exclusive.
 */
export async function getEffectivePrice(
  item: PricingItem,
  channel: PricingChannel,
  now: Date,
): Promise<EffectivePrice> {
  const base = item.price;
  const promos = await activePromosCoveringItem(item, channel, now);

  if (promos.length > 0) {
    const cheapest = promos.reduce<{ promo: (typeof promos)[number]; price: number } | null>((best, promo) => {
      const price = computePromoPrice(promo.kind, promo.value, base);
      return !best || price < best.price ? { promo, price } : best;
    }, null);

    if (cheapest) {
      return {
        price: cheapest.price,
        base,
        promo: { nameAr: cheapest.promo.nameAr, nameFr: cheapest.promo.nameFr, endsAt: cheapest.promo.endsAt },
      };
    }
  }

  const discountPrice = item.kind === "product" ? item.discountPrice : null;
  if (discountPrice != null) return { price: discountPrice, base };

  return { price: base, base };
}

/**
 * Batched sibling of `getEffectivePrice`, keyed by item id, for surfaces
 * pricing many items at once (the POS catalog grid). One query for every
 * currently-active promotion of this channel, not one per item — active
 * promotions are few regardless of catalog size, so this stays a single
 * round trip whether the catalog has 20 products or 500.
 */
export async function getEffectivePrices(
  items: PricingItem[],
  channel: PricingChannel,
  now: Date,
): Promise<Map<string, EffectivePrice>> {
  const promoRows = await db
    .select({
      productId: promotionItems.productId,
      bundleId: promotionItems.bundleId,
      nameAr: promotions.nameAr,
      nameFr: promotions.nameFr,
      kind: promotions.kind,
      value: promotions.value,
      endsAt: promotions.endsAt,
    })
    .from(promotionItems)
    .innerJoin(promotions, eq(promotionItems.promotionId, promotions.id))
    .where(
      and(
        eq(promotions.isActive, true),
        lte(promotions.startsAt, now),
        gt(promotions.endsAt, now),
        or(eq(promotions.channel, channel), eq(promotions.channel, "both")),
      ),
    );

  const promosByItemId = new Map<string, (typeof promoRows)[number][]>();
  for (const row of promoRows) {
    const key = row.productId ?? row.bundleId;
    if (!key) continue;
    const list = promosByItemId.get(key) ?? [];
    list.push(row);
    promosByItemId.set(key, list);
  }

  const result = new Map<string, EffectivePrice>();
  for (const item of items) {
    const base = item.price;
    const promos = promosByItemId.get(item.id) ?? [];
    const cheapest = promos.reduce<{ promo: (typeof promos)[number]; price: number } | null>((best, promo) => {
      const price = computePromoPrice(promo.kind, promo.value, base);
      return !best || price < best.price ? { promo, price } : best;
    }, null);

    if (cheapest) {
      result.set(item.id, {
        price: cheapest.price,
        base,
        promo: { nameAr: cheapest.promo.nameAr, nameFr: cheapest.promo.nameFr, endsAt: cheapest.promo.endsAt },
      });
      continue;
    }

    const discountPrice = item.kind === "product" ? item.discountPrice : null;
    result.set(item.id, discountPrice != null ? { price: discountPrice, base } : { price: base, base });
  }

  return result;
}
