"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { PromotionItemPicker } from "@/components/admin/promotion-item-picker";
import { formatMoney } from "@/src/lib/money";
import { createPromotionAction, updatePromotionAction } from "@/src/services/promotion-actions";
import type {
  PromotionDetail,
  PromotionPickerBundle,
  PromotionPickerCategory,
  PromotionPickerProduct,
} from "@/src/services/promotions";

const inputClass = "h-11 rounded-xs border-border px-3.5 focus-visible:border-ink focus-visible:ring-0";

type PromotionKind = "percent" | "fixed";
type PromotionChannel = "web" | "pos" | "both";

type FormValues = {
  nameAr: string;
  nameFr: string;
  kind: PromotionKind;
  value: string;
  channel: PromotionChannel;
  isActive: boolean;
  startsAtDate: string;
  startsAtTime: string;
  endsAtDate: string;
  endsAtTime: string;
};

type ItemRow = {
  key: string;
  kind: "product" | "bundle";
  id: string;
  nameAr: string;
  nameFr: string;
  sku: string;
  price: number;
};

/** UTC `Date` -> the browser's own local time split into `YYYY-MM-DD` + `HH:mm`. */
function toLocalParts(date: Date): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

/** Local `YYYY-MM-DD` + `HH:mm` -> UTC ISO string for the server. */
function toUtcIso(date: string, time: string): string {
  return date ? new Date(`${date}T${time || "00:00"}`).toISOString() : "";
}

/** Mirrors `computePromoPrice` in `src/services/pricing.ts` — kept local so this client component never imports the DB-touching pricing service, purely for the live preview below. */
function previewPrice(kind: PromotionKind, value: number, base: number): number {
  if (Number.isNaN(value)) return base;
  return kind === "percent" ? Math.round((base * (100 - value)) / 100) : Math.max(base - value, 0);
}

