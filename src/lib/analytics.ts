import { PostHog } from "posthog-node";
import { after } from "next/server";
import type { AnalyticsEventName, AnalyticsEventProps } from "./analytics-events";
import { scrubAnalyticsProperties } from "./observability/scrub-sentry-event";

let client: PostHog | undefined;

function getClient(): PostHog | undefined {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return undefined;

  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
      // Serverless: the batching defaults (flush at 20 events, or after 10s)
      // assume a long-lived process. A Vercel function handles one order and
      // freezes, so anything still sitting in the buffer is simply lost.
      // Sending on capture and flushing in `after()` is the shape that fits.
      flushAt: 1,
      flushInterval: 0,
      // The same PII rule the Sentry client enforces, applied at the last
      // point before anything leaves the process.
      before_send: (event) => {
        if (event?.properties) {
          event.properties = scrubAnalyticsProperties(event.properties);
        }
        return event;
      },
    });
  }

  return client;
}

/**
 * Fire-and-forget server-side event capture.
 *
 * Only for events that must be trusted (a completed sale, an accepted order) —
 * everything a client can be trusted to report belongs in `analytics-client.ts`
 * instead, because a server-side view event would either run at revalidate time
 * or force its route dynamic and wake Neon for every visitor.
 *
 * Pass `distinctId` from `getAnalyticsDistinctId()` so the event joins the same
 * person as the client-side steps that led to it.
 */
export function track<E extends AnalyticsEventName>(
  event: E,
  props: AnalyticsEventProps[E],
  distinctId = "server",
): void {
  const posthog = getClient();
  if (!posthog) return;

  try {
    posthog.capture({
      distinctId,
      event,
      properties: {
        ...props,
        // Matches the client's `person_profiles: "identified_only"`: storefront
        // customers are anonymous, and asking PostHog to build a person profile
        // for each one costs quota for a record nothing ever reads.
        $process_person_profile: false,
      },
    });

    // Flushing after the response is what gets the event out before the
    // function freezes, without the customer waiting on PostHog. `after()`
    // itself throws outside a request scope, and the flush can reject if
    // PostHog is unreachable — neither may ever surface to the caller, which
    // is sitting on the order path.
    after(async () => {
      try {
        await posthog.flush();
      } catch {
        // Analytics delivery is never worth failing a request over.
      }
    });
  } catch {
    // Same rule, one level up: a missing request scope must not break an order.
  }
}
