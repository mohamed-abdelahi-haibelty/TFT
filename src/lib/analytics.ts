import { PostHog } from "posthog-node";
import { after } from "next/server";
import type { AnalyticsEventName, AnalyticsEventProps } from "./analytics-events";

let client: PostHog | undefined;

function getClient(): PostHog | undefined {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return undefined;

  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    });
  }

  return client;
}

/**
 * Fire-and-forget server-side event capture. Flushing is scheduled via
 * `after()` so the event is delivered before a Vercel function freezes
 * without delaying the response.
 */
export function track<E extends AnalyticsEventName>(
  event: E,
  props: AnalyticsEventProps[E],
  distinctId = "server",
): void {
  const posthog = getClient();
  if (!posthog) return;

  posthog.capture({ distinctId, event, properties: props });
  after(() => posthog.flush());
}
