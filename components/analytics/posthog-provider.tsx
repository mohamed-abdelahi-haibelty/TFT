"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/src/i18n/navigation";
import { capturePageview, initPostHogClient } from "@/src/lib/analytics-client";

const ADMIN_PATH_PATTERN = /^\/admin(\/|$)/;

/**
 * Renders nothing. Initializes posthog-js after hydration/idle (never blocking
 * LCP) and drives SPA pageview capture.
 *
 * `usePathname` here is next-intl's, so it is locale-*stripped* (`/catalog`,
 * never `/ar/catalog`) — which is why the admin test below carries no locale
 * segment. The URL handed to PostHog is `window.location.href`, the full
 * locale-prefixed one. That asymmetry is intentional: the effect keys off the
 * route identity, the event reports the real address.
 *
 * Search params are part of the dependency because task 17 moved catalog
 * category, sort and price filtering into pure URL state. Keyed on pathname
 * alone, moving from `?sort=price` to `?sort=new` fired no pageview at all,
 * and the entire browse funnel looked like a single view.
 *
 * Autocapture's route exclusions are configured declaratively at init (see
 * `analytics-client.ts`) rather than toggled from here — a toggle driven by an
 * effect is one render behind the navigation that changed the route.
 */
export function PostHogProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    // Staff usage is deliberately not tracked: it answers no product question
    // and spends the free tier's event budget.
    if (ADMIN_PATH_PATTERN.test(pathname)) return;

    let cancelled = false;
    const schedule =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 1);

    schedule(() => {
      if (cancelled) return;
      // Idempotent — the first call loads and initializes posthog-js, every
      // later one resolves from the memoized promise.
      void initPostHogClient().then((posthog) => {
        if (cancelled || !posthog) return;
        capturePageview(window.location.href);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, search]);

  return null;
}
