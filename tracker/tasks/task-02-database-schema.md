# Task 02 — Database Schema + Seed

## Goal
Complete Drizzle schema, first migration, and seed script.

## Depends on
Task 01.

## Scope
Tables (all UUID PKs, `created_at`/`updated_at` timestamptz; money = integer MRU):

- `users` — Better Auth tables + `role` enum(`admin`,`staff`).
- `categories` — `name_ar`, `name_fr`, `slug` (unique), `sort`.
- `products` — `name_ar`, `name_fr`, `description_ar`, `description_fr`, `slug` (unique), `category_id` FK, `price`, `discount_price` nullable, `sku` (unique, auto `P-000001`), `stock_qty` int ≥ 0, `low_stock_threshold` int default 5, `allow_backorder` bool, `is_active` bool, `is_quick_pick` bool default false, `quick_pick_sort` int nullable (POS quick-pick grid membership + order).
- `product_images` — `product_id` FK cascade, `public_id`, `sort`.
- `product_variants` — `product_id` FK cascade, `name_ar`, `name_fr`, `color_hex` nullable, `sku` (unique), `stock_qty` nullable (null = use product stock), `is_active`.
- `variant_images` — `variant_id` FK cascade, `public_id`, `sort`.
- `bundles` — `name_ar/fr`, `description_ar/fr`, `slug` (unique), `price`, `sku` (unique, `B-000001`), `is_active`.
- `bundle_images` — `bundle_id` FK cascade, `public_id`, `sort`.
- `bundle_items` — `bundle_id` FK, `product_id` FK, `variant_id` nullable FK, `qty` ≥ 1.
- `orders` — `code` (unique, `PPT-YYMM-NNN`), `source` enum(`web`,`pos`), `status` enum(`pending`,`confirmed`,`preparing`,`shipped`,`arrived`,`ready`,`delivered`,`cancelled`,`voided`), `customer_name` nullable, `customer_phone` nullable, `city` enum(`ndb`,`nkc`,`other`) nullable, `delivery` enum(`pickup`,`bus`) nullable, `bus_company` nullable, `bus_note` nullable, `payment_method` enum(`cash`,`bankily`,`masrvi`,`sedad`,`other`) nullable, `subtotal`, `discount_total`, `total`, `note` nullable, `created_by` nullable FK users (POS/staff-created).
- `order_items` — `order_id` FK cascade, `product_id` nullable FK, `variant_id` nullable FK, `bundle_id` nullable FK, `name_snapshot`, `unit_price`, `qty`; exactly one of product/bundle set (check constraint).
- `order_events` — `order_id` FK cascade, `actor_id` nullable FK users (null = customer/system), `type` enum(`created`,`status_changed`,`items_edited`,`line_removed`,`cancelled`,`voided`,`note_added`), `payload` jsonb, `created_at`.
- `promotions` — `name_ar`, `name_fr`, `kind` enum(`percent`,`fixed`), `value` int (percent 1–90 or MRU amount), `starts_at` timestamptz, `ends_at` timestamptz (> starts_at, check), `channel` enum(`web`,`pos`,`both`), `is_active` bool.
- `promotion_items` — `promotion_id` FK cascade, `product_id` nullable FK, `bundle_id` nullable FK; exactly one set (check); unique (promotion, item).
- `stock_movements` — `product_id` FK, `variant_id` nullable FK, `delta` int (±), `reason` enum(`web_sale`,`pos_sale`,`cancel_restock`,`void_restock`,`manual_adjust`,`restock`,`correction`), `order_id` nullable FK, `actor_id` nullable FK, `note` nullable, `created_at`.

Indexes: `orders(status)`, `orders(code)`, `orders(created_at)`, `products(category_id)`, `products(is_active)`, `stock_movements(product_id, created_at)`, `order_events(order_id)`, `promotions(ends_at)`, `promotion_items(product_id)`, `promotion_items(bundle_id)`.

Seed script (`npm run db:seed`): admin user from `SEED_ADMIN_*` env, 3 categories, 6 products with images placeholders, 1 bundle. Idempotent.

## Done when
- [ ] `drizzle-kit` migration generates and applies cleanly to a Neon dev branch.
- [ ] Seed runs twice without duplicates.
- [ ] Unit test: check constraint rejects an order_item with both product and bundle set (or neither).
- [ ] Build + tests pass.
