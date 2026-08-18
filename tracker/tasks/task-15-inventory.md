# Task 15 — Inventory: Adjustments + Movement Log

## Goal
Stock is manageable and fully auditable.

## Depends on
Task 14.

## Scope
- `/admin/inventory`: product/variant list with current stock, low-stock highlight (≤ threshold), search + category filter, "low stock only" filter.
- Adjust action per row: delta or new absolute qty, reason (`restock` / `correction` / `manual_adjust`), optional note → service writes movement + updates qty in one transaction. Available to staff.
- Scan-to-adjust: reuse the Task 14 scan capture on this page — scanning jumps to/focuses that item's adjust action (fast restocking with the scanner).
- `/admin/inventory/movements`: paginated global movement log (item, delta, reason, actor, order link when present, note, time); per-item history reachable from the item row and from the product form.
- Negative resulting stock allowed only for backorder products; otherwise `CONFLICT`.

## Done when
- [x] Adjustment updates qty and appears in the log with actor + reason.
- [x] Sum of an item's movements equals its current stock for seeded + test flows (integration test).
- [x] Non-backorder item cannot be adjusted below zero.
- [x] Build + tests pass.
