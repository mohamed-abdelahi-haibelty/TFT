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
