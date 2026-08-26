"use client";

import { useReportBoundaryError } from "@/hooks/use-report-boundary-error";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportBoundaryError(error);

  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm">
          حدث خطأ غير متوقع. / Une erreur inattendue est survenue.
        </p>
        <button
          type="button"
          onClick={reset}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm"
        >
          إعادة المحاولة / Réessayer
        </button>
      </body>
    </html>
  );
}
