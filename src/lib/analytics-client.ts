"use client";

import type { PostHog } from "posthog-js";
import type { AnalyticsEventName, AnalyticsEventProps } from "./analytics-events";

let posthogInstance: PostHog | undefined;
let initPromise: Promise<PostHog | undefined> | undefined;

/**
 * Dynamically imports and initializes posthog-js. Callers should only invoke
 * this after hydration/idle so it never competes with the storefront's LCP.
 */
export function initPostHogClient(): Promise<PostHog | undefined> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return Promise.resolve(undefined);
  if (initPromise) return initPromise;

  initPromise = import("posthog-js").then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false,
    });
    posthogInstance = posthog;
    return posthog;
  });

  return initPromise;
}

export function setAutocapture(enabled: boolean): void {
  posthogInstance?.set_config({ autocapture: enabled });
}

export function capturePageview(url: string): void {
  posthogInstance?.capture("$pageview", { $current_url: url });
}

export function trackEvent<E extends AnalyticsEventName>(event: E, props: AnalyticsEventProps[E]): void {
  posthogInstance?.capture(event, props);
}
