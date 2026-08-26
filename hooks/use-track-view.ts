"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/src/lib/analytics-client";

type ViewEvent = "product_viewed" | "bundle_viewed";

/**
 * Reports a detail-page view exactly once per slug.
 *
 * The ref guard is not defensive padding: React 19 double-invokes effects in
 * development, and any parent re-render that remounts this subtree would
 * otherwise report the same view again and inflate the top of the funnel
 * against a metered event budget.
 *
 * Client-side by necessity, not preference. Firing this from the server
 * component that renders the page would either run at revalidate time — once
 * per 15 minutes, no matter how many people looked — or force the route
 * dynamic and wake Neon for every visitor, which is precisely what the task-17
 * caching pass existed to stop.
 */
export function useTrackView(event: ViewEvent, slug: string): void {
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (reported.current === slug) return;
    reported.current = slug;
    trackEvent(event, { slug });
  }, [event, slug]);
}
