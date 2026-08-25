"use client";

import { useActionState, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localized } from "@/src/lib/locale-text";
import { formatMoney } from "@/src/lib/money";
import { addOrderItemAction, removeOrderItemAction, updateOrderItemQtyAction } from "@/src/services/order-actions";
import type { OrderItemDetail, OrderItemOption } from "@/src/services/orders";

const fieldClassName =
  "h-9 rounded-md border border-border px-2.5 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/30";

function OrderItemRow({
  orderId,
  item,
  editable,
  t,
}: {
  orderId: string;
  item: OrderItemDetail;
  editable: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const [qty, setQty] = useState(item.qty);
  const [qtyState, qtyFormAction, qtyPending] = useActionState(
    updateOrderItemQtyAction.bind(null, orderId, item.id),
    null,
  );

  // A refused update left the input showing the attempted quantity while the
  // server still held the old one — and the Save button enabled, because the
  // two disagreed. Snap back to what was actually stored.
  //
  // Adjusted during render rather than in an effect: this is React's own
  // "adjusting state when a prop changes" pattern, and it avoids the extra
  // commit-then-rerender an effect would cost on every failed save.
  const [seenQtyState, setSeenQtyState] = useState(qtyState);
  if (qtyState !== seenQtyState) {
    setSeenQtyState(qtyState);
    if (qtyState && !qtyState.ok) setQty(item.qty);
  }
  const [removeState, removeFormAction, removePending] = useActionState(
    removeOrderItemAction.bind(null, orderId, item.id),
    null,
  );

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 text-sm text-ink">{item.nameSnapshot}</td>
      <td className="px-4 py-3 font-mono text-sm text-ink">{formatMoney(item.unitPrice)}</td>
      <td className="px-4 py-3">
        {editable ? (
          <form action={qtyFormAction} className="flex items-center gap-2">
            <input
              type="number"
              name="qty"
              min={1}
              max={99}
              value={qty}
              onChange={(event) => setQty(Number(event.target.value))}
              className={`${fieldClassName} w-16`}
            />
            <Button type="submit" size="sm" variant="secondary" disabled={qtyPending || qty === item.qty} className="rounded-xs">
              {t("saveQty")}
            </Button>
          </form>
        ) : (
          <span className="font-mono text-sm text-ink">{item.qty}</span>
        )}
        {qtyState && !qtyState.ok ? <p className="mt-1 max-w-56 text-xs font-medium text-plum">{qtyState.error.message}</p> : null}
      </td>
      <td className="px-4 py-3 font-mono text-sm text-ink">{formatMoney(item.unitPrice * item.qty)}</td>
      {editable ? (
        <td className="px-4 py-3">
          <form action={removeFormAction}>
            <Button type="submit" size="sm" variant="destructive" disabled={removePending} className="rounded-xs">
              {t("removeItem")}
            </Button>
          </form>
          {removeState && !removeState.ok ? <p className="mt-1 max-w-56 text-xs font-medium text-plum">{removeState.error.message}</p> : null}
        </td>
      ) : null}
    </tr>
  );
}

function AddItemForm({
  orderId,
  options,
  t,
}: {
  orderId: string;
  options: OrderItemOption[];
  t: ReturnType<typeof useTranslations>;
}) {
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(addOrderItemAction.bind(null, orderId), null);
  const [kind, setKind] = useState<"product" | "bundle">("product");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const ofKind = useMemo(() => options.filter((option) => option.kind === kind), [options, kind]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return ofKind;
    return ofKind.filter(
      (option) => option.nameFr.toLowerCase().includes(term) || option.nameAr.includes(term) || option.sku.toLowerCase().includes(term),
    );
  }, [ofKind, search]);

  const selected = options.find((option) => option.id === selectedId);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
      <input type="hidden" name="kind" value={kind} />
      {/* A variant option carries its own `variantId` alongside its parent's
          `productId`, so the line decrements the variant's own stock and its
          snapshot names the colour or size the customer chose. */}
      <input type="hidden" name="productId" value={selected?.productId ?? ""} />
      <input type="hidden" name="variantId" value={selected?.variantId ?? ""} />
      <input type="hidden" name="bundleId" value={selected?.bundleId ?? ""} />

      <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
        {t("addItem.kindLabel")}
        <Select
          value={kind}
          onValueChange={(value) => {
            setKind((value ?? "product") as "product" | "bundle");
            setSelectedId("");
          }}
        >
          <SelectTrigger size="md" className="w-32">
            <SelectValue placeholder={t("addItem.kindLabel")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="product">{t("addItem.kindProduct")}</SelectItem>
            <SelectItem value="bundle">{t("addItem.kindBundle")}</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
        {t("addItem.searchLabel")}
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("addItem.searchPlaceholder")}
          className={`${fieldClassName} min-w-40`}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
        {t("addItem.itemLabel")}
        <Select value={selectedId} onValueChange={(value) => setSelectedId(value ?? "")}>
          <SelectTrigger size="md" className="min-w-48 w-full flex-1">
            <SelectValue placeholder={t("addItem.itemLabel")} />
          </SelectTrigger>
          <SelectContent>
            {filtered.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {localized(locale, option.nameAr, option.nameFr)} — {formatMoney(option.price)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
        {t("addItem.qtyLabel")}
        <input type="number" name="qty" min={1} max={99} defaultValue={1} className={`${fieldClassName} w-16`} />
      </label>

      <Button type="submit" disabled={pending || !selectedId} className="rounded-xs">
        {t("addItem.submit")}
      </Button>

      {state && !state.ok ? <p className="w-full text-sm font-medium text-plum">{state.error.message}</p> : null}
    </form>
  );
}

export function OrderItemsEditor({
  orderId,
  items,
  editable,
  options,
  optionsUnavailable = false,
}: {
  orderId: string;
  items: OrderItemDetail[];
  editable: boolean;
  options: OrderItemOption[];
  /** The picker data failed to load — say so rather than showing an empty dropdown. */
  optionsUnavailable?: boolean;
}) {
  const t = useTranslations("admin.orders.detail");

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-lg font-semibold text-ink">{t("itemsTitle")}</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-140 border-collapse text-start">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="px-4 py-2.5 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("itemName")}</th>
              <th className="px-4 py-2.5 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("itemPrice")}</th>
              <th className="px-4 py-2.5 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("itemQty")}</th>
              <th className="px-4 py-2.5 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("itemSubtotal")}</th>
              {editable ? <th className="px-4 py-2.5" /> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <OrderItemRow key={item.id} orderId={orderId} item={item} editable={editable} t={t} />
            ))}
          </tbody>
        </table>
      </div>

      {editable ? (
        optionsUnavailable ? (
          <p className="border-t border-border pt-4 text-sm text-plum" role="alert">
            {t("addItem.unavailable")}
          </p>
        ) : (
          <AddItemForm orderId={orderId} options={options} t={t} />
        )
      ) : null}
    </div>
  );
}
