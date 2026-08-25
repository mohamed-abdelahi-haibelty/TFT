import { AlertTriangle, ArrowRight, Clock3, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Link } from "@/src/i18n/navigation";
import { formatMoney } from "@/src/lib/money";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { getDashboardStats, normalizeMonthKey } from "@/src/services/dashboard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("dashboard") };
}

export default async function AdminDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const auth = await requireUser();
  // The protected layout already redirects, so this is a belt-and-braces
  // path — but it has to lead somewhere. Returning `null` rendered an empty
  // admin shell with no explanation and no way out.
  if (!auth.ok) redirect(`/${locale}/admin/login`);

  // `/admin` is the dashboard, and the dashboard is revenue. An account
  // without `dashboard.view` lands on the first section it was granted
  // instead — the order queue for most staff, but whatever they actually
  // hold, so the landing can never be a page that turns them away.
  if (!hasPermission(auth.data, "dashboard.view")) {
    const landing = firstAllowedSection(auth.data);
    if (landing) redirect(`/${locale}${landing}`);
    return <AdminNoAccess />;
  }

  const month = normalizeMonthKey(query.month);
  const result = await getDashboardStats(month);
  const stats = result.ok ? result.data : null;

  const t = await getTranslations("admin.dashboard");
  const tOrders = await getTranslations("admin.orders");
  const dateFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "fr-FR", {
    dateStyle: "medium",
    numberingSystem: "latn",
  });

  const statusEntries = stats
    ? (Object.entries(stats.statusCounts) as [keyof typeof stats.statusCounts, number][])
    : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">{t("welcome", { name: auth.data.name })}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("subtitle")}</p>
        </div>
        <form className="flex items-end gap-2" method="get">
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
            {t("monthLabel")}
            <DatePicker
              locale={locale === "ar" ? "ar" : "fr"}
              name="month"
              format="month"
              defaultValue={month}
              placeholder={t("monthLabel")}
              clearLabel={t("monthClear")}
              ariaLabel={t("monthLabel")}
              className="w-44"
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
          >
            {t("monthSubmit")}
          </button>
        </form>
      </div>

      {!stats ? (
        <p className="text-sm text-ink-soft">{t("loadError")}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 divide-y divide-border rounded-xl border border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            <div className="flex flex-col justify-between gap-1 p-5 lg:col-span-2">
              <span className="text-xs font-semibold tracking-wide text-ink-soft">{t("revenueLabel")}</span>
              <span className="font-mono text-4xl font-semibold text-ink">{formatMoney(stats.revenue)}</span>
              <span className="text-xs text-ink-soft">{t("revenueHint", { count: stats.deliveredCount })}</span>
            </div>

            <div className="flex flex-col justify-between gap-1 p-5">
              <span className="text-xs font-semibold tracking-wide text-ink-soft">{t("aovLabel")}</span>
              <span className="font-mono text-2xl font-semibold text-ink">{formatMoney(stats.averageOrderValue)}</span>
            </div>

            <div className="flex flex-col gap-2 p-5">
              <span className="text-xs font-semibold tracking-wide text-ink-soft">{t("channelLabel")}</span>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">{tOrders("source.web")}</span>
                <span className="font-mono text-ink">{formatMoney(stats.channelSplit.web.revenue)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">{tOrders("source.pos")}</span>
                <span className="font-mono text-ink">{formatMoney(stats.channelSplit.pos.revenue)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-ink">{t("statusLabel")}</h2>
            <div className="flex flex-wrap gap-2">
              {statusEntries.map(([status, statusCount]) => (
                <Link key={status} href={{ pathname: "/admin/orders", query: { status } }} className="transition-opacity hover:opacity-80">
                  <OrderStatusBadge status={status} label={`${tOrders(`status.${status}`)} · ${statusCount}`} />
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-ink">{t("topProductsTitle")}</h2>
            {stats.topProducts.length === 0 ? (
              <p className="text-sm text-ink-soft">{t("topProductsEmpty")}</p>
            ) : (
              <ol className="flex flex-col divide-y divide-border border-t border-border">
                {stats.topProducts.map((product, index) => (
                  <li key={product.productId} className="flex items-center gap-4 py-3">
                    <span className="w-5 shrink-0 font-mono text-sm text-ink-soft">{index + 1}</span>
                    <span className="flex-1 text-sm text-ink">{locale === "ar" ? product.nameAr : product.nameFr}</span>
                    <span className="font-mono text-sm text-ink-soft">{t("topProductsQty", { qty: product.qty })}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <AlertTriangle className="size-4 text-ink" aria-hidden="true" />
                  {t("lowStockTitle")}
                </h2>
                <Link href="/admin/inventory" className="flex items-center gap-1 text-sm font-medium text-ink hover:underline">
                  {t("viewAll")}
                  <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </div>
              {stats.lowStock.length === 0 ? (
                <p className="text-sm text-ink-soft">{t("lowStockEmpty")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border border-t border-border">
                  {stats.lowStock.map((item) => {
                    const name = locale === "ar" ? item.nameAr : item.nameFr;
                    const variantName = locale === "ar" ? item.variantNameAr : item.variantNameFr;
                    return (
                      <li key={item.key} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink">{variantName ? `${name} — ${variantName}` : name}</p>
                          <p className="font-mono text-xs text-ink-soft">{item.sku}</p>
                        </div>
                        <span className="shrink-0 rounded-xs border border-ink px-2 py-0.5 font-mono text-xs font-semibold text-ink">
                          {item.stockQty}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Clock3 className="size-4 text-ink-soft" aria-hidden="true" />
                  {t("pendingTitle")}
                </h2>
                <Link href="/admin/orders" className="flex items-center gap-1 text-sm font-medium text-ink hover:underline">
                  {t("viewAll")}
                  <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </div>
              {stats.pendingOrders.length === 0 ? (
                <p className="text-sm text-ink-soft">{t("pendingEmpty")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border border-t border-border">
                  {stats.pendingOrders.map((order) => (
                    <li key={order.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/orders/${order.id}`} className="font-mono text-sm font-medium text-ink hover:underline">
                          {order.code}
                        </Link>
                        <p className="truncate text-xs text-ink-soft">
                          {order.customerName ?? "—"} · {dateFormatter.format(new Date(order.createdAt))}
                        </p>
                      </div>
                      <OrderStatusBadge status={order.status} label={tOrders(`status.${order.status}`)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A staff account is created with nothing granted (the owner ticks boxes
 * afterwards), so signing in before that happens is a real, ordinary state —
 * not an error. It gets a screen that names the situation and the one thing
 * that resolves it, rather than an empty shell or a redirect loop.
 */
async function AdminNoAccess() {
  const t = await getTranslations("admin.noAccess");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <span className="mb-1 flex size-12 items-center justify-center rounded-full border border-border text-ink-soft">
        <KeyRound className="size-5" aria-hidden="true" />
      </span>
      <h1 className="font-heading text-xl font-bold text-ink">{t("title")}</h1>
      <p className="max-w-sm text-sm leading-6 text-ink-soft">{t("description")}</p>
    </div>
  );
}
