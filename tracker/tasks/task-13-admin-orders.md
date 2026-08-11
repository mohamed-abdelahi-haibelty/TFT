# Task 13 — Admin: Orders Management

## Goal
Owner/staff run every web order through its lifecycle, with edits, cancellation, and a full audit trail.

## Depends on
Task 12.

## Scope
- Service `orders-admin.ts` implementing the state machine from `architecture.md`; every mutation appends `order_events` and (where stock changes) `stock_movements` in one transaction.
- `/admin/orders`: list newest-first; filters: status, source, city, date range; search by code/phone/name. Badge counts per status.
- Order detail: customer info, items, totals, events timeline (actor + time), current status with only-valid next actions:
  - `pending → confirmed`: decrements stock (conditional update; insufficient non-backorder stock → `CONFLICT` telling which item; backorder lines may drive stock negative — allowed and visible).
  - `confirmed → preparing`; `preparing → shipped` (requires bus company, optional note) for bus delivery, or `preparing → ready` for NDB pickup; `shipped → arrived`; `arrived|ready → delivered` (requires payment method if not set).
  - Cancel from any pre-delivered status with required reason; if stock was decremented, restore it (`cancel_restock` movements).
- Edit items while `pending|confirmed|preparing`: add/remove lines, change qty; server re-prices; if already `confirmed`, stock deltas applied atomically; each edit logged (`items_edited` / `line_removed` with before/after payload).
- Per-status quick action: copy/open a prefilled WhatsApp message to the customer (confirmed / shipped with bus info / arrived / ready), built by the Task 11 message lib.
- Staff can do all of the above except nothing extra — (voiding POS sales excluded here; Task 14).

## Done when
- [ ] pending→confirmed decrements stock and writes movements; cancel afterwards restores exactly.
- [ ] Invalid transition attempt (crafted request) → `CONFLICT`; UI never offered it.
- [ ] Removing a line from a confirmed order restores that line's stock and logs `line_removed`.
- [ ] Confirm with insufficient stock (non-backorder) → conflict naming the item; order stays `pending`.
- [ ] Integration tests: confirm/cancel stock symmetry; state machine rejects bad transitions.
- [ ] Build + tests pass.
