const PHONE_KEY_PATTERN = /^(customer_)?phone$/i;
const MAURITANIAN_PHONE_PATTERN = /\b\d{8}\b/g;

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(MAURITANIAN_PHONE_PATTERN, "[redacted]");
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    return scrubRecord(value as Record<string, unknown>);
  }
  return value;
}

function scrubRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    result[key] = PHONE_KEY_PATTERN.test(key) ? "[redacted]" : redactValue(value);
  }

  return result;
}

/**
 * Strips customer_phone/phone fields and any bare 8-digit number (Mauritanian
 * phone format) from a Sentry event's breadcrumbs, extra, contexts, request,
 * and user payloads, so no customer PII ever leaves the app.
 */
export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T {
  return scrubRecord(event) as T;
}

/**
 * The same rule applied to a PostHog capture payload's `properties`, wired as
 * `before_send` on both posthog-js and posthog-node.
 *
 * `analytics-events.ts` already forbids PII by construction — every event's
 * props are a typed literal, and none of them declare a phone or a name. This
 * is the runtime backstop for the two things types cannot cover: autocapture,
 * which reads element text and attributes off pages the customer typed into,
 * and any future call site that passes a wider object than it meant to.
 */
export function scrubAnalyticsProperties<T extends Record<string, unknown>>(properties: T): T {
  return scrubRecord(properties) as T;
}
