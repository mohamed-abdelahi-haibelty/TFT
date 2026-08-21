"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";

const REASON_FILTERS = [
  "web_sale",
  "pos_sale",
  "cancel_restock",
  "void_restock",
  "manual_adjust",
  "restock",
  "correction",
] as const;

export function MovementsFilterForm({
  locale,
  initialReason,
  dateFrom,
  dateTo,
  productId,
  variantId,
}: {
  locale: "ar" | "fr";
  initialReason: string;
  dateFrom: string;
  dateTo: string;
  productId?: string;
  variantId?: string;
}) {
  const t = useTranslations("admin.inventory");
  const tc = useTranslations("common");

  const reasonItems = {
    "": t("reasonFilterAll"),
    ...Object.fromEntries(REASON_FILTERS.map((reason) => [reason, t(`reason.${reason}`)])),
  };

  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      {productId ? <input type="hidden" name="product" value={productId} /> : null}
      {variantId ? <input type="hidden" name="variant" value={variantId} /> : null}

      <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
        {t("reasonFilterLabel")}
        <Select name="reason" defaultValue={initialReason} items={reasonItems}>
          <SelectTrigger size="lg" className="w-44" aria-label={t("reasonFilterLabel")}>
            <SelectValue placeholder={t("reasonFilterAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("reasonFilterAll")}</SelectItem>
            {REASON_FILTERS.map((reason) => (
              <SelectItem key={reason} value={reason}>
                {t(`reason.${reason}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
        {tc("dateRangeLabel")}
        <DateRangePicker
          locale={locale}
          fromName="dateFrom"
          toName="dateTo"
          defaultFrom={dateFrom}
          defaultTo={dateTo}
          placeholder={tc("dateRangePlaceholder")}
          clearLabel={tc("dateRangeClear")}
          doneLabel={tc("dateRangeDone")}
          ariaLabel={tc("dateRangeLabel")}
        />
      </label>

      <button
        type="submit"
        className="h-11 rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
      >
        {t("filterSubmit")}
      </button>
    </form>
  );
}
