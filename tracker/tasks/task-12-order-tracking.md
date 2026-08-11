# Task 12 — Public Order Tracking

## Goal
Customer checks order status with order code + phone.

## Depends on
Task 11.

## Scope
- `/[locale]/track`: form (order code, phone). Lookup service matches the pair; any mismatch → generic localized "order not found" (`NOT_FOUND`, no existence leak). Rate-limited.
- Result: status timeline built from `order_events` — user-facing steps only (received → confirmed → preparing → on the bus → arrived at station → delivered, or ready-for-pickup path for NDB, or cancelled). Each reached step shows its date. Internal events (edits, actors) never exposed.
- When `shipped`: show bus company + note (e.g. departure info). When `arrived`: pickup instructions text. When `ready` (NDB): shop pickup text.
- Bilingual status labels; result linkable via query params so the owner can send the customer a direct tracking URL.

## Done when
- [ ] Correct pair shows the timeline with dates; wrong phone with real code shows generic not-found.
- [ ] Shipped order displays bus info; NDB order shows the pickup path (no bus steps).
- [ ] Cancelled order shows cancelled state without internal reason details.
- [ ] Build + tests pass.
