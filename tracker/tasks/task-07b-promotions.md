# Task 07b — Promotions Engine + Admin Campaigns

## Goal
Timed, channel-scoped discount campaigns (Udemy-style flash sales) with one authoritative pricing function used by storefront, checkout, and POS.

## Depends on
Task 07. Run before Task 08 so all storefront/POS tasks build on effective pricing.

## Scope

### Pricing service (`src/services/pricing.ts`)
- `getEffectivePrice(item, channel, now)` for products, variants, bundles. Rule, no stacking:
  1. Active promo covering the item for this channel (`is_active` AND `starts_at ≤ now < ends_at` AND channel matches or `both`) → price computed from **base** price (`percent`: round to whole MRU; `fixed`: base − value, floor 0... reject at creation if value ≥ base of any covered item).
  2. Else `discount_price` if set.
  3. Else base price.
- If several promos cover one item, the cheapest resulting price wins.
- Returns `{ price, base, promo?: { name, ends_at } }` so UIs can render strike-through + countdown.
- All price display and all charging anywhere in the app MUST go through this function (add as invariant in `architecture.md`; update that file in this task).

### Admin (`/admin/promotions`, admin only; staff read-only list)
- List with computed status badge: scheduled / active (with remaining time) / ended / disabled; filter by status.
- Create/edit: bilingual name, kind + value, start/end datetime pickers (stored UTC, entered in local time), channel (`web` / `pos` / `both`), item picker (products/bundles, search + category filter, "add whole category" convenience that expands to current products).
- Validation: end > start; percent 1–90; fixed value < base price of every covered item (`CONFLICT` naming violators).
- Edit allowed anytime (including while active); disable = immediate stop. Ended promos are kept for history, not deletable once started (audit).
- Storefront cache tags revalidated on promo create/update/disable.

### Cache correctness
- Storefront pages remain tag-cached but pages rendering any promo-covered item also get time-based revalidation ≤ 300 s, so start/expiry appears within minutes without a mutation. Charging is always exact regardless (server repricing at order time).

## Out of scope
Coupon codes, per-customer discounts, stacking, scheduled price changes to base prices. Storefront display of promos (Tasks 09/10), checkout application (Task 11), POS application (Task 14).

## Done when
- [ ] Unit tests on `getEffectivePrice`: promo vs discount_price precedence, channel filtering, boundary times (starts_at inclusive, ends_at exclusive), percent rounding, overlapping promos → cheapest, fixed ≥ base rejected at creation.
- [ ] Admin creates a 2-day `both` promo on 3 products; list shows it scheduled, then active with remaining time (simulated clock).
- [ ] Disabling an active promo removes its pricing effect on next evaluation.
- [ ] `architecture.md` updated with the pricing invariant; build + tests pass.
