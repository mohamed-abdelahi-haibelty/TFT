# Progress Tracker

Update this file after every completed task.

## Current Phase

- In progress

## Current Goal

- Task 02 — database schema + seed

## Completed

- Task 01 — project setup: Next.js 16 (App Router, TS strict, Tailwind + shadcn/ui), Drizzle + Neon client, next-intl (`ar` default RTL / `fr`) with `proxy.ts` locale routing and placeholder admin gate, Zod env validation wired through `instrumentation.ts`, global error boundaries + logger + `withErrorHandling`, Vitest with an env-validator smoke test.

## In Progress

- None yet.

## Next Up

- Task 02 — database schema + seed

## Open Questions

- Final shop name / brand name (placeholder: "Papeterie").
- WhatsApp business number to use in `NEXT_PUBLIC_WHATSAPP_NUMBER`.
- Exact low-stock threshold default (spec assumes 5; confirm with owner).

## Architecture Decisions

- Drizzle over Prisma: lighter cold starts on Vercel serverless, native fit with Neon serverless driver.
- No Redis in v1: Next.js tag-based caching + Cloudflare CDN is sufficient at expected traffic; revisit if order endpoint needs distributed rate limiting.
- Stock decrements at `confirmed` (web) / completion (POS), not at `pending`, so fake orders can't drain inventory.
- POS sales are `orders` rows with `source=pos` — one model for all revenue and one events log.
- Arabic is the default locale; French secondary.
- Env validation (`src/lib/env.ts`) runs via `instrumentation.ts` `register()` so a missing var fails at server startup, not silently at first use.
- `app/[locale]/[...rest]/page.tsx` calls `notFound()` explicitly — Next.js only renders a nested `not-found.tsx` for explicit throws, not for genuinely unmatched routes, so this catch-all is required to get the localized 404 instead of Next's built-in one.

## Session Notes

- Task 01 complete: `npm run dev` serves `/ar` (RTL) and `/fr` correctly, missing `DATABASE_URL` fails startup with a clear error, unknown routes show the localized 404, `npm run build` and `npm test` both pass.
