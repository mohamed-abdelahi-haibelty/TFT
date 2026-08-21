import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/src/i18n/navigation";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { getInventoryItemName, listStockMovements, type StockMovementListItem } from "@/src/services/inventory";
import { stockMovementReason } from "@/src/db/schema";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { MovementsFilterForm } from "@/components/admin/movements-filter-form";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.inventory" });
  return { title: t("movementsTitle") };
}

const MOVEMENT_REASONS = stockMovementReason.enumValues;

function movementItemName(locale: string, movement: StockMovementListItem): string {
  const name = locale === "ar" ? movement.productNameAr : movement.productNameFr;
  const variant = locale === "ar" ? movement.variantNameAr : movement.variantNameFr;
  return variant ? `${name} — ${variant}` : name;
}

// Monochrome delta: incoming stock reads as the resolved/positive tier
// (plain ink), outgoing stock as the calmer soft-ink tier — no color, the
// sign already carries the meaning.
function deltaClass(delta: number): string {
  return delta >= 0 ? "text-ink" : "text-ink-soft";
}

function movementQuery(query: Record<string, string | undefined>, page: number): Record<string, string> {
  const result: Record<string, string> = {};
  if (query.product) result.product = query.product;
  if (query.variant) result.variant = query.variant;
  if (query.reason) result.reason = query.reason;
  if (query.dateFrom) result.dateFrom = query.dateFrom;
  if (query.dateTo) result.dateTo = query.dateTo;
  result.page = String(page);
  return result;
}

function clearItemQuery(query: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  if (query.reason) result.reason = query.reason;
  if (query.dateFrom) result.dateFrom = query.dateFrom;
  if (query.dateTo) result.dateTo = query.dateTo;
  return result;
}

