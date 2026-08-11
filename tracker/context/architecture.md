# Architecture Context

## Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + TypeScript strict | Frontend + backend (server actions, route handlers). Uses `proxy.ts` (not `middleware.ts`) for edge request interception |
| UI | Tailwind CSS + shadcn/ui | Mobile-first UI. Visual design is owned by the "impeccable" skill — specs define functionality only |
| i18n | next-intl | Arabic (RTL, default) + French, locale prefix routing `/ar`, `/fr` |
| Auth | Better Auth | Admin/staff sessions only. Public storefront has no auth |
| Database | Neon Postgres (serverless driver) | Source of truth for all data |
| ORM | Drizzle | Schema, migrations (`drizzle-kit`), typed queries |
| Images | Cloudinary (free tier) | Storage + on-the-fly transforms: `f_auto,q_auto`, white background padding. No background-removal add-on |
| Barcodes | bwip-js | Server-side Code 128 SVG/PNG generation from SKU |
| Validation | Zod | All external input at boundaries (forms, route handlers, server actions) |
| Caching | Next.js ISR + `revalidateTag`; Cloudflare CDN in front | No Redis in v1 |
| Hosting | Vercel free tier; Cloudflare for DNS/CDN/rate limiting | |

## System Boundaries

- `app/[locale]/(store)/` — public storefront pages. Server components by default. Never imports admin code.
- `app/[locale]/admin/` — admin panel pages. Every page enforces session + role.
- `app/api/` — route handlers (order creation, tracking lookup, barcode image, Cloudinary signature). Thin: validate → call service → respond.
- `src/db/` — Drizzle schema, migrations, seed. Only place that defines tables.
- `src/services/` — business logic (orders, stock, sales, bundles). The ONLY layer that mutates the database. UI and route handlers never write queries with side effects directly.
- `src/lib/` — pure helpers (whatsapp message builder, order-code generator, cloudinary URLs, money formatting).
- `components/` — shared UI. `components/ui/*` is generated shadcn — protected, do not edit.
- `proxy.ts` — locale routing + admin route session gate.

## Storage Model

- **Postgres (Neon)**: all metadata — users, categories, products, variants, images (Cloudinary public IDs only), bundles, orders, order items, order events, stock movements.
- **Cloudinary**: image binaries only. DB stores `public_id` + sort order; URLs are built at render time with transforms.
- Money is stored as **integer MRU** everywhere. No floats, no decimals.

## Auth and Access Model

- Better Auth email/password. No public signup: the seed creates the admin; admin creates the single staff account from the Users page.
- `user.role` ∈ {`admin`, `staff`}.
- `staff` can: view/update orders, run POS, adjust stock, view products.
- `staff` cannot: create/delete products or bundles, change prices/discounts, manage users, view the revenue dashboard, void completed sales.
- Enforcement lives in the service layer (every mutating service function receives the acting user and checks role) — not only in the UI.
- Public order tracking authenticates by pair: order code + customer phone.

## Order Model

- `orders.source` ∈ {`web`, `pos`}.
- Web statuses: `pending → confirmed → preparing → (shipped → arrived | ready) → delivered`, or `cancelled` from any pre-delivered state. `shipped/arrived` path for NKC/other-city delivery; `ready` path for NDB pickup.
- POS sales are orders created directly as `delivered`, plus `voided` as a terminal admin-only transition.
- Every status change, item edit, cancellation, and void appends an `order_events` row (actor, type, payload, timestamp).

## Stock Model

- Stock decrements on web order `confirmed` (not on `pending`) and on POS sale completion.
- Stock restores on cancellation of a confirmed order and on POS void.
- Every stock change (sale, restock, correction, void, manual adjustment) writes a `stock_movements` row with reason + actor. Stock quantity is a stored column, but movements make it auditable.
- Bundles hold no stock; availability derives from component stock. Selling a bundle decrements component stocks.

## Invariants

1. All money values are integer MRU.
2. No database mutation outside `src/services/`.
3. Every stock quantity change has a matching `stock_movements` row, written in the same transaction.
4. Every order state/content change has a matching `order_events` row, written in the same transaction.
5. Order status transitions follow the defined state machine; invalid transitions are rejected in the service layer.
6. Public routes never expose admin data (costs, stats, movement logs, customer lists).
7. Storefront pages are statically cached and revalidated by tag (`products`, `product:{id}`, `bundles`); mutations call `revalidateTag`.
8. All external input is Zod-parsed before use.
9. `components/ui/*` (shadcn) is never hand-edited.
10. Images are only ever rendered through Cloudinary transform URLs with `f_auto,q_auto`.
