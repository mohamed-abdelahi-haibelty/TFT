# Task 07 — Admin: Bundles ("Boxes")

## Goal
Admin composes boxes (e.g. Primary School Box) from products, with own price and images.

## Depends on
Task 05.

## Scope
- Service `bundles.ts` (admin-only mutations).
- `/admin/bundles`: list with derived availability (max sellable = min over items of floor(component stock / qty); backorder components count as available).
- Create/edit: bilingual name/description, price, images, item picker (search products, choose optional variant, qty). Shows computed sum of component prices next to bundle price (informational).
- Deactivating a component product marks dependent bundles inactive with a warning listing them.
- SKU auto (`B-…`), label printable via Task 06 flow.
- Cache tags revalidated.

## Done when
- [x] Bundle with 3 items shows correct derived availability when a component's stock changes.
- [x] Deactivating a component deactivates the bundle and warns.
- [x] Unit test: availability derivation incl. backorder component.
- [x] Build + tests pass.
