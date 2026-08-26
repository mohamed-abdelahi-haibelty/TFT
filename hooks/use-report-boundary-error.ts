"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { shouldReportBoundaryError } from "@/src/lib/observability/should-report-boundary-error";

/**
 * Reports an error caught by an `error.tsx` / `global-error.tsx` boundary,
 * exactly once and only when nothing else already has. The decision itself
 * lives in `shouldReportBoundaryError` so it can be tested without a renderer.
 */
export function useReportBoundaryError(error: Error & { digest?: string }) {
  useEffect(() => {
    if (!shouldReportBoundaryError(error)) return;
    Sentry.captureException(error);
  }, [error]);
}
