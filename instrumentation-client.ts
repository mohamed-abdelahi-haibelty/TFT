import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/src/lib/observability/scrub-sentry-event";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    // No session replay: keeps the storefront bundle lean.
    beforeSend: (event) =>
      scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
