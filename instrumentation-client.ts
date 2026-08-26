import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/src/lib/observability/scrub-sentry-event";
import {
  OBSERVABILITY_ENV,
  SENTRY_RELEASE,
  isObservabilityEnabled,
} from "@/src/lib/observability/config";

/**
 * Errors a browser reports that tell us nothing about this app. Left
 * unfiltered these are the ordinary way a 5,000-errors-a-month budget
 * disappears in a week — a single misbehaving extension on one customer's
 * phone can produce thousands.
 */
const IGNORED_ERRORS = [
  // Benign, fires from any ResizeObserver-driven layout and is unactionable.
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  // A navigation or a closed tab cancelling an in-flight request. Not a bug.
  "AbortError",
  "The operation was aborted",
  "Failed to fetch",
  "NetworkError when attempting to fetch resource",
  "Load failed",
  // Chrome's opaque cross-origin script error.
  "Script error.",
];

const DENIED_URLS = [
  /extensions\//i,
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(web-)?extension:\/\//i,
];

if (process.env.NEXT_PUBLIC_SENTRY_DSN && isObservabilityEnabled) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: OBSERVABILITY_ENV,
    release: SENTRY_RELEASE,
    sendDefaultPii: false,

    // Errors only in the browser. Turning tracing off removes the
    // BrowserTracing instrumentation that otherwise patches fetch, history and
    // navigation on every storefront page — on the mobile connections this
    // shop actually serves, that runtime cost is not worth client-side spans
    // we would never act on. Server-side tracing is untouched.
    //
    // Note this does not shrink the bundle: Sentry's tree-shake for tracing is
    // `webpack.treeshake.removeTracing`, applied through DefinePlugin, and
    // Next 16 builds with Turbopack. The code still ships; only the work and
    // the span quota go away.
    tracesSampleRate: 0,
    integrations: (defaults) =>
      defaults.filter((integration) => integration.name !== "BrowserTracing"),

    ignoreErrors: IGNORED_ERRORS,
    denyUrls: DENIED_URLS,

    // No session replay: keeps the storefront bundle lean.
    beforeSend: (event) =>
      scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
