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
| Observability | Sentry (`@sentry/nextjs`) + PostHog (`posthog-js` / `posthog-node`) | Production deploys only. Errors report directly to Sentry (no `tunnelRoute`); events go directly to PostHog (no reverse proxy) — both would otherwise bill Vercel invocations for telemetry. Browser SDK is errors-only, no tracing, no session replay |

## System Boundaries

- `app/[locale]/(store)/` — public storefront pages. Server components by default. Never imports admin code.
- `app/[locale]/admin/` — admin panel pages. Every page enforces session + the permission its section needs (`ADMIN_SECTIONS`).
- `app/api/` — route handlers (order creation, tracking lookup, barcode image, Cloudinary signature). Thin: validate → call service → respond.
- `src/db/` — Drizzle schema, migrations, seed. Only place that defines tables.
- `src/services/` — business logic (orders, stock, sales, bundles). The ONLY layer that mutates the database. UI and route handlers never write queries with side effects directly.
- `src/lib/analytics*.ts` — telemetry, split by trust and by cost. `analytics-client.ts` (browser) carries views and interactions; `analytics.ts` (`posthog-node`) carries money events only, and never runs anywhere a route is cached. Firing a view event server-side would either report once per revalidation or force the route dynamic and wake Neon for every visitor — `tests/lib/observability/analytics-boundaries.test.ts` enforces the separation.
- `src/lib/` — pure helpers (whatsapp message builder, order-code generator, cloudinary URLs, money formatting).
- `components/` — shared UI. `components/ui/*` is generated shadcn — protected, do not edit.
- `proxy.ts` — locale routing + admin route session gate.

## Storage Model

- **Postgres (Neon)**: all metadata — users, categories, products, variants, images (Cloudinary public IDs only), bundles, orders, order items, order events, stock movements.
- **Cloudinary**: image binaries only. DB stores `public_id` + sort order; URLs are built at render time with transforms.
- Money is stored as **integer MRU** everywhere. No floats, no decimals.

## Auth and Access Model

- Better Auth email/password. No public signup: the seed creates the admin; admin creates staff accounts from the Users page.
- `user.role` ∈ {`admin`, `staff`}. `admin` (the shop owner) implicitly holds every permission and cannot be limited.
- `users.permissions` (`text[]`) holds the keys granted to a `staff` account. The vocabulary is `src/lib/permissions.ts`: `catalog.view` / `catalog.manage` / `catalog.pricing`, `promotions.manage`, `orders.view` / `orders.manage` / `orders.cancel`, `pos.use` / `pos.void`, `inventory.view` / `inventory.adjust`, `labels.print`, `dashboard.view`, plus `users.manage` and `settings.manage` which are **admin-exclusive and never grantable** (so no staff account can widen its own access).
- Permissions have prerequisites (`PERMISSION_REQUIRES`, e.g. `catalog.pricing` → `catalog.manage` → `catalog.view`). Both the writer (`setStaffPermissions`) and the reader (`evaluateSession`) close a granted set over them, so an incoherent set cannot be stored or acted on.
- A new staff account starts with **nothing** granted; the admin grants explicitly at `/admin/users/[id]`. Staff rows that predate the feature were backfilled by migration `0006` with the access they already had.
- Enforcement lives in the service layer: every gated service function calls `requirePermission(key)`. `requireUser(role?)` remains only for "any signed-in operator" (the admin shell, the login redirect). The UI hides what an account cannot do; that is a courtesy, never the rule.
- Public order tracking authenticates by pair: order code + customer phone.

## Order Model

- `orders.source` ∈ {`web`, `pos`}.
- Web statuses: `pending → confirmed → preparing → (shipped → arrived | ready) → delivered`, or `cancelled` from any pre-delivered state. `shipped/arrived` path for NKC/other-city delivery; `ready` path for NDB pickup.
- POS sales are orders created directly as `delivered`, plus `voided` as a terminal transition gated on `pos.void`.
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
11. Every displayed and charged price comes from the pricing service (`getEffectivePrice`) with the correct channel (`web`/`pos`); promotions never stack with `discount_price` — the pricing service picks one. Promo countdowns in UI are cosmetic; the server clock decides applicability at charge time.
