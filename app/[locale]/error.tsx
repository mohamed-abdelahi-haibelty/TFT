"use client";

import { useTranslations } from "next-intl";
import { useReportBoundaryError } from "@/hooks/use-report-boundary-error";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useReportBoundaryError(error);

  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-muted-foreground text-sm">{t("description")}</p>
      <button
        type="button"
        onClick={reset}
        className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm"
      >
        {t("retry")}
      </button>
    </div>
  );
}
