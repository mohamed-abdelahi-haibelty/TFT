# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Customers** in Nouadhibou (NDB) and Nouakchott (NKC), Mauritania, browsing on a phone to order stationery (bags, pens, notebooks, school "boxes"). Most are on mobile devices and are **not comfortable with technology or online shopping generally** — this is a stronger constraint than typical mobile-first guidance: assume no familiarity with cart/checkout conventions, prefer very few steps, plain everyday language over UI jargon, and unambiguous, labeled actions over icon-only controls.
- **Shop owner** (`admin` role): full access — products, pricing, bundles, promotions, users, revenue dashboard. Uses a tablet in-shop for POS and admin work.
- **One staff member** (`staff` role): orders, POS scanning, stock adjustments. Cannot touch products, prices, users, or the revenue dashboard.

## Product Purpose

An online storefront + admin system for a stationery shop (papeterie) in Nouadhibou, Mauritania. Customers browse products on a fast, mobile-first bilingual site and place orders that hand off to WhatsApp (no accounts, no online payment — payment happens outside the system via Bankily/Masrvi/Sedad screenshots in WhatsApp). The same admin system doubles as a lightweight in-shop POS using barcode-labeled products and a Bluetooth scanner. Success: a phone user can browse and order in under 2 minutes; the owner can run the whole shop (stock, orders, in-person sales) from a tablet with every change traceable.

## Positioning

Not a generic e-commerce storefront: it deliberately has no accounts, no online payment gateway, and no cart-abandonment/upsell machinery. Its mechanism is order → WhatsApp handoff, which fits how customers already trust and pay local merchants (Bankily/Masrvi/Sedad via WhatsApp screenshot) rather than forcing an unfamiliar checkout flow onto a non-tech-savvy audience. The same data model and pricing engine serve both the public storefront (channel `web`) and an in-person POS (channel `pos`) with barcode scanning, so one system runs online sales, in-shop sales, and inventory — built to run entirely on free hosting tiers (Vercel, Neon, Cloudinary, Cloudflare).

## Operating Context

- Bilingual: Arabic (RTL) is the default locale, French is secondary. No English-only user-facing text.
- Delivery is location-dependent: NDB orders are picked up at the shop (`ready` status); NKC (and other-city) orders ship via intercity bus (`shipped` → `arrived`) and are picked up at the bus station.
- Payment happens entirely outside the system — WhatsApp message + screenshot of a Bankily/Masrvi/Sedad transfer. The product's job ends at "order created + WhatsApp opened with the right message," not at payment collection.
- In-shop POS runs on a tablet with a Bluetooth barcode scanner that types SKU + Enter like a keyboard; products carry printed Code128 barcode labels (printed via the label printer's own app, not driven directly from the web app).
- Public order tracking has no login — customers authenticate by order code + phone number pair.

## Capabilities and Constraints

- Storefront: catalog with filters/search/sort, product pages with variants and multi-image galleries, bundles ("boxes"), cart, checkout, WhatsApp handoff, order tracking — all public, no auth.
- Admin: product/category/bundle/promotion CRUD, auto SKU + printable barcode labels, order lifecycle management with full event history, inventory adjustments with a full stock-movement log, POS scan mode, revenue dashboard (admin only).
- Role split is enforced in the service layer, not just the UI: `staff` cannot create/delete products, change prices/discounts, manage users, view the revenue dashboard, or void completed sales.
- Money is integer MRU everywhere (no floats/decimals). Every price shown or charged goes through one pricing service, keyed by channel (`web` vs `pos`); promotions never stack with a manual discount price.
- Out of scope (deliberately): online payment integration, customer accounts/reviews/wishlists, automated background removal on images, direct web-to-Bluetooth label printing, a staging environment.
- Target Lighthouse mobile scores on storefront pages: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95.
- Open/undecided product facts (do not invent): WhatsApp business number, low-stock threshold default (spec currently assumes 5, unconfirmed).

## Brand Commitments

- Shop name: **THE FIRST TRADE**, short form **TFT**. (Tracker docs and scaffolding still say "Papeterie" as a placeholder — treat "THE FIRST TRADE" / "TFT" as the real name going forward.)
- No logo or color identity has been decided yet — this is an open decision for future design work, not something to invent now.

## Evidence on Hand

- None yet. There are no real product photos, real prices, a real WhatsApp business number, or a logo/color choice at this stage — everything in the codebase (seed data, placeholder images) is scaffolding, not real content. Future work must not fabricate testimonials, customer names, pricing, or press/proof of any kind.

## Product Principles

1. Simplicity beats feature richness on every customer-facing surface — the primary audience is not confident with technology or online shopping, so fewer steps and plainer language always win over cleverness or density.
2. No accounts, no payment gateway: the trust mechanism is a human WhatsApp handoff, not a checkout page — never design flows that assume the customer wants an account or in-app payment.
3. Every stock and order change is traceable (who, what, when) — auditability is a product requirement, not an implementation detail, and should stay visible/legible in admin UI, not buried.
4. Bilingual by default: Arabic (RTL) leads, French follows — no locale should ever feel like an afterthought or literal translation of the other.
5. One system, two channels: storefront and in-shop POS share the same catalog, pricing, and stock — admin UI should make that shared reality legible rather than hiding POS as a bolted-on tool.

## Accessibility & Inclusion

- Lighthouse Accessibility ≥ 95 on storefront pages (home, catalog, product) is a stated success criterion.
- Beyond the standard bar: the primary customer base is explicitly not tech-savvy and not experienced with online shopping — favor large, clearly-labeled tap targets, linear/obvious flows, and icons paired with text over icon-only affordances. Treat this as a hard design constraint, not a nice-to-have.