export default async function AdminInventoryMovementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ product?: string; variant?: string; reason?: string; dateFrom?: string; dateTo?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const reason = MOVEMENT_REASONS.find((value) => value === query.reason);

  const auth = await requireUser();
  if (!auth.ok) return null;

  if (!hasPermission(auth.data, "inventory.view")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const [movementsResult, itemNameResult] = await Promise.all([
    listStockMovements({
      productId: query.product,
      variantId: query.variant,
      reason,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page,
    }),
    query.product ? getInventoryItemName(query.product, query.variant) : Promise.resolve(null),
  ]);

  const movements = movementsResult.ok ? movementsResult.data : { items: [], page: 1, pageCount: 1, total: 0 };
  const filteredItem = itemNameResult && itemNameResult.ok ? itemNameResult.data : null;

  const t = await getTranslations("admin.inventory");
  const dateFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    numberingSystem: "latn",
  });

  const filteredItemName = filteredItem
    ? (locale === "ar"
        ? filteredItem.variantNameAr
          ? `${filteredItem.nameAr} — ${filteredItem.variantNameAr}`
          : filteredItem.nameAr
        : filteredItem.variantNameFr
          ? `${filteredItem.nameFr} — ${filteredItem.variantNameFr}`
          : filteredItem.nameFr)
    : query.product;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/inventory" className="text-sm text-ink-soft hover:text-ink">
          {t("movementsBack")}
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold text-ink">{t("movementsTitle")}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t("movementsSubtitle")}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        {query.product ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xs border border-border px-3.5 py-1.5 text-sm text-ink">
            <span>{t("filteredByItem", { name: filteredItemName ?? query.product })}</span>
            <Link
              href={{ pathname: "/admin/inventory/movements", query: clearItemQuery(query) }}
              className="text-ink-soft hover:text-ink hover:underline"
            >
              {t("clearFilter")}
            </Link>
          </div>
        ) : null}

        <MovementsFilterForm
          locale={locale === "ar" ? "ar" : "fr"}
          initialReason={reason ?? ""}
          dateFrom={query.dateFrom ?? ""}
          dateTo={query.dateTo ?? ""}
          productId={query.product}
          variantId={query.variant}
        />
      </div>

      <p className="text-sm text-ink-soft">{t("movementsTotal", { total: movements.total })}</p>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-220 border-collapse text-start">
          <thead>
            <tr className="border-b-2 border-border text-start">
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("tableItem")}</th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("tableDelta")}</th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("tableReason")}</th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("tableOrder")}</th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("tableActor")}</th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("tableNote")}</th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("tableDate")}</th>
            </tr>
          </thead>
          <tbody>
            {movements.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-ink-soft">
                  {t("movementsEmpty")}
                </td>
              </tr>
            ) : (
              movements.items.map((movement) => (
                <tr key={movement.id} className="border-b border-border transition-colors last:border-0 hover:bg-paper">
                  <td className="px-5 py-4">
                    <Link
                      href={{
                        pathname: "/admin/inventory/movements",
                        query: movement.variantId
                          ? { product: movement.productId, variant: movement.variantId }
                          : { product: movement.productId },
                      }}
                      className="text-sm font-medium text-ink hover:underline"
                    >
                      {movementItemName(locale, movement)}
                    </Link>
                    <p className="font-mono text-xs text-ink-soft">{movement.sku}</p>
                  </td>
                  <td className={cn("px-5 py-4 font-mono text-sm", deltaClass(movement.delta))}>
                    {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                  </td>
                  <td className="px-5 py-4 text-sm text-ink-soft">{t(`reason.${movement.reason}`)}</td>
                  <td className="px-5 py-4 text-sm text-ink-soft">
                    {movement.orderCode ? (
                      <Link href={`/admin/orders/${movement.orderId}`} className="font-mono text-ink hover:underline">
                        {movement.orderCode}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-ink-soft">{movement.actorName ?? "—"}</td>
                  <td className="max-w-64 px-5 py-4 text-sm text-ink-soft">{movement.note ?? "—"}</td>
                  <td className="px-5 py-4 text-sm text-ink-soft">{dateFormatter.format(movement.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden">
        <ul className="flex flex-col gap-3">
          {movements.items.length === 0 ? (
            <li className="rounded-lg border border-border px-4 py-8 text-center text-sm text-ink-soft">{t("movementsEmpty")}</li>
          ) : (
            movements.items.map((movement) => (
              <li key={movement.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={{
                        pathname: "/admin/inventory/movements",
                        query: movement.variantId
                          ? { product: movement.productId, variant: movement.variantId }
                          : { product: movement.productId },
                      }}
                      className="text-sm font-medium text-ink hover:underline"
                    >
                      {movementItemName(locale, movement)}
                    </Link>
                    <p className="mt-0.5 font-mono text-xs text-ink-soft">{movement.sku}</p>
                  </div>
                  <span className={cn("shrink-0 font-mono text-sm", deltaClass(movement.delta))}>
                    {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-ink-soft">{t("tableReason")}</dt>
                    <dd>{t(`reason.${movement.reason}`)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-ink-soft">{t("tableDate")}</dt>
                    <dd>{dateFormatter.format(movement.createdAt)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-ink-soft">{t("tableOrder")}</dt>
                    <dd>
                      {movement.orderCode ? (
                        <Link href={`/admin/orders/${movement.orderId}`} className="font-mono text-ink hover:underline">
                          {movement.orderCode}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-ink-soft">{t("tableActor")}</dt>
                    <dd>{movement.actorName ?? "—"}</dd>
                  </div>
                  {movement.note ? (
                    <div className="col-span-2 flex flex-col gap-0.5">
                      <dt className="text-xs text-ink-soft">{t("tableNote")}</dt>
                      <dd>{movement.note}</dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            ))
          )}
        </ul>
      </div>

      {movements.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-4">
          <Link
            href={{
              pathname: "/admin/inventory/movements",
              query: movementQuery(query, Math.max(1, page - 1)),
            }}
            aria-disabled={page <= 1}
            tabIndex={page <= 1 ? -1 : undefined}
            className={cn(
              "text-sm font-medium",
              page <= 1 ? "pointer-events-none text-ink-soft/40" : "text-ink hover:underline",
            )}
          >
            {t("pagePrev")}
          </Link>
          <span className="text-sm text-ink-soft">{t("pageStatus", { page: movements.page, pageCount: movements.pageCount })}</span>
          <Link
            href={{
              pathname: "/admin/inventory/movements",
              query: movementQuery(query, Math.min(movements.pageCount, page + 1)),
            }}
            aria-disabled={page >= movements.pageCount}
            tabIndex={page >= movements.pageCount ? -1 : undefined}
            className={cn(
              "text-sm font-medium",
              page >= movements.pageCount ? "pointer-events-none text-ink-soft/40" : "text-ink hover:underline",
            )}
          >
            {t("pageNext")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
