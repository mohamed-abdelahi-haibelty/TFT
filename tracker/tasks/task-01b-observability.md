# Task 01b — Observability: Sentry + PostHog

## Goal

Production error tracking (Sentry) and product analytics (PostHog) wired in, with zero impact on storefront performance and no customer PII captured.

## Depends on

Task 01. Run before Task 02 so all later tasks inherit instrumentation.

## Scope

### Sentry (@sentry/nextjs — free tier)

- Init via the Next.js 16 pattern: `instrumentation.ts` (server/edge) + `instrumentation-client.ts` (browser). Wrap `next.config` with `withSentryConfig` (source maps upload on Vercel builds only).
- Enabled only when `NEXT_PUBLIC_SENTRY_DSN` is set (dev with no DSN = fully off, no console noise).
- `src/lib/logger.ts` extended: every `INTERNAL`-level error is also sent to Sentry with request context. Expected taxonomy errors (`VALIDATION`, `NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`) are NOT sent — only unexpected ones.
- Global boundaries (`error.tsx`, `global-error.tsx`) report to Sentry.
- `beforeSend` scrubber: strip `customer_phone`, `phone`, and any 8-digit Mauritanian number pattern from event payloads and breadcrumbs.
- Sample rates: `tracesSampleRate: 0.1` in production, 0 in dev; no session replay (bundle weight).

### PostHog (posthog-js client + posthog-node server — free tier)

- Client init lazy: dynamically imported after hydration/idle so it never affects LCP; only when `NEXT_PUBLIC_POSTHOG_KEY` is set. `person_profiles: 'identified_only'`, autocapture ON for storefront, OFF for `/admin` routes.
- SPA pageview tracking for locale routes (manual `$pageview` on navigation).
- Server helper `src/lib/analytics.ts` (posthog-node, fire-and-forget with flush on Vercel) exposing typed `track(event, props)`.
- Custom events (add as their features are built; wire now where the code already exists, leave TODO markers referenced in later tasks otherwise):
  - `product_viewed` {slug}, `bundle_viewed` {slug}
  - `added_to_cart` {type, slug, qty}
  - `order_submitted` {code, total, city, items_count} — server-side in `POST /api/orders`
  - `whatsapp_opened` {code}
  - `order_tracked` {found: boolean}
  - `pos_sale_completed` {total, items_count, payment_method} — server-side
- Never send: names, phone numbers, free-text notes. Order code is allowed (not PII).
- Admin usage is not tracked (no need, saves quota).

### Config & docs (same task)

- Append to `.env.example` (both environments; leave empty in dev to disable):
  ```
  NEXT_PUBLIC_SENTRY_DSN=""
  SENTRY_AUTH_TOKEN=""            # Vercel build source-map upload, prod only
  NEXT_PUBLIC_POSTHOG_KEY=""
  NEXT_PUBLIC_POSTHOG_HOST="https://eu.i.posthog.com"
  ```
- Update `context/architecture.md` stack table (Observability row) and `context/error-handling.md` Logging section (logger → Sentry for INTERNAL only; scrubbing rule).
- Update `context/progress-tracker.md`.

## Out of scope

Session replay, Sentry cron monitoring, PostHog feature flags/experiments, self-hosting.

## Done when

- [ ] With env vars unset, app runs with no Sentry/PostHog network calls and no warnings.
- [ ] A thrown test error in a server action reaches Sentry (verify once with a real DSN, then remove the test trigger).
- [ ] A `CONFLICT` service result does NOT create a Sentry event (unit test on the logger routing).
- [ ] Phone-number scrubber strips an 8-digit number from a fabricated event (unit test).
- [ ] Storefront Lighthouse mobile performance unchanged (PostHog loads after idle; verify no render-blocking request).
- [ ] Pageviews and `product_viewed` appear in PostHog from a dev session with keys set.
- [ ] Build + tests pass; context files updated; committed as `feat(infra): add sentry and posthog observability [task 01b]`.
