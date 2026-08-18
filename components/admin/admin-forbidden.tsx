import type { ComponentProps } from "react";
import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/src/i18n/navigation";

/**
 * The screen a staff account gets when it opens a page it has not been
 * granted. Extracted from the Users page, which was the only page that had
 * one back when "admin-only" was the whole rule — now every gated page shows
 * the same thing, so being turned away always looks the same.
 *
 * `backHref` is the first section the account *can* open, so the way out is
 * never a link into another wall.
 */
export async function AdminForbidden({
  backHref,
}: {
  backHref?: ComponentProps<typeof Link>["href"];
}) {
  const t = await getTranslations("admin.forbidden");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-red-bg text-red-text">
        <ShieldAlert className="size-5" aria-hidden="true" />
      </span>
      <h1 className="font-heading text-xl font-bold text-ink">{t("title")}</h1>
      <p className="max-w-sm text-sm text-ink-soft">{t("description")}</p>
      {backHref ? (
        <Link
          href={backHref}
          className="mt-3 inline-flex h-10 items-center rounded-full border border-border px-5 text-sm font-medium text-ink transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-muted active:translate-y-0"
        >
          {t("back")}
        </Link>
      ) : null}
    </div>
  );
}
