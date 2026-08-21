import { AlertTriangle, CircleCheck, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { BundleRowActions } from "@/components/admin/bundle-row-actions";
import { Link } from "@/src/i18n/navigation";
import { formatMoney } from "@/src/lib/money";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { listBundles } from "@/src/services/bundles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.bundles" });
  return { title: t("title") };
}

export default async function AdminBundlesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; activeOnly?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const auth = await requireUser();
  if (!auth.ok) return null;

  if (!hasPermission(auth.data, "catalog.view")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const bundlesResult = await listBundles({ search: query.q, activeOnly: query.activeOnly === "on" });
  const bundles = bundlesResult.ok ? bundlesResult.data : [];

  const t = await getTranslations("admin.bundles");
  const isFiltered = Boolean(query.q) || query.activeOnly === "on";
  const canManage = hasPermission(auth.data, "catalog.manage");
  // Creating either kind of item sets its first price (see `createBundle`).
  const canCreate = hasPermission(auth.data, "catalog.pricing");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("subtitle")}</p>
        </div>
        {canCreate ? (
          <Link
            href="/admin/bundles/new"
            className="inline-flex h-11 items-center rounded-xs bg-ink px-5 text-sm font-medium text-paper transition-colors hover:bg-[color-mix(in_oklch,var(--ink),white_10%)]"
          >
            {t("addBundle")}
          </Link>
        ) : null}
      </div>

      <form className="flex flex-wrap items-center gap-3" method="get">
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          placeholder={t("searchPlaceholder")}
          className="h-10 min-w-56 flex-1 rounded-md border border-border px-3.5 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-0"
        />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="activeOnly"
            defaultChecked={query.activeOnly === "on"}
            className="size-5 rounded border-border accent-ink"
          />
          {t("activeOnlyLabel")}
        </label>
        <button
          type="submit"
          className="h-10 rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          {t("filterSubmit")}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">{t("resultCount", { count: bundles.length })}</p>
        {isFiltered ? (
          <Link
            href="/admin/bundles"
            className="text-sm font-medium text-ink underline-offset-4 hover:underline"
          >
            {t("clearFilters")}
          </Link>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-150 border-collapse text-start">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="border-b-2 border-border text-start">
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableName")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tablePrice")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableItems")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableAvailability")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableStatus")}
              </th>
              {canManage ? (
                <th className="sticky end-0 bg-background px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                  {t("tableActions")}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {bundles.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="px-5 py-10 text-center">
                  {isFiltered ? (
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-ink-soft">{t("emptyNoMatches")}</p>
                      <Link
                        href="/admin/bundles"
                        className="inline-flex h-11 items-center rounded-xs border border-border px-5 text-sm font-medium text-ink transition-colors hover:bg-paper"
                      >
                        {t("clearFilters")}
                      </Link>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-ink-soft">{t("emptyNoBundles")}</p>
                      {canManage ? (
                        <Link
                          href="/admin/bundles/new"
                          className="inline-flex h-11 items-center rounded-xs bg-ink px-5 text-sm font-medium text-paper transition-colors hover:bg-[color-mix(in_oklch,var(--ink),white_10%)]"
                        >
                          {t("addBundle")}
                        </Link>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              bundles.map((bundle) => {
                const isOut = bundle.maxSellable === 0;
                const primaryName = locale === "ar" ? bundle.nameAr : bundle.nameFr;
                const secondaryName = locale === "ar" ? bundle.nameFr : bundle.nameAr;
                const limitName = bundle.limitBy
                  ? locale === "ar"
                    ? bundle.limitBy.nameAr
                    : bundle.limitBy.nameFr
                  : "";

                return (
                  <tr
                    key={bundle.id}
                    className="group border-b border-border transition-colors last:border-0 hover:bg-paper"
                  >
                    <td className="px-5 py-4">
                      {canManage ? (
                        <Link
                          href={`/admin/bundles/${bundle.id}`}
                          className="block text-sm font-medium text-nowrap text-ink hover:underline"
                        >
                          {primaryName}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium text-nowrap text-ink">{primaryName}</p>
                      )}
                      {primaryName !== secondaryName ? (
                        <p className="text-xs text-nowrap text-ink-soft">{secondaryName}</p>
                      ) : null}
                      <p className="font-mono text-xs text-ink-soft">{bundle.sku}</p>
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-ink">{formatMoney(bundle.price)}</td>
                    <td className="px-5 py-4 font-mono text-sm text-ink">{bundle.itemCount}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm text-ink">
                          {bundle.maxSellable === null ? t("availabilityUnlimited") : bundle.maxSellable}
                        </span>
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 rounded-xs border border-ink px-2 py-0.5 text-xs font-semibold text-ink">
                            <AlertTriangle className="size-3" aria-hidden="true" />
                            {t("outOfStock")}
                          </span>
                        ) : null}
                      </div>
                      {bundle.limitBy ? (
                        <p className="mt-0.5 text-xs text-ink-soft">{t("limitedBy", { name: limitName })}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={
                          bundle.isActive
                            ? "inline-flex items-center gap-1.5 text-xs font-semibold text-ink"
                            : "inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft"
                        }
                      >
                        {bundle.isActive ? (
                          <CircleCheck className="size-3.5" aria-hidden="true" />
                        ) : (
                          <XCircle className="size-3.5" aria-hidden="true" />
                        )}
                        {bundle.isActive ? t("statusActive") : t("statusInactive")}
                      </span>
                    </td>
                    {canManage ? (
                      <td className="sticky end-0 bg-background px-5 py-4 group-hover:bg-paper">
                        <BundleRowActions bundleId={bundle.id} isActive={bundle.isActive} name={primaryName} />
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
