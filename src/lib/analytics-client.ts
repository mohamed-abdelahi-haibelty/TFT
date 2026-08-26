"use client";

import type { PostHog } from "posthog-js";
import type { AnalyticsEventName, AnalyticsEventProps } from "./analytics-events";
import { isObservabilityEnabled } from "./observability/config";
import { scrubAnalyticsProperties } from "./observability/scrub-sentry-event";

let posthogInstance: PostHog | undefined;
let initPromise: Promise<PostHog | undefined> | undefined;

/**
 * Routes autocapture must never run on. Matched against the full URL at
 * capture time, so unlike a toggle driven from an effect this cannot race a
 * navigation or drift out of sync with the route that is actually rendered.
 *
 * `/checkout` and `/track` are the load-bearing entries: both are storefront
 * routes where a customer types their name and phone number, and autocapture
 * reads element text and input attributes. `/admin` is excluded because staff
 * usage is not tracked at all — it answers no product question and spends
 * quota.
 *
 * Written without a locale segment on purpose; every path here is preceded by
 * `/ar` or `/fr`, so these stay unanchored substring patterns.
 */
const AUTOCAPTURE_URL_IGNORELIST = [/\/admin(\/|$)/, /\/checkout(\/|$)/, /\/track(\/|$)/];

/**
 * Dynamically imports and initializes posthog-js. Callers should only invoke
 * this after hydration/idle so it never competes with the storefront's LCP.
 *
 * The dynamic `import()` is load-bearing beyond laziness: it is what keeps
 * posthog-js in its own chunk and out of the initial payload entirely. Do not
 * turn it into a static import.
 */
export function initPostHogClient(): Promise<PostHog | undefined> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || !isObservabilityEnabled) return Promise.resolve(undefined);
  if (initPromise) return initPromise;

  initPromise = import("posthog-js").then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
      person_profiles: "identified_only",
      // Pageviews are captured by hand from the provider, because next-intl
      // rewrites every URL with a locale prefix and the SPA router never
      // reloads the document.
      capture_pageview: false,
      // Pageleave is what gives session duration and bounce rate any meaning.
      // Without it PostHog knows when a visit started and never that it ended.
      capture_pageleave: true,
      autocapture: { url_ignorelist: AUTOCAPTURE_URL_IGNORELIST },
      // Defence in depth behind the ignorelist above: even on the pages where
      // autocapture does run, it should not be carrying attribute values or
      // anything PostHog can recognise as personal data.
      mask_all_element_attributes: true,
      mask_personal_data_properties: true,
      before_send: (event) => {
        if (event?.properties) {
          event.properties = scrubAnalyticsProperties(event.properties);
        }
        return event;
      },
    });
    posthogInstance = posthog;
    drainPending(posthog);
    return posthog;
  });

  return initPromise;
}

export function capturePageview(url: string): void {
  posthogInstance?.capture("$pageview", { $current_url: url });
}

/**
 * Events fired before posthog-js finished loading.
 *
 * Initialization is deliberately deferred to idle so it never competes with
 * LCP, but a product page fires `product_viewed` the moment it mounts — well
 * before that. Captured straight onto the instance, those events would land on
 * `undefined` and vanish, and the view half of every funnel would quietly be
 * missing. Holding them here and replaying them on init keeps the ordering
 * honest without letting an event pull the SDK onto the critical path.
 *
 * Bounded because a visitor with analytics blocked, or any preview deploy,
 * never drains it. Twenty is far more than a single page's worth of intent.
 */
const MAX_PENDING_EVENTS = 20;
let pending: Array<(posthog: PostHog) => void> = [];

function whenReady(capture: (posthog: PostHog) => void): void {
  if (posthogInstance) {
    capture(posthogInstance);
    return;
  }
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !isObservabilityEnabled) return;
  if (pending.length >= MAX_PENDING_EVENTS) return;
  pending.push(capture);
}

function drainPending(posthog: PostHog): void {
  const queued = pending;
  pending = [];
  for (const capture of queued) capture(posthog);
}

export function trackEvent<E extends AnalyticsEventName>(
  event: E,
  props: AnalyticsEventProps[E],
): void {
  whenReady((posthog) => posthog.capture(event, props));
}
