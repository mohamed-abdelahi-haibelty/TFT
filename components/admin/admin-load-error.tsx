import { TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/src/i18n/navigation";
import type { ServiceError } from "@/src/lib/errors";

/**
 * What a failed read looks like. Admin pages used to write
 * `result.ok ? result.data : []`, which turned a `FORBIDDEN`, an `INTERNAL`,
 * or a dropped database connection into the page's ordinary "nothing here
 * yet" copy — so a cashier opening the register during a blip concluded the
 * catalog had been wiped.
 *
 * The orders list already had the right shape (an error line plus a retry);
 * this is that, extracted so every other page can say the same thing.
 */
export async function AdminLoadError({
  error,
  retryHref,
}: {
  error?: ServiceError;
  /** Where "try again" points — usually the current route. */
  retryHref?: React.ComponentProps<typeof Link>["href"];
}) {
  const t = await getTranslations("admin.loadError");

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full border border-plum text-plum">
        <TriangleAlert className="size-4" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-ink">{t("title")}</p>
      <p className="max-w-sm text-sm text-ink-soft">{error?.message ?? t("description")}</p>
      {retryHref ? (
        <Link
          href={retryHref}
          className="mt-1 inline-flex h-9 items-center rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          {t("retry")}
        </Link>
      ) : null}
    </div>
  );
}
