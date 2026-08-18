import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { OrderActionsPanel } from "@/components/admin/order-actions-panel";
import { OrderItemsEditor } from "@/components/admin/order-items-editor";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { Link } from "@/src/i18n/navigation";
import { formatMoney } from "@/src/lib/money";
import type { OrderStatusValue } from "@/src/lib/order-tracking";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { listBundles } from "@/src/services/bundles";
import { getOrderAdmin, type OrderEventDetail } from "@/src/services/orders";
import { listProducts } from "@/src/services/products";

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

const EDITABLE_STATUSES: OrderStatusValue[] = ["pending", "confirmed", "preparing"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "admin.orders" });
  const result = await getOrderAdmin(id);
  return { title: result.ok ? result.data.code : t("title") };
}

function eventDescription(
  event: OrderEventDetail,
  statusLabels: Record<OrderStatusValue, string>,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case "created":
      return t("events.created");
    case "status_changed": {
      const from = typeof payload.from === "string" ? statusLabels[payload.from as OrderStatusValue] : "?";
      const to = typeof payload.to === "string" ? statusLabels[payload.to as OrderStatusValue] : "?";
      return t("events.statusChanged", { from, to });
    }
    case "items_edited": {
      const after = payload.after as { nameSnapshot?: string; qty?: number } | null;
      const before = payload.before as { qty?: number } | null;
      if (!before && after) return t("events.itemAdded", { name: after.nameSnapshot ?? "", qty: after.qty ?? 0 });
      if (before && after) return t("events.itemQtyChanged", { before: before.qty ?? 0, after: after.qty ?? 0 });
      return t("events.itemsEdited");
    }
    case "line_removed": {
      const before = payload.before as { nameSnapshot?: string } | null;
      const base = t("events.lineRemoved", { name: before?.nameSnapshot ?? "" });
      // Only a POS sale's buffered removals carry a `reason` (task 14) — a
      // web order's admin-side line removal (task 13) never sets one.
      const reason = payload.reason === "wrong_scan" || payload.reason === "changed_mind" ? payload.reason : null;
      return reason ? `${base} — ${t(`events.removeReason.${reason}`)}` : base;
    }
    case "cancelled": {
      const reason = typeof payload.reason === "string" ? payload.reason : "";
      return t("events.cancelled", { reason });
    }
    case "voided": {
      const reason = typeof payload.reason === "string" ? payload.reason : "";
      return t("events.voided", { reason });
    }
    case "note_added":
      return t("events.noteAdded");
    default:
      return event.type;
  }
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const auth = await requireUser();
  if (!auth.ok) return null;

  if (!hasPermission(auth.data, "orders.view")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const [orderResult, productsResult, bundlesResult] = await Promise.all([
    getOrderAdmin(id),
    listProducts({ activeOnly: true }),
    listBundles({ activeOnly: true }),
  ]);
  if (!orderResult.ok) notFound();

  const order = orderResult.data;
  const t = await getTranslations("admin.orders");
  const tDetail = await getTranslations("admin.orders.detail");
  const tStatus = await getTranslations("admin.orders.status");

  const statusLabels = Object.fromEntries(STATUS_VALUES.map((value) => [value, tStatus(value)])) as Record<
    OrderStatusValue,
    string
  >;

  const dateFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    numberingSystem: "latn",
  });

  const productOptions = (productsResult.ok ? productsResult.data : []).map((product) => ({
    id: product.id,
    nameAr: product.nameAr,
    nameFr: product.nameFr,
    price: product.discountPrice ?? product.price,
    sku: product.sku,
  }));
  const bundleOptions = (bundlesResult.ok ? bundlesResult.data : []).map((bundle) => ({
    id: bundle.id,
    nameAr: bundle.nameAr,
    nameFr: bundle.nameFr,
    price: bundle.price,
    sku: bundle.sku,
  }));

  // Two independent conditions, deliberately ANDed here rather than inside
  // the editor: the order's status has to allow edits at all, and this
  // operator has to hold `orders.manage`.
  const editable =
    EDITABLE_STATUSES.includes(order.status) && hasPermission(auth.data, "orders.manage");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/orders" className="text-sm text-ink-soft hover:text-ink">
          {t("back")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-ink">{order.code}</h1>
          <OrderStatusBadge status={order.status} label={statusLabels[order.status]} />
        </div>
        <p className="mt-1 text-sm text-ink-soft">{dateFormatter.format(order.createdAt)}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <div>
            <h2 className="font-heading text-lg font-semibold text-ink">{tDetail("customerTitle")}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ink-soft">{tDetail("phoneLabel")}</dt>
                <dd className="font-mono text-ink" dir="ltr">
                  {order.customerPhone ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-soft">{tDetail("cityLabel")}</dt>
                <dd className="text-ink">{order.city ? t(`city.${order.city}`) : "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">{tDetail("deliveryLabel")}</dt>
                <dd className="text-ink">
                  {order.delivery === "bus" ? tDetail("deliveryBus") : order.delivery === "pickup" ? tDetail("deliveryPickup") : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-soft">{tDetail("sourceLabel")}</dt>
                <dd className="text-ink">{t(`source.${order.source}`)}</dd>
              </div>
              {order.busCompany ? (
                <div>
                  <dt className="text-ink-soft">{tDetail("busCompanyLabel")}</dt>
                  <dd className="text-ink">
                    {order.busCompany}
                    {order.busNote ? ` — ${order.busNote}` : ""}
                  </dd>
                </div>
              ) : null}
              {order.note ? (
                <div className="col-span-2">
                  <dt className="text-ink-soft">{tDetail("noteLabel")}</dt>
                  <dd className="text-ink">{order.note}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <OrderItemsEditor orderId={order.id} items={order.items} editable={editable} products={productOptions} bundles={bundleOptions} />

          <div className="flex flex-col items-end gap-1 text-sm">
            <p className="text-ink-soft">
              {tDetail("subtotalLabel")}: <span className="font-mono text-ink">{formatMoney(order.subtotal)}</span>
            </p>
            {order.discountTotal > 0 ? (
              <p className="text-ink-soft">
                {tDetail("discountLabel")}: <span className="font-mono text-ink">-{formatMoney(order.discountTotal)}</span>
              </p>
            ) : null}
            <p className="text-base font-semibold text-ink">
              {tDetail("totalLabel")}: <span className="font-mono">{formatMoney(order.total)}</span>
            </p>
          </div>

          <div>
            <h2 className="font-heading text-lg font-semibold text-ink">{tDetail("events.title")}</h2>
            <ol className="mt-3 flex flex-col gap-3 border-s-2 border-border ps-4">
              {order.events.map((event) => (
                <li key={event.id} className="text-sm">
                  <p className="text-ink">{eventDescription(event, statusLabels, tDetail)}</p>
                  <p className="text-xs text-ink-soft">
                    {dateFormatter.format(event.createdAt)}
                    {event.actorName ? ` · ${event.actorName}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div>
          <OrderActionsPanel
            orderId={order.id}
            status={order.status}
            nextActions={order.nextActions}
            locale={locale}
            orderCode={order.code}
            customerPhone={order.customerPhone}
            busCompany={order.busCompany}
            statusLabels={statusLabels}
            permissions={{
              canManage: hasPermission(auth.data, "orders.manage"),
              canCancel: hasPermission(auth.data, "orders.cancel"),
              canVoid: hasPermission(auth.data, "pos.void"),
            }}
          />
        </div>
      </div>
    </div>
  );
}
