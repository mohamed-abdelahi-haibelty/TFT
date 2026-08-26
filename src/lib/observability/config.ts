/**
 * The one place that decides whether Sentry and PostHog are live, and which
 * build they are reporting for.
 *
 * Both values are minted in `next.config.ts` and inlined at build time via its
 * `env` key. That indirection is deliberate: `VERCEL_ENV` and
 * `VERCEL_DEPLOYMENT_ID` are server-only, and Next inlines nothing but
 * `NEXT_PUBLIC_*` into the browser bundle — reading them directly from client
 * code yields `undefined` and silently disables the browser SDK in production.
 *
 * These must stay literal `process.env.NEXT_PUBLIC_*` reads for that inlining
 * to happen. That is also why the observability vars are not pulled from
 * `src/lib/env.ts` here: its zod schema parses the whole of `process.env` at
 * runtime, which is empty in the browser.
 */
export const OBSERVABILITY_ENV = process.env.NEXT_PUBLIC_OBSERVABILITY_ENV ?? "development";

export const SENTRY_RELEASE = process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? "dev";

/**
 * Production deploys only.
 *
 * Preview deploys and local dev stay fully inert. The Sentry free tier allows
 * 5,000 errors a month, and this repo's Vitest suite runs against a real
 * database — letting previews and test runs report would spend the budget that
 * exists to tell us about real customers hitting real bugs.
 */
export const isObservabilityEnabled = OBSERVABILITY_ENV === "production";
