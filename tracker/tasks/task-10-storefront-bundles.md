# Task 10 — Storefront: Bundle Pages

## Goal
Customers can browse boxes and see what's inside and what they save.

## Depends on
Task 09.

## Scope
- `/[locale]/boxes`: grid of active bundles (image, name, price, availability badge).
- `/[locale]/boxes/[slug]`: gallery, description, contents list (item name, qty, link to product), effective bundle price (pricing service, channel `web`, with strike-through + promo countdown when applicable) + "you save X MRU" when sum of component prices exceeds the effective bundle price (hidden otherwise), quantity bounded by derived availability, add-to-cart.
- Same SEO treatment as products.

## Done when
- [ ] Savings line appears only when there is a real saving.
- [ ] Bundle availability reflects component stock (unavailable bundle can't be added).
- [ ] Build + tests pass.
