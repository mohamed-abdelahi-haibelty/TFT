import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/src/lib/observability/scrub-sentry-event";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/src/lib/env");
  }

  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
      beforeSend: (event) =>
        scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
