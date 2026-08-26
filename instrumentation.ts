import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/src/lib/observability/scrub-sentry-event";
import {
  OBSERVABILITY_ENV,
  SENTRY_RELEASE,
  isObservabilityEnabled,
} from "@/src/lib/observability/config";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/src/lib/env");
  }

  if (!process.env.NEXT_PUBLIC_SENTRY_DSN || !isObservabilityEnabled) return;

  const isEdge = process.env.NEXT_RUNTIME === "edge";

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: OBSERVABILITY_ENV,
    release: SENTRY_RELEASE,
    // Never attach IPs, cookies or headers. Every scrubbing rule in this repo
    // exists because the only personal data it holds is a customer's phone
    // number, and the cheapest way to protect it is not to collect it.
    sendDefaultPii: false,

    // The edge runtime is `proxy.ts`, which runs on *every* HTML navigation
    // (its matcher excludes only /api, /_next, /_vercel and files). Tracing
    // there would mint a transaction per page view for a file that does one
    // cookie check and a locale rewrite. Errors only.
    //
    // On the server, spans are the abundant resource on Sentry's free tier and
    // errors are the scarce one, so this samples for usefulness rather than
    // volume: the order path in full, everything else thinly.
    ...(isEdge
      ? { tracesSampleRate: 0 }
      : {
          tracesSampler: (context) => {
            const url = context.normalizedRequest?.url ?? context.name ?? "";

            // The one request with a customer waiting on the other end of it,
            // and the only one worth a complete trace when it goes wrong.
            if (url.includes("/api/orders")) return 1;

            return context.inheritOrSampleWith(0.05);
          },
        }),

    beforeSend: (event) =>
      scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,
  });
}

export const onRequestError = Sentry.captureRequestError;
