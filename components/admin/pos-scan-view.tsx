"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Minus, Package, Plus, RotateCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildCloudinaryUrl } from "@/src/lib/cloudinary";
import { formatMoney } from "@/src/lib/money";
import { playScanError, playScanSuccess } from "@/src/lib/pos-sound";
import { useRouter } from "@/src/i18n/navigation";
import { completeSaleAction, resolvePosScanAction } from "@/src/services/pos-actions";
import type { PosCategory, PosGridItem, PosResolvedLine } from "@/src/services/pos";

type PaymentMethod = "cash" | "bankily" | "masrvi" | "sedad" | "other";
const PAYMENT_METHODS: PaymentMethod[] = ["cash", "bankily", "masrvi", "sedad", "other"];
const PAYMENT_METHOD_KEYS: Record<PaymentMethod, "paymentCash" | "paymentBankily" | "paymentMasrvi" | "paymentSedad" | "paymentOther"> = {
  cash: "paymentCash",
  bankily: "paymentBankily",
  masrvi: "paymentMasrvi",
  sedad: "paymentSedad",
  other: "paymentOther",
};
const REMOVE_REASONS = ["wrong_scan", "changed_mind"] as const;

type CartLine = {
  key: string;
  kind: "product" | "bundle";
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  name: string;
  unitPrice: number;
  promo: boolean;
  qty: number;
  stockQty: number | null;
  allowBackorder: boolean;
  overridden: boolean;
};

type RemovedLine = { nameSnapshot: string; unitPrice: number; qty: number; reason: (typeof REMOVE_REASONS)[number] };

type PendingOverride = PosResolvedLine & { existingKey?: string; targetQty?: number };

type ScanFeedback =
  | { type: "success"; name: string; id: number }
  | { type: "not_found"; sku: string; id: number }
  | { type: "inactive"; name: string; id: number }
  | { type: "stock_warning"; pending: PendingOverride; id: number };

function lineKey(line: { productId: string | null; variantId: string | null; bundleId: string | null }): string {
  return line.variantId ?? line.bundleId ?? line.productId ?? "";
}

/**
 * The one product tile the whole browsing grid renders — quick picks and
 * catalog/search results alike — so a cashier reads exactly one visual
 * vocabulary no matter how they got to an item. The photo is the primary
 * identifier (large, square, edge-to-edge) with name/price as a caption,
 * not the other way around: staff should recognize the product by its
 * picture before reading its name.
 */
