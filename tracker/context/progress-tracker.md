# Progress Tracker

Update this file after every completed task.

## Current Phase

- In progress

## Current Goal

- Task 02 — database schema + seed

## Completed

- Task 01 — project setup: Next.js 16 (App Router, TS strict, Tailwind + shadcn/ui), Drizzle + Neon client, next-intl (`ar` default RTL / `fr`) with `proxy.ts` locale routing and placeholder admin gate, Zod env validation wired through `instrumentation.ts`, global error boundaries + logger + `withErrorHandling`, Vitest with an env-validator smoke test.
- Task 01b — observability: Sentry (`instrumentation.ts` + `instrumentation-client.ts`, `withSentryConfig` in `next.config.ts`, shared `beforeSend` phone scrubber, `logger.ts` routes only unexpected/`INTERNAL` errors to Sentry) and PostHog (`src/lib/analytics.ts` server helper with `after()`-flushed fire-and-forget capture, `src/lib/analytics-client.ts` + `components/analytics/posthog-provider.tsx` for lazy post-idle client init, SPA pageviews, and storefront/admin autocapture split). Custom product/order/POS events are typed in `src/lib/analytics-events.ts` with TODO markers — no call sites yet since those features don't exist until later tasks. Both providers are fully inert with their env vars unset.

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
- Sentry routing lives in `logger.ts` (keyed off `context.code`) rather than at each call site, so the "which errors reach Sentry" decision has one place to audit/test instead of being re-decided at every `logger.error` call.
- PostHog client init is deliberately decoupled from `instrumentation-client.ts` (which runs before hydration) — it's triggered from a mounted client component via `requestIdleCallback` so it can never be blamed for LCP regressions.

## Session Notes

- Task 01 complete: `npm run dev` serves `/ar` (RTL) and `/fr` correctly, missing `DATABASE_URL` fails startup with a clear error, unknown routes show the localized 404, `npm run build` and `npm test` both pass.
- Task 01b complete: with env vars unset, Sentry/PostHog init is fully skipped (no network calls, no console noise). Sentry DSN/PostHog key verification against real projects and the Lighthouse/pageview checks from the task's "done when" list need a manual pass with real keys before shipping — not automatable from this environment.
