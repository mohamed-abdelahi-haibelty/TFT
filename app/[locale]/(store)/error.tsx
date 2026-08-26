"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useReportBoundaryError } from "@/hooks/use-report-boundary-error";

/**
 * Keeps a failed storefront page inside the shell — header, cart and footer
 * stay mounted, so a customer mid-basket can navigate instead of landing on
 * the bare locale-level boundary with nothing but a retry button.
 */
export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useReportBoundaryError(error);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="flex size-10 items-center justify-center rounded-full border border-plum text-plum">
        <TriangleAlert className="size-4" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold text-ink">{t("title")}</h2>
      <p className="text-sm text-ink-soft">{t("description")}</p>
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
