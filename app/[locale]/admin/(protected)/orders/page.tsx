import { FilterX } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { OrderRowActions } from "@/components/admin/order-row-actions";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Link } from "@/src/i18n/navigation";
import { formatMoney } from "@/src/lib/money";
import type { OrderStatusValue } from "@/src/lib/order-tracking";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { getOrderStatusCounts, listOrdersAdmin, type OrderListFilters } from "@/src/services/orders";

const STATUS_VALUES: OrderStatusValue[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "arrived",
  "ready",
  "delivered",
  "cancelled",
  "voided",
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.orders" });
  return { title: t("title") };
}

export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    source?: string;
    city?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const auth = await requireUser();
  // The protected layout already redirects, so this is a belt-and-braces
  // path — but it has to lead somewhere. Returning `null` rendered an empty
  // admin shell with no explanation and no way out.
  if (!auth.ok) redirect(`/${locale}/admin/login`);

  if (!hasPermission(auth.data, "orders.view")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const status = STATUS_VALUES.includes(query.status as OrderStatusValue) ? (query.status as OrderStatusValue) : undefined;
  const source = query.source === "web" || query.source === "pos" ? query.source : undefined;
  const city = query.city === "ndb" || query.city === "nkc" || query.city === "other" ? query.city : undefined;
  const page = Math.max(1, Number(query.page) || 1);

  // The badge counts share the list's filters, so they describe the result set
  // the operator is actually looking at rather than shop-wide totals.
  const sharedFilters: Omit<OrderListFilters, "status" | "page"> = {
    source,
    city,
    dateFrom: query.from,
    dateTo: query.to,
    search: query.q,
  };

  const [ordersResult, countsResult] = await Promise.all([
    listOrdersAdmin({ ...sharedFilters, status, page }),
    getOrderStatusCounts(sharedFilters),
  ]);
  const list = ordersResult.ok ? ordersResult.data : null;
  const counts = countsResult.ok ? countsResult.data : null;

  const hasFilters = Boolean(status || source || city || query.from || query.to || query.q);
  const baseQuery: Record<string, string> = {};
  if (query.q) baseQuery.q = query.q;
  if (source) baseQuery.source = source;
  if (city) baseQuery.city = city;
  if (query.from) baseQuery.from = query.from;
  if (query.to) baseQuery.to = query.to;

  const prevHref =
    page > 1 ? { pathname: "/admin/orders" as const, query: { ...baseQuery, status, page: String(page - 1) } } : null;
  const nextHref =
    list && page < list.pageCount
      ? { pathname: "/admin/orders" as const, query: { ...baseQuery, status, page: String(page + 1) } }
      : null;

  const t = await getTranslations("admin.orders");
  const tc = await getTranslations("common");
  const dateFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    numberingSystem: "latn",
  });

  const statusLabels = Object.fromEntries(
    STATUS_VALUES.map((value) => [value, t(`status.${value}`)]),
  ) as Record<OrderStatusValue, string>;

  const allPillClassName = (active: boolean) =>
    active
      ? "inline-flex items-center gap-1.5 rounded-xs bg-ink px-3 py-1.5 text-xs font-semibold text-paper transition-colors hover:bg-ink/90"
      : "inline-flex items-center gap-1.5 rounded-xs border border-border px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-paper";

  const canManageOrders = hasPermission(auth.data, "orders.manage");

  const renderOrderActions = (order: NonNullable<typeof list>["rows"][number]) =>
    !canManageOrders ? null : (
    <OrderRowActions
      orderId={order.id}
      orderCode={order.code}
      source={order.source}
      customerPhone={order.customerPhone}
      locale={locale}
      nextActions={order.nextActions}
      statusLabels={statusLabels}
    />
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t("subtitle")}</p>
      </div>

      {counts ? (
        <nav aria-label={t("filters.statusAll")} className="flex flex-wrap items-center gap-2.5">
          <Link href={{ pathname: "/admin/orders", query: baseQuery }} className={allPillClassName(!status)}>
            {t("filters.statusAll")}
          </Link>
          {STATUS_VALUES.map((value) => (
            <Link
              key={value}
              href={{ pathname: "/admin/orders", query: { ...baseQuery, status: value } }}
              className="rounded-xs transition-opacity hover:opacity-80"
            >
              <OrderStatusBadge
                status={value}
                label={`${t(`status.${value}`)} · ${counts[value]}`}
                className={status === value ? "ring-2 ring-ink ring-offset-2" : ""}
              />
            </Link>
          ))}
        </nav>
      ) : null}

      <form className="flex flex-wrap items-end gap-3" method="get">
        {/* A GET submit replaces the whole query string, and status lives in
            the badge links above rather than in this form — so filtering by
            "pending" and then typing a search silently widened the results
            back out to every order. */}
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          placeholder={t("filters.searchPlaceholder")}
          aria-label={t("filters.searchPlaceholder")}
          className="h-10 min-w-56 flex-1 rounded-md border border-border px-3.5 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-0"
        />
        <Select name="source" defaultValue={source ?? ""}>
          <SelectTrigger size="md" className="w-32">
            <SelectValue placeholder={t("filters.sourceAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("filters.sourceAll")}</SelectItem>
            <SelectItem value="web">{t("source.web")}</SelectItem>
            <SelectItem value="pos">{t("source.pos")}</SelectItem>
          </SelectContent>
        </Select>
        <Select name="city" defaultValue={city ?? ""}>
          <SelectTrigger size="md" className="w-32">
            <SelectValue placeholder={t("filters.cityAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("filters.cityAll")}</SelectItem>
            <SelectItem value="ndb">{t("city.ndb")}</SelectItem>
            <SelectItem value="nkc">{t("city.nkc")}</SelectItem>
            <SelectItem value="other">{t("city.other")}</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          {tc("dateRangeLabel")}
          <DateRangePicker
            locale={locale === "ar" ? "ar" : "fr"}
            fromName="from"
            toName="to"
            defaultFrom={query.from}
            defaultTo={query.to}
            placeholder={tc("dateRangePlaceholder")}
            clearLabel={tc("dateRangeClear")}
            doneLabel={tc("dateRangeDone")}
            ariaLabel={tc("dateRangeLabel")}
            className="h-10"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          {t("filters.submit")}
        </button>
        {hasFilters ? (
          <Link
            href="/admin/orders"
            className="inline-flex h-10 items-center gap-1.5 rounded-xs px-3 text-sm text-ink-soft transition-colors hover:text-ink"
          >
            <FilterX className="size-4" aria-hidden="true" />
            {t("filters.clear")}
          </Link>
        ) : null}
      </form>

      {list ? <p className="text-sm text-ink-soft">{t("resultCount", { count: list.total })}</p> : null}

      {!list ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">{t("error")}</p>
          <Link
            href={{ pathname: "/admin/orders", query: { ...baseQuery, status } }}
            className="inline-flex h-9 items-center rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
          >
            {t("errorRetry")}
          </Link>
        </div>
      ) : list.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-ink-soft">
          {t("empty")}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3 lg:hidden">
            {list.rows.map((order) => (
              <li key={order.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="font-mono text-sm font-medium text-ink hover:underline"
                  >
                    {order.code}
                  </Link>
                  <OrderStatusBadge status={order.status} label={t(`status.${order.status}`)} />
                </div>
                <p className="mt-1 text-sm text-ink">{order.customerName ?? "—"}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
                  <span>{order.city ? t(`city.${order.city}`) : "—"}</span>
                  <span>{t(`source.${order.source}`)}</span>
                  <span className="font-mono tabular-nums">{formatMoney(order.total)}</span>
                  <span>{dateFormatter.format(order.createdAt)}</span>
                </p>
                <div className="mt-3 border-t border-border pt-3">{renderOrderActions(order)}</div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-220 border-collapse text-start">
              <thead>
                <tr className="border-b-2 border-border text-start">
                  <th scope="col" className="px-5 py-3 text-start text-xs font-semibold text-nowrap tracking-wide text-ink-soft">{t("table.code")}</th>
                  <th scope="col" className="px-5 py-3 text-start text-xs font-semibold text-nowrap tracking-wide text-ink-soft">{t("table.customer")}</th>
                  <th scope="col" className="px-5 py-3 text-start text-xs font-semibold text-nowrap tracking-wide text-ink-soft">{t("table.city")}</th>
                  <th scope="col" className="px-5 py-3 text-start text-xs font-semibold text-nowrap tracking-wide text-ink-soft">{t("table.source")}</th>
                  <th scope="col" className="px-5 py-3 text-start text-xs font-semibold text-nowrap tracking-wide text-ink-soft">{t("table.total")}</th>
                  <th scope="col" className="px-5 py-3 text-start text-xs font-semibold text-nowrap tracking-wide text-ink-soft">{t("table.status")}</th>
                  <th scope="col" className="px-5 py-3 text-start text-xs font-semibold text-nowrap tracking-wide text-ink-soft">{t("table.date")}</th>
                  <th scope="col" className="px-5 py-3 text-end text-xs font-semibold text-nowrap tracking-wide text-ink-soft">{t("table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((order) => (
                  <tr key={order.id} className="border-b border-border transition-colors last:border-0 hover:bg-paper">
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-mono text-sm font-medium text-nowrap text-ink hover:underline"
                      >
                        {order.code}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-nowrap text-ink">{order.customerName ?? "—"}</p>
                      <p className="font-mono text-xs text-nowrap text-ink-soft" dir="ltr">
                        {order.customerPhone ?? "—"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-nowrap text-ink-soft">{order.city ? t(`city.${order.city}`) : "—"}</td>
                    <td className="px-5 py-4 text-sm text-nowrap text-ink-soft">{t(`source.${order.source}`)}</td>
                    <td className="px-5 py-4 font-mono text-sm tabular-nums text-ink">{formatMoney(order.total)}</td>
                    <td className="px-5 py-4">
                      <OrderStatusBadge status={order.status} label={t(`status.${order.status}`)} />
                    </td>
                    <td className="px-5 py-4 text-sm text-nowrap text-ink-soft">{dateFormatter.format(order.createdAt)}</td>
                    <td className="px-5 py-4 text-end">{renderOrderActions(order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {list.pageCount > 1 ? (
            <nav
              aria-label={t("title")}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
            >
              <p className="text-sm text-ink-soft">
                {t("pageStatus", { current: list.page, total: list.pageCount })}
              </p>
              <div className="flex gap-2">
                {prevHref ? (
                  <Link
                    href={prevHref}
                    aria-label={t("pagePrev")}
                    className="inline-flex h-9 items-center rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
                  >
                    {t("pagePrev")}
                  </Link>
                ) : null}
                {nextHref ? (
                  <Link
                    href={nextHref}
                    aria-label={t("pageNext")}
                    className="inline-flex h-9 items-center rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
                  >
                    {t("pageNext")}
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
