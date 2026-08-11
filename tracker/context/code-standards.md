# Code Standards

## General

- Write only the code the current task needs. No speculative abstractions, no unused helpers, no boilerplate "for later".
- Keep modules small and single-purpose. Fix root causes; do not layer workarounds.
- Prefer deleting code over adding config to hide it.
- The project owner will not read the code — correctness must be provable through behavior and the checks in each task spec, not through comments. Keep comments rare and only where intent is non-obvious.

## TypeScript

- Strict mode. No `any`; use precise types or `unknown` + narrowing.
- Types for DB rows come from Drizzle inference (`InferSelectModel`) — never hand-duplicate them.
- Zod-parse all external input (form data, route handler bodies, search params) at the boundary; after parsing, trust the type.

## Next.js 16

- Server components by default; add `"use client"` only when interactivity requires it, and push it to the smallest leaf possible.
- Use `proxy.ts` (Next 16) for locale + admin session gating — there is no `middleware.ts`.
- Mutations from admin UI use server actions calling service functions. Public order creation uses a route handler (needs rate limiting + non-JS fallback).
- Storefront reads use cached queries tagged for `revalidateTag`. Never fetch per-request what can be static.
- `next/image` with Cloudinary loader for all product imagery; explicit `width/height` or `fill` to prevent layout shift.
- Metadata API for per-page titles/descriptions; `generateMetadata` on product/bundle pages.

## Styling

- Tailwind utilities + shadcn tokens only; no hardcoded hex values, no inline styles.
- All layouts must work at 360 px width first.
- Logical properties / RTL-safe utilities (`ms-`, `me-`, `start`, `end`) — never `ml-`/`mr-` — because Arabic is RTL.
- Visual design decisions (palette, spacing personality, typography) belong to the impeccable skill, not to specs or this file.

## Server Actions & Route Handlers

- Shape: parse input (Zod) → check auth/role → call one service function → return typed result.
- Consistent result shape from actions: `{ ok: true, data } | { ok: false, error: { code, message } }`.
- No business logic in components, actions, or handlers — services only.

## Data and Storage

- Money: integer MRU. Format for display in one shared helper.
- IDs: UUID primary keys generated in Postgres; human-facing order code (`PPT-YYMM-NNN`) generated in the order service, unique.
- All multi-step mutations (order + events + stock movements) run in a single transaction.
- Timestamps: `timestamptz`, UTC in DB; format at the edge.
- DB stores Cloudinary `public_id`s, never full URLs.

## Testing

- Only tests that protect real behavior. Priority order:
  1. Unit: order state machine, stock movement logic, WhatsApp message builder, order-code generator, money formatting, Zod schemas.
  2. Integration: order creation → confirm → stock decrement; POS sale → void → restock; role enforcement in services.
- No snapshot tests, no component render tests for static UI, no testing of framework behavior or shadcn components.
- Vitest for both; integration tests run against a Neon dev-branch database.

## Accessibility

- Every interactive element keyboard-reachable with visible focus.
- Form inputs have labels; errors are announced (aria-live).
- Images have meaningful `alt` (product name + variant); decorative images `alt=""`.
- Color is never the only carrier of meaning (e.g. status badges include text).

## File Organization

- `app/[locale]/(store)/` — public pages
- `app/[locale]/admin/` — admin pages
- `app/api/` — route handlers
- `src/db/` — schema, migrations, seed
- `src/services/` — business logic (all mutations)
- `src/lib/` — pure helpers
- `components/` — shared components (`components/ui/*` protected)
- `tests/` — mirrors `src/` structure
