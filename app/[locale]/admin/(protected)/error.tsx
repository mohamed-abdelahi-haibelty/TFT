"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useReportBoundaryError } from "@/hooks/use-report-boundary-error";

/**
 * Nested under the protected layout, so a thrown admin page keeps the nav and
 * the signed-in shell around it. Without this the nearest boundary was the
 * locale-level one, which unmounts the whole admin chrome and leaves a cashier
 * mid-shift with no way back to the register but the browser's back button.
 *
 * This is for *thrown* errors only. A failed read that comes back as a
 * `ServiceResult` still renders `AdminLoadError` in place, which is the far
 * more common case and keeps the rest of the page usable.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useReportBoundaryError(error);

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full border border-plum text-plum">
        <TriangleAlert className="size-4" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-ink">{t("title")}</p>
      <p className="max-w-sm text-sm text-ink-soft">{t("description")}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-1 inline-flex h-9 items-center rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
      >
        {t("retry")}
      </button>
    </div>
  );
}
