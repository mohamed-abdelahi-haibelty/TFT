"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { localized } from "@/src/lib/locale-text";
import { Link } from "@/src/i18n/navigation";
import { adjustStockAction, type AdjustStockState } from "@/src/services/inventory-actions";
import type { InventoryItem } from "@/src/services/inventory";

type AdjustMode = "delta" | "absolute";
const ADJUST_REASONS = ["restock", "correction", "manual_adjust"] as const;

function itemDisplayName(locale: string, item: InventoryItem): string {
  const name = locale === "ar" ? item.nameAr : item.nameFr;
  const variant = locale === "ar" ? item.variantNameAr : item.variantNameFr;
  return variant ? `${name} — ${variant}` : name;
}

function StockBadge({ item, t }: { item: InventoryItem; t: ReturnType<typeof useTranslations> }) {
  const isOut = item.stockQty <= 0;
  const isLow = !isOut && item.stockQty <= item.lowStockThreshold;
  if (!isOut && !isLow) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-xs border border-ink px-2 py-0.5 text-xs font-semibold text-ink">
      <AlertTriangle className="size-3" aria-hidden="true" />
      {isOut ? t("outOfStock") : t("lowStock")}
    </span>
  );
}

function RowActions({
  item,
  expanded,
  onToggle,
  canAdjust,
  t,
}: {
  item: InventoryItem;
  expanded: boolean;
  onToggle: () => void;
  canAdjust: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  // Without `inventory.adjust` the row is read-only: the list still shows
  // quantities and the movement history, there is just nothing to open.
  if (!canAdjust) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`adjust-${item.key}`}
        className="inline-flex min-h-11 items-center rounded-md px-2.5 text-sm font-medium text-ink hover:underline"
      >
        {expanded ? t("adjustCancel") : t("adjustButton")}
      </button>
      <Link
        href={{
          pathname: "/admin/inventory/movements",
          query: item.variantId ? { product: item.productId, variant: item.variantId } : { product: item.productId },
        }}
        className="inline-flex min-h-11 items-center rounded-md px-2.5 text-sm font-medium text-ink-soft hover:text-ink hover:underline"
      >
        {t("viewHistory")}
      </Link>
    </div>
  );
}

