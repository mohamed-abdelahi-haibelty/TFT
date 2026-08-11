# Task 09 — Storefront: Catalog + Product Page

## Goal
Browsable, filterable catalog and a complete product detail page.

## Depends on
Task 08.

## Scope
- `/[locale]/catalog` (+ `/catalog/[categorySlug]`): grid of active products; filters: category, price range, in-stock only; text search (matches ar + fr names); sort: newest, price asc/desc. Filters live in URL search params (shareable, back-button-safe); server-rendered results.
- Product card: image, name, price with discount strike-through when discounted, stock badge (in stock / out of stock / out of stock–orderable when backorder).
- `/[locale]/product/[slug]`: swipeable multi-image gallery with thumbnails; variant selector (shows variant images + variant stock when selected); quantity stepper bounded by available stock unless backorder; price incl. discount; description; add-to-cart button (cart itself is Task 11 — for now clicking stores the selection in the cart module's API and shows count in header).
- Out-of-stock non-backorder: quantity + add disabled with stock badge explaining.
- `generateMetadata` per product; JSON-LD `Product` with price/availability.
- 404 for unknown/inactive slugs.

## Done when
- [ ] Filters + search combine correctly and survive reload via URL.
- [ ] Variant selection switches images, price display, and stock badge.
- [ ] Backorder product shows orderable state at 0 stock; normal product does not.
- [ ] Lighthouse mobile on catalog + product ≥ 90/95/95.
- [ ] Build + tests pass.