function ProductCard({
  item,
  disabled,
  onPick,
  t,
}: {
  item: PosGridItem;
  disabled: boolean;
  onPick: (sku: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const isOut = !item.allowBackorder && item.stockQty !== null && item.stockQty <= 0;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(item.sku)}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-border text-start transition-colors",
        "hover:border-gold focus-visible:border-gold focus-visible:ring-3 focus-visible:ring-gold/30 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      <span className="relative aspect-square w-full overflow-hidden border-b border-border bg-paper">
        {item.imagePublicId ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary delivery URL, fixed card transform
          <img
            src={buildCloudinaryUrl(item.imagePublicId, "card")}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-contain transition-transform duration-200 ease-out group-hover:scale-105"
          />
        ) : (
          <span className="flex size-full items-center justify-center">
            <Package className="size-10 text-ink-soft" aria-hidden="true" />
          </span>
        )}
        {isOut ? (
          <span className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center rounded-full bg-red-bg px-2 py-1 text-xs font-semibold text-red-text">
            {t("outOfStock")}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col gap-1 p-3">
        <span className="line-clamp-2 min-h-10 text-sm font-medium text-ink">{item.name}</span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-sm text-ink-soft">{formatMoney(item.unitPrice)}</span>
          {item.promo ? (
            <span className="inline-flex items-center rounded-full bg-gold-soft px-1.5 py-0.5 text-xs font-semibold text-gold-strong">
              {t("promoBadge")}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function CategoryTabs({
  categories,
  selectedId,
  onSelect,
  t,
}: {
  categories: PosCategory[];
  selectedId: string | "all";
  onSelect: (id: string | "all") => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="flex snap-x snap-proximity gap-5 overflow-x-auto pb-1 touch-pan-x">
      <button
        type="button"
        onClick={() => onSelect("all")}
        className={cn(
          "shrink-0 snap-start border-b-2 pb-1.5 text-xs font-semibold tracking-[0.04em] uppercase transition-colors hover:border-gold hover:text-ink",
          selectedId === "all" ? "border-gold text-ink" : "border-transparent text-ink-soft",
        )}
      >
        {t("categoryAllLabel")}
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect(category.id)}
          className={cn(
            "shrink-0 snap-start border-b-2 pb-1.5 text-xs font-semibold tracking-[0.04em] uppercase transition-colors hover:border-gold hover:text-ink",
            selectedId === category.id ? "border-gold text-ink" : "border-transparent text-ink-soft",
          )}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}

function QtyEditorInput({ qty, onCommit, onCancel }: { qty: number; onCommit: (qty: number) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(String(qty));

  function commit() {
    const parsed = Number.parseInt(draft, 10);
    onCommit(Number.isFinite(parsed) ? parsed : qty);
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={99}
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          onCancel();
        }
      }}
      className="h-7 w-12 rounded-md border border-border text-center font-mono text-sm text-ink outline-none focus-visible:border-gold"
    />
  );
}

function SaleLineRow({
  line,
  removing,
  editingQty,
  t,
  onIncrement,
  onDecrement,
  onRequestRemove,
  onConfirmRemove,
  onCancelRemove,
  onStartEditQty,
  onCommitQty,
}: {
  line: CartLine;
  removing: boolean;
  editingQty: boolean;
  t: ReturnType<typeof useTranslations>;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onRequestRemove: (key: string) => void;
  onConfirmRemove: (key: string, reason: (typeof REMOVE_REASONS)[number]) => void;
  onCancelRemove: () => void;
  onStartEditQty: (key: string) => void;
  onCommitQty: (key: string, qty: number) => void;
}) {
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-ink">{line.name}</span>
          <span className="flex items-center gap-1.5 font-mono text-xs text-ink-soft">
            {formatMoney(line.unitPrice)}
            {line.promo ? (
              <span className="inline-flex items-center rounded-full bg-gold-soft px-1.5 py-0.5 text-xs font-semibold text-gold-strong">
                {t("promoBadge")}
              </span>
            ) : null}
          </span>
        </div>
        <span className="font-mono text-sm font-semibold text-ink">{formatMoney(line.unitPrice * line.qty)}</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-border">
          <button
            type="button"
            aria-label={t("qtyDecrease")}
            disabled={line.qty <= 1}
            onClick={() => onDecrement(line.key)}
            className="flex size-9 items-center justify-center text-ink-soft transition-colors hover:text-ink disabled:opacity-30"
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          {editingQty ? (
            <QtyEditorInput
              qty={line.qty}
              onCommit={(qty) => onCommitQty(line.key, qty)}
              onCancel={() => onCommitQty(line.key, line.qty)}
            />
          ) : (
            <button
              type="button"
              aria-label={t("qtyEditLabel")}
              onClick={() => onStartEditQty(line.key)}
              className="min-w-6 px-1 text-center font-mono text-sm text-ink hover:text-gold-strong"
            >
              {line.qty}
            </button>
          )}
          <button
            type="button"
            aria-label={t("qtyIncrease")}
            onClick={() => onIncrement(line.key)}
            className="flex size-9 items-center justify-center text-ink-soft transition-colors hover:text-ink"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>

        {!removing ? (
          <button
            type="button"
            onClick={() => onRequestRemove(line.key)}
            className="text-xs font-medium text-red-text hover:underline"
          >
            {t("removeItem")}
          </button>
        ) : null}
      </div>

      {removing ? (
        <div className="flex flex-col gap-2 rounded-md bg-paper p-3">
          <p className="text-xs font-medium text-ink-soft">{t("removeReasonPrompt")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="rounded-full"
              onClick={() => onConfirmRemove(line.key, "wrong_scan")}
            >
              {t("removeReasonWrongScan")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="rounded-full"
              onClick={() => onConfirmRemove(line.key, "changed_mind")}
            >
              {t("removeReasonChangedMind")}
            </Button>
            <Button type="button" variant="secondary" size="sm" className="rounded-full" onClick={onCancelRemove}>
              {t("removeCancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function PosScanView({
  quickPicks,
  catalog,
  categories,
}: {
  quickPicks: PosGridItem[];
  catalog: PosGridItem[];
  categories: PosCategory[];
}) {
  const t = useTranslations("admin.pos");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [lines, setLines] = useState<CartLine[]>([]);
  const [removedLines, setRemovedLines] = useState<RemovedLine[]>([]);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | "all">("all");
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [editingQtyKey, setEditingQtyKey] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [saleSuccess, setSaleSuccess] = useState<{ code: string; total: number } | null>(null);

  const linesRef = useRef<CartLine[]>(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    if (!feedback || feedback.type === "stock_warning") return;
    const timer = window.setTimeout(() => setFeedback((current) => (current?.id === feedback.id ? null : current)), 2500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  function commitAdd(line: PosResolvedLine, existingKey: string | undefined, overridden: boolean) {
    setLines((prev) => {
      if (existingKey) {
        return prev.map((l) =>
          l.key === existingKey
            ? { ...l, qty: l.qty + 1, unitPrice: line.unitPrice, promo: line.promo, stockQty: line.stockQty, overridden: l.overridden || overridden }
            : l,
        );
      }
      return [
        ...prev,
        {
          key: lineKey(line),
          kind: line.kind,
          productId: line.productId,
          variantId: line.variantId,
          bundleId: line.bundleId,
          name: line.name,
          unitPrice: line.unitPrice,
          promo: line.promo,
          qty: 1,
          stockQty: line.stockQty,
          allowBackorder: line.allowBackorder,
          overridden,
        },
      ];
    });
    setSaleSuccess(null);
    setFeedback({ type: "success", name: line.name, id: Date.now() });
    playScanSuccess();
  }

  function addOrWarn(line: PosResolvedLine) {
    const key = lineKey(line);
    const existing = linesRef.current.find((l) => l.key === key);
    const nextQty = (existing?.qty ?? 0) + 1;
    const wouldExceed = !line.allowBackorder && line.stockQty !== null && nextQty > line.stockQty && !existing?.overridden;

    if (wouldExceed) {
      setFeedback({ type: "stock_warning", pending: { ...line, existingKey: existing?.key }, id: Date.now() });
      playScanError();
      return;
    }

    commitAdd(line, existing?.key, false);
  }

  async function handleScan(rawSku: string) {
    const sku = rawSku.trim();
    if (!sku || scanning) return;

    setScanning(true);
    const result = await resolvePosScanAction(sku);
    setScanning(false);

    if (!result.ok || result.data.status === "not_found") {
      setFeedback({ type: "not_found", sku, id: Date.now() });
      playScanError();
      return;
    }

    if (result.data.status === "inactive") {
      setFeedback({ type: "inactive", name: result.data.name, id: Date.now() });
      playScanError();
      return;
    }

    addOrWarn(result.data.line);
  }

  function confirmOverride() {
    if (!feedback || feedback.type !== "stock_warning") return;
    const { pending } = feedback;
    if (pending.existingKey && pending.targetQty !== undefined) {
      const targetQty = pending.targetQty;
      setLines((prev) => prev.map((l) => (l.key === pending.existingKey ? { ...l, qty: targetQty, overridden: true } : l)));
      setFeedback(null);
    } else {
      commitAdd(pending, pending.existingKey, true);
    }
  }

  function dismissFeedback() {
    setFeedback(null);
  }

  /** Sets a cart line to an exact quantity (bulk-entry or the +/- steppers), warning past available stock the same way a physical scan does. */
  function setLineQty(key: string, rawQty: number) {
    const line = linesRef.current.find((l) => l.key === key);
    if (!line) return;
    const qty = Math.max(1, Math.min(99, Math.round(rawQty) || 1));
    const wouldExceed = !line.allowBackorder && line.stockQty !== null && qty > line.stockQty && !line.overridden;

    if (wouldExceed) {
      setFeedback({
        type: "stock_warning",
        pending: {
          kind: line.kind,
          productId: line.productId,
          variantId: line.variantId,
          bundleId: line.bundleId,
          sku: "",
          name: line.name,
          unitPrice: line.unitPrice,
          promo: line.promo,
          stockQty: line.stockQty,
          allowBackorder: line.allowBackorder,
          existingKey: key,
          targetQty: qty,
        },
        id: Date.now(),
      });
      playScanError();
      return;
    }

    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty } : l)));
  }

  function incrementLine(key: string) {
    const line = linesRef.current.find((l) => l.key === key);
    if (!line) return;
    setLineQty(key, line.qty + 1);
  }

  function decrementLine(key: string) {
    setLines((prev) => prev.map((l) => (l.key === key && l.qty > 1 ? { ...l, qty: l.qty - 1 } : l)));
  }

  function startEditQty(key: string) {
    setEditingQtyKey(key);
  }

  function commitQtyEdit(key: string, qty: number) {
    setEditingQtyKey(null);
    setLineQty(key, qty);
  }

  function requestRemove(key: string) {
    setRemovingKey(key);
  }

  function cancelRemove() {
    setRemovingKey(null);
  }

  function confirmRemove(key: string, reason: (typeof REMOVE_REASONS)[number]) {
    const line = linesRef.current.find((l) => l.key === key);
    if (!line) return;
    setRemovedLines((prev) => [...prev, { nameSnapshot: line.name, unitPrice: line.unitPrice, qty: line.qty, reason }]);
    setLines((prev) => prev.filter((l) => l.key !== key));
    setRemovingKey(null);
  }

  function startNewSale() {
    setLines([]);
    setRemovedLines([]);
    setFeedback(null);
    setPaymentMethod(null);
    setCompleteError(null);
    setSaleSuccess(null);
  }

  async function handleCompleteSale() {
    if (!paymentMethod || lines.length === 0 || completing) return;
    setCompleting(true);
    setCompleteError(null);

    const result = await completeSaleAction({
      paymentMethod,
      lines: lines.map((l) => ({
        kind: l.kind,
        productId: l.productId ?? undefined,
        variantId: l.variantId ?? undefined,
        bundleId: l.bundleId ?? undefined,
        qty: l.qty,
        overridden: l.overridden,
      })),
      removedLines,
    });

    setCompleting(false);

    if (!result.ok) {
      setCompleteError(result.error.message);
      return;
    }

    setSaleSuccess({ code: result.data.code, total: result.data.total });
    setLines([]);
    setRemovedLines([]);
    setPaymentMethod(null);
    router.refresh();
  }

  const isBrowsingCatalog = manualQuery.trim().length > 0 || selectedCategoryId !== "all";

  const filteredCatalog = useMemo(() => {
    const term = manualQuery.trim().toLowerCase();
    const byCategory = selectedCategoryId === "all" ? catalog : catalog.filter((item) => item.categoryId === selectedCategoryId);
    if (!term) return byCategory.slice(0, 60);
    return byCategory.filter((item) => item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term)).slice(0, 60);
  }, [catalog, manualQuery, selectedCategoryId]);

  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t("subtitle")}</p>
      </div>

      {feedback ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-lg border p-3.5",
            feedback.type === "success" && "border-green-bg bg-green-bg text-green-text",
            (feedback.type === "not_found" || feedback.type === "inactive") && "border-red-bg bg-red-bg text-red-text",
            feedback.type === "stock_warning" && "border-gold-soft bg-gold-soft text-gold-strong",
          )}
        >
          {feedback.type === "success" ? <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" /> : null}
          {feedback.type !== "success" ? <AlertTriangle className="size-5 shrink-0" aria-hidden="true" /> : null}

          <p className="flex-1 text-sm font-medium">
            {feedback.type === "success" ? t("scanFeedbackAdded", { name: feedback.name }) : null}
            {feedback.type === "not_found" ? t("scanFeedbackNotFound", { sku: feedback.sku }) : null}
            {feedback.type === "inactive" ? t("scanFeedbackInactive", { name: feedback.name }) : null}
            {feedback.type === "stock_warning" ? (
              <>
                <span className="block font-semibold">{t("stockWarningTitle")}</span>
                {t("stockWarningBody", { name: feedback.pending.name, available: Math.max(feedback.pending.stockQty ?? 0, 0) })}
              </>
            ) : null}
          </p>

          {feedback.type === "stock_warning" ? (
            <div className="flex gap-2">
              <Button type="button" size="sm" className="rounded-full" onClick={confirmOverride}>
                {t("stockWarningOverride")}
              </Button>
              <Button type="button" size="sm" variant="secondary" className="rounded-full" onClick={dismissFeedback}>
                {t("stockWarningCancel")}
              </Button>
            </div>
          ) : (
            <button type="button" aria-label={tCommon("close")} onClick={dismissFeedback} className="shrink-0 opacity-70 hover:opacity-100">
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
            <input
              type="search"
              value={manualQuery}
              onChange={(event) => setManualQuery(event.target.value)}
              placeholder={t("manualSearchPlaceholder")}
              className="h-11 w-full rounded-full border border-border ps-10 pe-3.5 text-sm text-ink outline-none focus-visible:border-gold focus-visible:ring-3 focus-visible:ring-gold/30"
            />
          </div>

          <CategoryTabs categories={categories} selectedId={selectedCategoryId} onSelect={setSelectedCategoryId} t={t} />

          {isBrowsingCatalog ? (
            filteredCatalog.length === 0 ? (
              <p className="text-sm text-ink-soft">{t("manualSearchEmpty")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {filteredCatalog.map((item) => (
                  <ProductCard key={item.sku} item={item} disabled={scanning} onPick={(sku) => void handleScan(sku)} t={t} />
                ))}
              </div>
            )
          ) : (
            <>
              <h2 className="font-heading text-lg font-semibold text-ink">{t("quickPicksTitle")}</h2>
              {quickPicks.length === 0 ? (
                <p className="text-sm text-ink-soft">{t("quickPicksEmpty")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                  {quickPicks.map((item) => (
                    <ProductCard key={item.id} item={item} disabled={scanning} onPick={(sku) => void handleScan(sku)} t={t} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-border p-5 lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold text-ink">{t("saleTitle")}</h2>
            {lines.length > 0 || removedLines.length > 0 || saleSuccess ? (
              <button
                type="button"
                onClick={startNewSale}
                className="flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {t("newSale")}
              </button>
            ) : null}
          </div>

          {saleSuccess ? (
            <div className="flex items-center gap-2 rounded-md bg-green-bg p-3 text-sm text-green-text">
              <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
              <div className="flex-1">
                <p className="font-semibold">{t("saleSuccessTitle")}</p>
                <p>{t("saleSuccessBody", { code: saleSuccess.code, total: formatMoney(saleSuccess.total) })}</p>
              </div>
              <button type="button" onClick={startNewSale} className="shrink-0 text-xs font-medium underline">
                {t("saleSuccessDismiss")}
              </button>
            </div>
          ) : null}

          {lines.length === 0 ? (
            <p className="text-sm text-ink-soft">{t("saleEmpty")}</p>
          ) : (
            <ul>
              {lines.map((line) => (
                <SaleLineRow
                  key={line.key}
                  line={line}
                  removing={removingKey === line.key}
                  editingQty={editingQtyKey === line.key}
                  t={t}
                  onIncrement={incrementLine}
                  onDecrement={decrementLine}
                  onStartEditQty={startEditQty}
                  onCommitQty={commitQtyEdit}
                  onRequestRemove={requestRemove}
                  onConfirmRemove={confirmRemove}
                  onCancelRemove={cancelRemove}
                />
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-base font-semibold text-ink">{t("totalLabel")}</span>
            <span className="font-mono text-xl font-bold text-ink">{formatMoney(total)}</span>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-wide text-ink-soft">{t("paymentTitle")}</p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={paymentMethod === method}
                  onClick={() => setPaymentMethod(method)}
                  className={cn(
                    "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors",
                    paymentMethod === method ? "border-ink bg-ink text-paper" : "border-border text-ink hover:bg-paper",
                  )}
                >
                  {t(PAYMENT_METHOD_KEYS[method])}
                </button>
              ))}
            </div>
          </div>

          {completeError ? <p className="text-sm text-red-text">{completeError}</p> : null}
          {!paymentMethod && lines.length > 0 ? <p className="text-xs text-ink-soft">{t("completeSaleSelectPayment")}</p> : null}

          <Button
            type="button"
            disabled={!paymentMethod || lines.length === 0 || completing}
            onClick={() => void handleCompleteSale()}
            className="h-12 rounded-full text-base"
          >
            {completing ? t("completeSaleSubmitting") : t("completeSale")}
          </Button>
        </div>
      </div>
    </div>
  );
}
