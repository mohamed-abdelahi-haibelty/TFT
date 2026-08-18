# Task 11 — Cart, Checkout, WhatsApp Handoff

## Goal
Customer builds a cart, submits an order, and lands in WhatsApp with a prefilled message.

## Depends on
Task 10.

## Scope
- Cart state client-side (in-memory + persisted to localStorage is fine on the public site): items (product/variant/bundle, qty, price snapshot for display), edit qty, remove, subtotal. Header count badge. Cart page/drawer.
- Checkout form: name, phone (Mauritanian format validated: 8 digits starting 2/3/4, stored as 222XXXXXXXX), city (NDB / NKC / other), optional note. Delivery derived: NDB → pickup at shop; NKC/other → bus.
- `POST /api/orders` route handler: Zod-validate; re-price everything server-side via the pricing service (channel `web`, server clock — never trust client prices; a promo expiring between cart and submit simply reprices at the normal price); availability check per `error-handling.md` (all-or-nothing, `CONFLICT` lists unavailable items and cart updates accordingly); create order `pending` + items + `created` event in one transaction; generate order code `PPT-YYMM-NNN` (sequence per month). No stock change at this stage. Rate-limited per IP (simple in-memory/Vercel-friendly limiter; Cloudflare rule documented).
- Confirmation screen: order code, item summary, "what happens next" (bilingual), and automatic WhatsApp redirect + manual `wa.me` button fallback. Message content (in the customer's locale): order code, each line (name ×qty), total, customer name + city, and a sentence asking to confirm and send payment via Bankily/Masrvi/Sedad.
- `src/lib/whatsapp.ts` message builder (pure, unit-tested, URL-encoded).
- Empty-cart checkout prevented.

## Done when
- [ ] Full flow on mobile viewport: add 2 products + 1 bundle → checkout → order in DB (`pending`, correct totals from server prices) → WhatsApp link opens with correct message in the active locale.
- [ ] Tampered client price does not affect stored totals (integration test).
- [ ] Item that went out of stock (non-backorder) between cart and submit → localized conflict listing it; nothing saved.
- [ ] Unit tests: message builder, phone validation, order-code generator sequencing.
- [ ] Build + tests pass.