function AdjustForm({
  item,
  onDone,
  qtyInputRef,
  panelId,
  className,
}: {
  item: InventoryItem;
  onDone: () => void;
  qtyInputRef: (el: HTMLInputElement | null) => void;
  panelId?: string;
  className?: string;
}) {
  const t = useTranslations("admin.inventory");
  const locale = useLocale();
  const { toast } = useToast();
  const [mode, setMode] = useState<AdjustMode>("delta");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<string>("restock");
  const [state, formAction, pending] = useActionState<AdjustStockState, FormData>(
    adjustStockAction.bind(null, item.productId, item.variantId),
    null,
  );

  const name = itemDisplayName(locale, item);

  useEffect(() => {
    if (state?.ok) {
      onDone();
      toast(t("adjustSuccess", { name, stock: state.data.stockQty }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const current = item.stockQty;
  const reasonItems = {
    restock: t("reason.restock"),
    correction: t("reason.correction"),
    manual_adjust: t("reason.manual_adjust"),
  };
  const parsed = value === "" ? Number.NaN : Number(value);
  const rawDelta = Number.isFinite(parsed) ? (mode === "delta" ? parsed : parsed - current) : null;
  const next = rawDelta === null ? current : current + rawDelta;
  const noChange = rawDelta === 0;
  const invalidReason = rawDelta !== null && rawDelta < 0 && reason === "restock";
  const canSubmit = !pending && rawDelta !== null && !noChange && !invalidReason;

  function switchMode(nextMode: AdjustMode) {
    setMode(nextMode);
    setValue(nextMode === "absolute" ? String(item.stockQty) : "");
  }

  return (
    <form id={panelId} action={formAction} className={cn("flex flex-col gap-3 rounded-lg border border-border bg-paper p-4", className)}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("modeDelta")}>
        <button
          type="button"
          aria-pressed={mode === "delta"}
          onClick={() => switchMode("delta")}
          className={cn(
            "h-11 rounded-xs border px-4 text-sm font-medium transition-colors",
            mode === "delta" ? "border-ink bg-ink text-paper" : "border-border text-ink hover:bg-background",
          )}
        >
          {t("modeDelta")}
        </button>
        <button
          type="button"
          aria-pressed={mode === "absolute"}
          onClick={() => switchMode("absolute")}
          className={cn(
            "h-11 rounded-xs border px-4 text-sm font-medium transition-colors",
            mode === "absolute" ? "border-ink bg-ink text-paper" : "border-border text-ink hover:bg-background",
          )}
        >
          {t("modeAbsolute")}
        </button>
      </div>
      <input type="hidden" name="mode" value={mode} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          {mode === "delta" ? t("deltaValueLabel") : t("absoluteValueLabel")}
          <input
            ref={qtyInputRef}
            type="number"
            name="value"
            required
            step={1}
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-11 w-32 rounded-md border border-border px-2.5 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/30"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          {t("reasonLabel")}
          <Select name="reason" value={reason} onValueChange={(value) => setReason(value ?? "restock")} items={reasonItems}>
            <SelectTrigger size="lg" className="w-40" aria-label={t("reasonLabel")}>
              <SelectValue placeholder={t("reasonLabel")} />
            </SelectTrigger>
            <SelectContent>
              {ADJUST_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`reason.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-ink-soft">
          {t("noteLabel")}
          <input
            type="text"
            name="note"
            maxLength={500}
            placeholder={t("notePlaceholder")}
            className="h-11 rounded-md border border-border px-2.5 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/30"
          />
        </label>
      </div>

      {rawDelta !== null ? (
        <p className="text-sm font-medium text-ink">{t("adjustPreview", { current, next, delta: (rawDelta > 0 ? "+" : "") + rawDelta })}</p>
      ) : null}
      {invalidReason ? <p className="text-sm font-medium text-plum">{t("reasonNegativeHint")}</p> : null}
      {state && !state.ok ? (
        <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-plum">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {state.error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canSubmit} className="h-11 rounded-xs px-5">
          {pending ? t("adjustSubmitting") : t("adjustSubmit")}
        </Button>
        <Button type="button" variant="secondary" className="h-11 rounded-xs" onClick={onDone}>
          {t("adjustCancel")}
        </Button>
      </div>
    </form>
  );
}

function InventoryRow({
  item,
  expanded,
  onToggle,
  canAdjust,
  rowRef,
  qtyInputRef,
}: {
  item: InventoryItem;
  expanded: boolean;
  onToggle: () => void;
  canAdjust: boolean;
  rowRef: (el: HTMLElement | null) => void;
  qtyInputRef: (el: HTMLInputElement | null) => void;
}) {
  const t = useTranslations("admin.inventory");
  const locale = useLocale();
  const name = itemDisplayName(locale, item);
  const category = localized(locale, item.categoryNameAr, item.categoryNameFr);

  return (
    <>
      <tr ref={rowRef} className="border-b border-border transition-colors last:border-0 hover:bg-paper">
        <td className="px-5 py-4">
          <p className="text-sm font-medium text-ink">{name}</p>
          <p className="font-mono text-xs text-ink-soft">{item.sku}</p>
        </td>
        <td className="px-5 py-4 text-sm text-ink-soft">{category}</td>
        <td className="px-5 py-4">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm text-ink">{item.stockQty}</span>
            <StockBadge item={item} t={t} />
          </div>
        </td>
        <td className="px-5 py-4">
          <RowActions item={item} expanded={expanded} onToggle={onToggle} canAdjust={canAdjust} t={t} />
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={4} className="px-5 pb-4">
            <AdjustForm item={item} onDone={onToggle} qtyInputRef={qtyInputRef} panelId={`adjust-${item.key}`} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function InventoryView({
  items,
  categories,
  query,
  canAdjust,
}: {
  items: InventoryItem[];
  categories: { id: string; nameAr: string; nameFr: string }[];
  query: { q?: string; category?: string; lowStockOnly?: string };
  canAdjust: boolean;
}) {
  const t = useTranslations("admin.inventory");
  const locale = useLocale();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const qtyInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    if (!expandedKey) return;
    const row = rowRefs.current.get(expandedKey);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    const input = qtyInputRefs.current.get(expandedKey);
    input?.focus({ preventScroll: true });
  }, [expandedKey]);

  const setRowRef = (key: string) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(key, el);
    else rowRefs.current.delete(key);
  };
  const setQtyInputRef = (key: string) => (el: HTMLInputElement | null) => {
    if (el) qtyInputRefs.current.set(key, el);
    else qtyInputRefs.current.delete(key);
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t("subtitle")}</p>
      </div>

      <form className="flex flex-wrap items-center gap-3" method="get">
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          placeholder={t("searchPlaceholder")}
          className="h-11 min-w-56 flex-1 rounded-md border border-border px-3.5 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/30"
        />
        <Select
          name="category"
          defaultValue={query.category ?? ""}
          items={{ "": t("categoryFilterAll"), ...Object.fromEntries(categories.map((category) => [category.id, localized(locale, category.nameAr, category.nameFr)])) }}
        >
          <SelectTrigger size="lg" className="w-44" aria-label={t("categoryFilterAll")}>
            <SelectValue placeholder={t("categoryFilterAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("categoryFilterAll")}</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {localized(locale, category.nameAr, category.nameFr)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 px-1 py-2 text-sm text-ink">
          <input
            type="checkbox"
            name="lowStockOnly"
            defaultChecked={query.lowStockOnly === "on"}
            className="size-5 rounded border-border accent-ink"
          />
          {t("lowStockOnlyLabel")}
        </label>
        <button
          type="submit"
          className="h-11 rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          {t("filterSubmit")}
        </button>
      </form>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-160 border-collapse text-start">
          <thead>
            <tr className="border-b-2 border-border text-start">
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("tableName")}</th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("tableCategory")}</th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("tableStock")}</th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">{t("tableActions")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-ink-soft">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <InventoryRow
                  key={item.key}
                  item={item}
                  expanded={expandedKey === item.key}
                  onToggle={() => setExpandedKey((current) => (current === item.key ? null : item.key))}
                  canAdjust={canAdjust}
                  rowRef={setRowRef(item.key)}
                  qtyInputRef={setQtyInputRef(item.key)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden">
        <ul className="flex flex-col gap-3">
          {items.length === 0 ? (
            <li className="rounded-lg border border-border px-4 py-8 text-center text-sm text-ink-soft">{t("empty")}</li>
          ) : (
            items.map((item) => {
              const expanded = expandedKey === item.key;
              const name = itemDisplayName(locale, item);
              const category = localized(locale, item.categoryNameAr, item.categoryNameFr);
              return (
                <li key={item.key} ref={setRowRef(item.key)} className="rounded-lg border border-border">
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{name}</p>
                      <p className="mt-0.5 font-mono text-xs text-ink-soft">{item.sku}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                      <span className="font-mono text-sm text-ink">{item.stockQty}</span>
                      <StockBadge item={item} t={t} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-1">
                    <span className="px-1.5 text-sm text-ink-soft">{category}</span>
                    <RowActions
                      item={item}
                      expanded={expanded}
                      onToggle={() => setExpandedKey((current) => (current === item.key ? null : item.key))}
                      canAdjust={canAdjust}
                      t={t}
                    />
                  </div>
                  {expanded ? (
                    <div className="border-t border-border p-3">
                      <AdjustForm
                        item={item}
                        onDone={() => setExpandedKey((current) => (current === item.key ? null : item.key))}
                        qtyInputRef={setQtyInputRef(item.key)}
                        panelId={`adjust-${item.key}`}
                        className="border-0 bg-transparent p-0"
                      />
                    </div>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
