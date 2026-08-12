"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "@/src/i18n/navigation";
import { capturePageview, initPostHogClient, setAutocapture } from "@/src/lib/analytics-client";

const ADMIN_PATH_PATTERN = /^\/admin(\/|$)/;

/**
 * Renders nothing. Initializes posthog-js after hydration/idle (never
 * blocking LCP) and drives SPA pageview capture + the storefront/admin
 * autocapture split.
 */
export function PostHogProvider() {
  const pathname = usePathname();
  const isMounting = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const schedule =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 1);

    schedule(() => {
      if (cancelled) return;
      void initPostHogClient().then((posthog) => {
        if (cancelled || !posthog) return;
        const isAdmin = ADMIN_PATH_PATTERN.test(window.location.pathname);
        setAutocapture(!isAdmin);
        if (!isAdmin) capturePageview(window.location.href);
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isMounting.current) {
      isMounting.current = false;
      return;
    }

    const isAdmin = ADMIN_PATH_PATTERN.test(pathname);
    setAutocapture(!isAdmin);
    if (!isAdmin) capturePageview(window.location.href);
  }, [pathname]);

  return null;
}
