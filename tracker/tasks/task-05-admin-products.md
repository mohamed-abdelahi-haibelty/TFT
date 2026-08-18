# Task 05 — Admin: Categories + Products

## Goal
Full product management: categories, products with images, variants, discounts, backorder.

## Depends on
Task 04.

## Scope
- Services: `categories.ts`, `products.ts` (all mutations here; role checks: staff read-only).
- `/admin/categories`: list, create, edit, reorder, delete (blocked if products exist → `CONFLICT`).
- `/admin/products`: list with search, category filter, active filter, stock column with low-stock indicator.
- Product create/edit form: bilingual names/descriptions, category, price, optional discount price (must be < price), stock qty, low-stock threshold, backorder toggle, active toggle, images (Task 04 uploader), slug auto from French name (editable, unique).
- Variants section on the form: add/edit/deactivate variants (bilingual name, optional color, optional own stock, own images). SKU auto-assigned for product and each variant.
- Direct stock edits from this form are disallowed after creation — stock changes go through inventory (Task 15); creation sets initial stock and writes a `restock` movement.
- Storefront cache tags revalidated on every mutation.

## Done when
- [x] Admin creates a product with 2 variants and 3 images; staff sees it read-only (no edit affordances, mutations rejected server-side).
- [x] Discount ≥ price is rejected with a field error.
- [x] Duplicate slug/SKU → `CONFLICT` with localized message.
- [x] Initial stock creates a matching `stock_movements` row.
- [x] Integration test: staff calling the update service → `FORBIDDEN`.
- [x] Build + tests pass.
