# Task 14 — POS: Scan Mode (In-Person Sales)

## Goal
Fast counter sales on a tablet with a Bluetooth barcode scanner, with every correction tracked.

## Depends on
Task 13.

## Scope
- `/admin/pos`: full-screen sale view. A hidden, always-focused input captures scanner keystrokes (scanners type SKU + Enter); focus auto-recovers after any interaction.
- Scan resolves SKU → product/variant/bundle: adds a line or increments qty if already present. Audible/visual success feedback. Unknown SKU → non-blocking "not found" feedback, input refocused, sale untouched. Inactive item → same treatment with "inactive" message.
- Quick-pick grid: products flagged `is_quick_pick` (ordered by `quick_pick_sort`) render as large tap targets above the sale — tapping adds one unit, same code path as a successful scan. Grid membership/order is managed by admin from the product list ("pin to POS" toggle + reorder); staff sees the grid read-only. Intended for high-frequency loose items (pens etc.) that are sold via the counter barcode sheet or by tap, never individually labeled.
- Manual fallback: search-by-name picker for items with damaged/missing labels.
- Lines: name, unit price from the pricing service (channel `pos` — permanent discounts and active `pos`/`both` promos applied automatically, with a small "promo" marker on the line when a promo priced it), qty stepper, remove. Removing a line requires a quick reason tap (`wrong scan` / `customer changed mind`) — recorded in the sale's events on completion (removals before completion are buffered client-side and submitted with the sale).
- Running total always visible. Out-of-stock non-backorder scan → warning but allowed to proceed only via explicit override tap (physical item exists ⇒ stock count is wrong; the override is logged as a `correction` context on the movement note).
- Complete sale: payment method (cash / Bankily / Masrvi / Sedad / other) → service creates order (`source=pos`, status `delivered`, `created_by` = user) + items + events (incl. buffered line-removal events) + `pos_sale` stock movements, one transaction. New empty sale starts.
- Void (admin only), from order detail (Task 13 view): `delivered(pos) → voided` with reason; restores stock (`void_restock`), logs event.
- Works for both roles; staff cannot void.

## Done when
- [x] Simulated scans (keyboard input SKU+Enter) add correct lines within 1s; unknown SKU never blocks.
- [x] Quick-pick tap adds a line identically to a scan; only admin can change grid membership.
- [x] Removing a scanned line then completing: sale excludes it, its removal event exists with reason, stock only decremented for kept lines.
- [x] Void restores stock exactly and is admin-only (staff attempt → `FORBIDDEN`).
- [x] Integration tests: complete-sale transaction (order + events + movements consistent), void symmetry.
- [x] Build + tests pass.
