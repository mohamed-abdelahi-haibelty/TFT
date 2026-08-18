"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Minus, Plus, RotateCcw, ScanLine, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/src/lib/money";
import { playScanError, playScanSuccess } from "@/src/lib/pos-sound";
import { useRouter } from "@/src/i18n/navigation";
import { completeSaleAction, resolvePosScanAction } from "@/src/services/pos-actions";
import type { PosCatalogItem, PosQuickPickItem, PosResolvedLine } from "@/src/services/pos";

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

type PendingOverride = PosResolvedLine & { existingKey?: string };

type ScanFeedback =
  | { type: "success"; name: string; id: number }
  | { type: "not_found"; sku: string; id: number }
  | { type: "inactive"; name: string; id: number }
  | { type: "stock_warning"; pending: PendingOverride; id: number };

function lineKey(line: { productId: string | null; variantId: string | null; bundleId: string | null }): string {
  return line.variantId ?? line.bundleId ?? line.productId ?? "";
}

function QuickPickTile({
  item,
  disabled,
  onPick,
  t,
}: {
  item: PosQuickPickItem;
  disabled: boolean;
  onPick: (sku: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const isOut = !item.allowBackorder && item.stockQty <= 0;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(item.sku)}
      className={cn(
        "flex min-h-24 flex-col items-start justify-between gap-1 rounded-2xl border border-border p-3.5 text-start transition-colors",
        "hover:border-gold hover:bg-gold-soft/40 focus-visible:border-gold focus-visible:ring-3 focus-visible:ring-gold/30 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      <span className="text-sm font-medium text-ink">{item.name}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-sm text-ink-soft">{formatMoney(item.unitPrice)}</span>
        {isOut ? (
          <span className="inline-flex items-center rounded-full bg-red-bg px-1.5 py-0.5 text-xs font-semibold text-red-text">
            {t("outOfStock")}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function SaleLineRow({
  line,
  removing,
  t,
  onIncrement,
  onDecrement,
  onRequestRemove,
  onConfirmRemove,
  onCancelRemove,
}: {
  line: CartLine;
  removing: boolean;
  t: ReturnType<typeof useTranslations>;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onRequestRemove: (key: string) => void;
  onConfirmRemove: (key: string, reason: (typeof REMOVE_REASONS)[number]) => void;
  onCancelRemove: () => void;
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
          <span className="min-w-6 text-center font-mono text-sm text-ink">{line.qty}</span>
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
}: {
  quickPicks: PosQuickPickItem[];
  catalog: PosCatalogItem[];
}) {
  const t = useTranslations("admin.pos");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [lines, setLines] = useState<CartLine[]>([]);
  const [removedLines, setRemovedLines] = useState<RemovedLine[]>([]);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [scanValue, setScanValue] = useState("");
  const [scanning, setScanning] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [saleSuccess, setSaleSuccess] = useState<{ code: string; total: number } | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const linesRef = useRef<CartLine[]>(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  function focusScanInput() {
    scanInputRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    focusScanInput();

    function refocus() {
      const active = document.activeElement;
      const isEditable = active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && active !== scanInputRef.current;
      if (!isEditable) focusScanInput();
    }

    document.addEventListener("click", refocus);
    window.addEventListener("focus", refocus);
    return () => {
      document.removeEventListener("click", refocus);
      window.removeEventListener("focus", refocus);
    };
  }, []);

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
    focusScanInput();

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

  function onScanKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = scanValue;
    setScanValue("");
    void handleScan(value);
  }

  function confirmOverride() {
    if (!feedback || feedback.type !== "stock_warning") return;
    const { pending } = feedback;
    commitAdd(pending, pending.existingKey, true);
    focusScanInput();
  }

  function dismissFeedback() {
    setFeedback(null);
    focusScanInput();
  }

  function incrementLine(key: string) {
    const line = linesRef.current.find((l) => l.key === key);
    if (!line) return;
    const wouldExceed = !line.allowBackorder && line.stockQty !== null && line.qty + 1 > line.stockQty && !line.overridden;
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
        },
        id: Date.now(),
      });
      playScanError();
      return;
    }
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)));
  }

  function decrementLine(key: string) {
    setLines((prev) => prev.map((l) => (l.key === key && l.qty > 1 ? { ...l, qty: l.qty - 1 } : l)));
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
    focusScanInput();
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
    focusScanInput();
  }

  const filteredCatalog = useMemo(() => {
    const term = manualQuery.trim().toLowerCase();
    if (!term) return catalog.slice(0, 30);
    return catalog.filter((item) => item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term)).slice(0, 30);
  }, [catalog, manualQuery]);

  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-ink-soft">
          <ScanLine className="size-4" aria-hidden="true" />
          {t("scannerHint")}
        </div>
      </div>

      <label className="sr-only" htmlFor="pos-scan-input">
        {t("scannerLabel")}
      </label>
      <input
        id="pos-scan-input"
        ref={scanInputRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        value={scanValue}
        onChange={(event) => setScanValue(event.target.value)}
        onKeyDown={onScanKeyDown}
        placeholder={t("scannerPlaceholder")}
        className="sr-only"
      />

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
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold text-ink">{t("quickPicksTitle")}</h2>
            <Button type="button" variant="secondary" size="sm" className="rounded-full gap-1.5" onClick={() => setManualOpen((v) => !v)}>
              <Search className="size-3.5" aria-hidden="true" />
              {t("manualSearchToggle")}
            </Button>
          </div>

          {quickPicks.length === 0 ? (
            <p className="text-sm text-ink-soft">{t("quickPicksEmpty")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {quickPicks.map((item) => (
                <QuickPickTile key={item.id} item={item} disabled={scanning} onPick={(sku) => void handleScan(sku)} t={t} />
              ))}
            </div>
          )}

          {manualOpen ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">{t("manualSearchTitle")}</h3>
                <button type="button" aria-label={t("manualSearchClose")} onClick={() => setManualOpen(false)} className="text-ink-soft hover:text-ink">
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <input
                type="search"
                value={manualQuery}
                onChange={(event) => setManualQuery(event.target.value)}
                placeholder={t("manualSearchPlaceholder")}
                className="h-10 w-full rounded-md border border-border px-3.5 text-sm text-ink outline-none focus-visible:border-gold focus-visible:ring-3 focus-visible:ring-gold/30"
              />
              {filteredCatalog.length === 0 ? (
                <p className="text-sm text-ink-soft">{t("manualSearchEmpty")}</p>
              ) : (
                <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                  {filteredCatalog.map((item) => (
                    <li key={item.sku}>
                      <button
                        type="button"
                        disabled={scanning}
                        onClick={() => {
                          setManualOpen(false);
                          void handleScan(item.sku);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-start text-sm text-ink transition-colors hover:bg-paper disabled:opacity-50"
                      >
                        <span>{item.name}</span>
                        <span className="font-mono text-xs text-ink-soft">{item.sku}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
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
                  t={t}
                  onIncrement={incrementLine}
                  onDecrement={decrementLine}
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
