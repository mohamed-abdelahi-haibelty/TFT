# Task 16 — Admin Dashboard

## Goal
Owner sees the health of the business at a glance. Admin only.

## Depends on
Task 15.

## Scope
- `/admin` (admin role; staff landing is `/admin/orders`):
  - Month selector (default current month).
  - Cards: revenue (sum of delivered orders' totals in month, POS + web, excluding voided), order counts by status, POS vs web split, average order value.
  - Top 10 products by qty sold in month (from order_items of delivered orders).
  - Low-stock list (≤ threshold) linking to inventory.
  - Pending orders needing action (oldest `pending`/`confirmed`) linking to order detail.
- Queries aggregated in SQL (no loading all orders into JS); cached per month with short revalidation, current month revalidated on order mutations.
- Voided orders excluded everywhere; cancelled orders count only in status counts.

## Done when
- [ ] Numbers match a hand-computed fixture scenario (integration test: mix of web delivered, POS delivered, cancelled, voided).
- [ ] Staff hitting `/admin` is redirected to `/admin/orders`; direct service call → `FORBIDDEN`.
- [ ] Month switch shows historical months correctly.
- [ ] Build + tests pass.