export function PromotionForm({
  promotion,
  pickerData,
  locale,
}: {
  promotion?: PromotionDetail;
  pickerData: { categories: PromotionPickerCategory[]; products: PromotionPickerProduct[]; bundles: PromotionPickerBundle[] };
  locale: "ar" | "fr";
}) {
  const t = useTranslations("admin.promotions");
  const { toast } = useToast();
  const isEditMode = !!promotion;

  const action = isEditMode ? updatePromotionAction.bind(null, promotion.id) : createPromotionAction;
  const [state, formAction, isPending] = useActionState(action, null);

  const [values, setValues] = useState<FormValues>(() => ({
    nameAr: promotion?.nameAr ?? "",
    nameFr: promotion?.nameFr ?? "",
    kind: promotion?.kind ?? "percent",
    value: promotion?.value != null ? String(promotion.value) : "",
    channel: promotion?.channel ?? "both",
    isActive: promotion?.isActive ?? true,
    startsAtDate: promotion ? toLocalParts(new Date(promotion.startsAt)).date : "",
    startsAtTime: promotion ? toLocalParts(new Date(promotion.startsAt)).time : "",
    endsAtDate: promotion ? toLocalParts(new Date(promotion.endsAt)).date : "",
    endsAtTime: promotion ? toLocalParts(new Date(promotion.endsAt)).time : "",
  }));

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const [items, setItems] = useState<ItemRow[]>(
    (promotion?.items ?? []).map((item) => ({ key: `${item.kind}-${item.id}`, ...item })),
  );

  function addProduct(product: PromotionPickerProduct) {
    setItems((prev) =>
      prev.some((item) => item.kind === "product" && item.id === product.id)
        ? prev
        : [...prev, { ...product, key: `product-${product.id}`, kind: "product" }],
    );
  }

  function addBundle(bundle: PromotionPickerBundle) {
    setItems((prev) =>
      prev.some((item) => item.kind === "bundle" && item.id === bundle.id)
        ? prev
        : [...prev, { ...bundle, key: `bundle-${bundle.id}`, kind: "bundle" }],
    );
  }

  function addCategory(categoryId: string) {
    const additions = pickerData.products.filter(
      (product) =>
        product.categoryId === categoryId &&
        !items.some((item) => item.kind === "product" && item.id === product.id),
    );
    if (additions.length === 0) return;
    toast(t("categoryAdded", { count: additions.length }));
    setItems((prev) => [
      ...prev,
      ...additions.map((product) => ({ ...product, key: `product-${product.id}`, kind: "product" as const })),
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  const kindValue = Number(values.value);
  const violatingItems = useMemo(
    () => (values.kind === "fixed" ? items.filter((item) => kindValue >= item.price) : []),
    [items, values.kind, kindValue],
  );

  const serializedProductIds = JSON.stringify(items.filter((i) => i.kind === "product").map((i) => i.id));
  const serializedBundleIds = JSON.stringify(items.filter((i) => i.kind === "bundle").map((i) => i.id));

  return (
    <form action={formAction} className="flex flex-col gap-10" noValidate>
      <input type="hidden" name="kind" value={values.kind} readOnly />
      <input type="hidden" name="channel" value={values.channel} readOnly />
      <input type="hidden" name="startsAt" value={toUtcIso(values.startsAtDate, values.startsAtTime)} readOnly />
      <input type="hidden" name="endsAt" value={toUtcIso(values.endsAtDate, values.endsAtTime)} readOnly />
      <input type="hidden" name="productIds" value={serializedProductIds} readOnly />
      <input type="hidden" name="bundleIds" value={serializedBundleIds} readOnly />

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold text-ink">{t("sectionGeneral")}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promotion-name-ar">
              {t("nameArLabel")} <span className="text-plum" aria-hidden="true">*</span>
            </Label>
            <Input
              id="promotion-name-ar"
              name="nameAr"
              type="text"
              dir="rtl"
              value={values.nameAr}
              onChange={(event) => set("nameAr", event.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promotion-name-fr">
              {t("nameFrLabel")} <span className="text-plum" aria-hidden="true">*</span>
            </Label>
            <Input
              id="promotion-name-fr"
              name="nameFr"
              type="text"
              value={values.nameFr}
              onChange={(event) => set("nameFr", event.target.value)}
              required
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <h2 className="font-heading text-lg font-semibold text-ink">{t("sectionDiscount")}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promotion-kind">{t("kindLabel")}</Label>
            <Select
              value={values.kind}
              onValueChange={(value) => set("kind", (value ?? "percent") as PromotionKind)}
            >
              <SelectTrigger id="promotion-kind" size="lg" className="w-full">
                <SelectValue placeholder={t("kindLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">{t("kindPercent")}</SelectItem>
                <SelectItem value="fixed">{t("kindFixed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promotion-value">
              {values.kind === "percent" ? t("valuePercentLabel") : t("valueFixedLabel")}{" "}
              <span className="text-plum" aria-hidden="true">*</span>
            </Label>
            <Input
              id="promotion-value"
              name="value"
              type="number"
              min={1}
              max={values.kind === "percent" ? 90 : undefined}
              step={1}
              inputMode="numeric"
              value={values.value}
              onChange={(event) => set("value", event.target.value)}
              required
              className={`${inputClass} font-mono`}
            />
            <p className="text-xs text-ink-soft">
              {values.kind === "percent" ? t("valuePercentHint") : t("valueFixedHint")}
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <h2 className="font-heading text-lg font-semibold text-ink">{t("sectionSchedule")}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promotion-starts-at-date">{t("startsAtLabel")}</Label>
            <div className="flex gap-2">
              <DatePicker
                locale={locale}
                name="startsAtDate"
                id="promotion-starts-at-date"
                defaultValue={values.startsAtDate}
                onValueChange={(value) => set("startsAtDate", value ?? "")}
                placeholder={t("startsAtLabel")}
                clearLabel={t("clearDate")}
                ariaLabel={t("startsAtLabel")}
                className="flex-1"
              />
              <Input
                id="promotion-starts-at-time"
                type="time"
                value={values.startsAtTime}
                onChange={(event) => set("startsAtTime", event.target.value)}
                aria-label={t("startsAtTimeLabel")}
                className={`${inputClass} w-32 font-mono`}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promotion-ends-at-date">{t("endsAtLabel")}</Label>
            <div className="flex gap-2">
              <DatePicker
                locale={locale}
                name="endsAtDate"
                id="promotion-ends-at-date"
                defaultValue={values.endsAtDate}
                onValueChange={(value) => set("endsAtDate", value ?? "")}
                placeholder={t("endsAtLabel")}
                clearLabel={t("clearDate")}
                ariaLabel={t("endsAtLabel")}
                className="flex-1"
              />
              <Input
                id="promotion-ends-at-time"
                type="time"
                value={values.endsAtTime}
                onChange={(event) => set("endsAtTime", event.target.value)}
                aria-label={t("endsAtTimeLabel")}
                className={`${inputClass} w-32 font-mono`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <h2 className="font-heading text-lg font-semibold text-ink">{t("sectionChannel")}</h2>

        <div className="flex flex-col gap-1.5 sm:max-w-sm">
          <Label htmlFor="promotion-channel">{t("channelLabel")}</Label>
          <Select
            value={values.channel}
            onValueChange={(value) => set("channel", (value ?? "both") as PromotionChannel)}
          >
            <SelectTrigger id="promotion-channel" size="lg" className="w-full">
              <SelectValue placeholder={t("channelLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">{t("channelBoth")}</SelectItem>
              <SelectItem value="web">{t("channelWeb")}</SelectItem>
              <SelectItem value="pos">{t("channelPos")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-center gap-2.5 text-sm font-medium text-ink">
          <input
            type="checkbox"
            name="isActive"
            checked={values.isActive}
            onChange={(event) => set("isActive", event.target.checked)}
            className="size-5 rounded-xs border-border accent-ink"
          />
          {t("activeLabel")}
        </label>
      </section>

      <section className="flex flex-col gap-5 border-t border-border pt-8">
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">{t("sectionItems")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("itemsSubtitle")}</p>
        </div>

        <PromotionItemPicker
          categories={pickerData.categories}
          products={pickerData.products}
          bundles={pickerData.bundles}
          selectedProductIds={items.filter((i) => i.kind === "product").map((i) => i.id)}
          selectedBundleIds={items.filter((i) => i.kind === "bundle").map((i) => i.id)}
          onAddProduct={addProduct}
          onAddBundle={addBundle}
          onAddCategory={addCategory}
        />

        {items.length === 0 ? (
          <p className="text-sm text-ink-soft">{t("noItems")}</p>
        ) : (
          <div
            aria-live="polite"
            className="flex flex-col divide-y divide-border rounded-lg border border-border"
          >
            {items.map((item) => {
              const isViolator = values.kind === "fixed" && kindValue >= item.price;
              return (
                <div key={item.key} className="flex flex-wrap items-center gap-3 p-4">
                  <span className="rounded-xs border border-border px-2.5 py-1 text-xs font-medium text-ink">
                    {item.kind === "product" ? t("itemTypeProduct") : t("itemTypeBundle")}
                  </span>
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium text-ink">{item.nameFr}</p>
                    <p className="font-mono text-xs text-ink-soft">{item.sku}</p>
                    {isViolator ? (
                      <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-plum">
                        <CircleAlert className="size-3" aria-hidden="true" />
                        {t("itemViolation", { value: formatMoney(kindValue), price: formatMoney(item.price) })}
                      </p>
                    ) : null}
                  </div>
                  <div className="font-mono text-sm text-ink-soft">
                    <span className="line-through">{formatMoney(item.price)}</span>{" "}
                    <span className="font-medium text-ink">
                      {formatMoney(previewPrice(values.kind, kindValue, item.price))}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={t("removeItem")}
                    onClick={() => removeItem(item.key)}
                    className="flex size-11 items-center justify-center rounded-xs text-ink-soft transition-colors hover:bg-plum hover:text-paper"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="border-t border-border pt-8" aria-live="polite">
        {state && !state.ok ? (
          <p role="alert" className="mb-4 flex items-start gap-2 rounded-xs border border-plum px-3.5 py-2.5 text-sm font-medium text-plum">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {state.error.message}
          </p>
        ) : null}

        {items.length === 0 || violatingItems.length > 0 ? (
          <p className="mb-3 text-sm text-ink-soft">
            {items.length === 0 ? t("missingItems") : t("violationBlocked")}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={isPending || items.length === 0 || violatingItems.length > 0}
          className="h-11 rounded-xs bg-ink px-6 text-paper transition-colors hover:bg-[color-mix(in_oklch,var(--ink),white_10%)] disabled:opacity-70"
        >
          {isEditMode
            ? isPending
              ? t("saveSubmitting")
              : t("saveSubmit")
            : isPending
              ? t("createSubmitting")
              : t("createSubmit")}
        </Button>
      </div>
    </form>
  );
}
