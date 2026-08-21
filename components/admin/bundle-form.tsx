"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CircleAlert, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/admin/image-uploader";
import { BundleItemPicker } from "@/components/admin/bundle-item-picker";
import {
  deriveLimitingComponent,
  deriveMaxSellable,
  type AvailabilityComponent,
  type LimitRef,
} from "@/src/lib/bundle-availability";
import { Link } from "@/src/i18n/navigation";
import { formatMoney } from "@/src/lib/money";
import { slugify } from "@/src/lib/slug";
import { createBundleAction, deleteBundleAction, updateBundleAction } from "@/src/services/bundle-actions";
import type { BundleDetail, BundlePickerProduct } from "@/src/services/bundles";

const inputClass = "h-11 rounded-xs border-border px-3.5 focus-visible:border-ink focus-visible:ring-0";
const textareaClass =
  "rounded-xs border border-border px-3.5 py-2.5 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-0";

type FormValues = {
  nameAr: string;
  nameFr: string;
  descriptionAr: string;
  descriptionFr: string;
  slug: string;
  price: string;
  isActive: boolean;
};

type BundleItemFormState = {
  key: string;
  productId: string;
  productNameAr: string;
  productNameFr: string;
  productSku: string;
  variantId: string | null;
  variantNameAr: string | null;
  variantNameFr: string | null;
  qty: string;
  stock: number;
  allowBackorder: boolean;
  price: number;
  isActive: boolean;
};

export function BundleForm({
  bundle,
  pickerProducts,
  canEditPricing = true,
}: {
  bundle?: BundleDetail;
  pickerProducts: BundlePickerProduct[];
  /** Same split as `ProductForm`: `catalog.manage` edits the box, `catalog.pricing` sets what it costs. */
  canEditPricing?: boolean;
}) {
  const t = useTranslations("admin.bundles");
  const locale = useLocale();
  const isEditMode = !!bundle;

  const action = isEditMode ? updateBundleAction.bind(null, bundle.id) : createBundleAction;
  const [state, formAction, isPending] = useActionState(action, null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const confirmDeleteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingDelete) confirmDeleteRef.current?.focus();
  }, [confirmingDelete]);

  async function handleDelete() {
    if (!bundle) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteBundleAction(bundle.id, null);
      if (!result.ok) setDeleteError(result.error.message);
    });
  }

  // Same rationale as ProductForm: keep every field in React state so a
  // rejected submission (e.g. taken slug) doesn't wipe what was typed.
  const [values, setValues] = useState<FormValues>(() => ({
    nameAr: bundle?.nameAr ?? "",
    nameFr: bundle?.nameFr ?? "",
    descriptionAr: bundle?.descriptionAr ?? "",
    descriptionFr: bundle?.descriptionFr ?? "",
    slug: bundle?.slug ?? "",
    price: bundle?.price != null ? String(bundle.price) : "",
    isActive: bundle?.isActive ?? true,
  }));
  const [slugTouched, setSlugTouched] = useState(isEditMode);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const [images, setImages] = useState<string[]>(bundle?.images.map((i) => i.publicId) ?? []);
  const [items, setItems] = useState<BundleItemFormState[]>(
    (bundle?.items ?? []).map((item) => ({
      key: item.id,
      productId: item.productId,
      productNameAr: item.productNameAr,
      productNameFr: item.productNameFr,
      productSku: item.productSku,
      variantId: item.variantId,
      variantNameAr: item.variantNameAr,
      variantNameFr: item.variantNameFr,
      qty: String(item.qty),
      stock: item.stock,
      allowBackorder: item.allowBackorder,
      price: item.price,
      isActive: item.isActive,
    })),
  );

  function addItem(product: BundlePickerProduct, variantId: string | null) {
    const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined;

    setItems((prev) => {
      const existing = prev.find((item) => item.productId === product.id && item.variantId === variantId);
      if (existing) {
        return prev.map((item) =>
          item === existing ? { ...item, qty: String((Number(item.qty) || 0) + 1) } : item,
        );
      }
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          productId: product.id,
          productNameAr: product.nameAr,
          productNameFr: product.nameFr,
          productSku: product.sku,
          variantId: variant?.id ?? null,
          variantNameAr: variant?.nameAr ?? null,
          variantNameFr: variant?.nameFr ?? null,
          qty: "1",
          stock: product.stockQty,
          allowBackorder: product.allowBackorder,
          price: product.discountPrice ?? product.price,
          isActive: true,
        },
      ];
    });
  }

  function updateItemQty(key: string, qty: string) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, qty } : item)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  const components: (AvailabilityComponent & LimitRef)[] = useMemo(
    () =>
      items.map((item) => ({
        qty: Number(item.qty) || 0,
        stock: item.stock,
        allowBackorder: item.allowBackorder,
        nameAr: item.variantNameAr ?? item.productNameAr,
        nameFr: item.variantNameFr ?? item.productNameFr,
      })),
    [items],
  );
  const maxSellable = deriveMaxSellable(components);
  const limitBy = deriveLimitingComponent(components);
  const componentPriceSum = items.reduce((sum, item) => sum + item.price * (Number(item.qty) || 0), 0);
  const boxPrice = Number(values.price) || 0;
  const priceBelowSum = items.length > 0 && boxPrice > 0 && boxPrice < componentPriceSum;

  const serializedItems = JSON.stringify(
    items.map((item) => ({ productId: item.productId, variantId: item.variantId, qty: Number(item.qty) || 0 })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-10" noValidate>
      <input type="hidden" name="images" value={JSON.stringify(images)} readOnly />
      <input type="hidden" name="items" value={serializedItems} readOnly />

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold text-ink">{t("sectionGeneral")}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bundle-name-ar">{t("nameArLabel")}</Label>
            <Input
              id="bundle-name-ar"
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
            <Label htmlFor="bundle-name-fr">{t("nameFrLabel")}</Label>
            <Input
              id="bundle-name-fr"
              name="nameFr"
              type="text"
              value={values.nameFr}
              onChange={(event) => {
                set("nameFr", event.target.value);
                if (!slugTouched) set("slug", slugify(event.target.value));
              }}
              required
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bundle-description-ar">{t("descriptionArLabel")}</Label>
            <textarea
              id="bundle-description-ar"
              name="descriptionAr"
              dir="rtl"
              value={values.descriptionAr}
              onChange={(event) => set("descriptionAr", event.target.value)}
              rows={4}
              className={textareaClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bundle-description-fr">{t("descriptionFrLabel")}</Label>
            <textarea
              id="bundle-description-fr"
              name="descriptionFr"
              value={values.descriptionFr}
              onChange={(event) => set("descriptionFr", event.target.value)}
              rows={4}
              className={textareaClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bundle-slug">{t("slugLabel")}</Label>
            <Input
              id="bundle-slug"
              name="slug"
              type="text"
              required
              value={values.slug}
              onChange={(event) => {
                setSlugTouched(true);
                set("slug", event.target.value);
              }}
              className={`${inputClass} font-mono`}
            />
          </div>

          {isEditMode ? (
            <div className="flex flex-col gap-1.5">
              <Label>{t("skuLabel")}</Label>
              <p className="flex h-11 items-center rounded-xs border border-border bg-paper px-3.5 font-mono text-sm text-ink-soft">
                {bundle.sku}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <h2 className="font-heading text-lg font-semibold text-ink">{t("sectionPricing")}</h2>
        {!canEditPricing ? (
          <p className="flex items-start gap-2 text-sm text-ink-soft">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("pricingLocked")}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bundle-price">{t("priceLabel")}</Label>
            <Input
              id="bundle-price"
              name="price"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={values.price}
              onChange={(event) => set("price", event.target.value)}
              required
              readOnly={!canEditPricing}
              aria-readonly={!canEditPricing || undefined}
              className={`${inputClass} font-mono ${canEditPricing ? "" : "cursor-not-allowed bg-paper text-ink-soft"}`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("componentSumLabel")}</Label>
            <p className="flex h-11 items-center rounded-xs border border-border bg-paper px-3.5 font-mono text-sm text-ink-soft">
              {formatMoney(componentPriceSum)}
            </p>
            <p className="text-xs text-ink-soft">{t("componentSumHint")}</p>
          </div>
        </div>

        {priceBelowSum ? (
          <p className="flex items-center gap-2 rounded-xs border border-ink px-3.5 py-2.5 text-sm text-ink">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {t("priceBelowSumWarning")}
          </p>
        ) : null}

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

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <h2 className="font-heading text-lg font-semibold text-ink">{t("sectionImages")}</h2>
        <ImageUploader initialPublicIds={images} onChange={setImages} maxFiles={8} />
      </section>

      <section className="flex flex-col gap-5 border-t border-border pt-8">
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">{t("sectionItems")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("itemsSubtitle")}</p>
        </div>

        <BundleItemPicker products={pickerProducts} onAdd={addItem} />

        {items.length === 0 ? (
          <p className="text-sm text-ink-soft">{t("noItems")}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {items.map((item) => {
              const itemName =
                locale === "ar"
                  ? item.variantNameAr
                    ? `${item.productNameAr} — ${item.variantNameAr}`
                    : item.productNameAr
                  : item.variantNameFr
                    ? `${item.productNameFr} — ${item.variantNameFr}`
                    : item.productNameFr;
              const itemQty = Number(item.qty) || 0;

              return (
                <div key={item.key} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium text-ink">{itemName}</p>
                    <p className="font-mono text-xs text-ink-soft">{item.productSku}</p>
                    {!item.isActive ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-ink">
                        <AlertTriangle className="size-3" aria-hidden="true" />
                        {t("inactiveComponentWarning")}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-xs text-ink-soft">
                    {t("pickerStock")}: <span className="font-mono text-ink">{item.stock}</span>
                    {item.allowBackorder ? (
                      <span className="ms-1.5 text-xs font-semibold text-ink-soft">{t("pickerBackorder")}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <p className="font-mono text-sm text-ink">{formatMoney(item.price)}</p>
                    <p className="text-xs text-ink-soft">
                      {t("itemSubtotal")}: {formatMoney(item.price * itemQty)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`item-qty-${item.key}`} className="text-xs">
                      {t("qtyLabel")}
                    </Label>
                    <Input
                      id={`item-qty-${item.key}`}
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={item.qty}
                      onChange={(event) => updateItemQty(item.key, event.target.value)}
                      className="h-9 w-20 rounded-xs border-border px-2.5 font-mono focus-visible:border-ink focus-visible:ring-0"
                    />
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

        <div className="flex flex-col gap-1">
          <p className="text-sm text-ink-soft">
            {t("availabilityPreview")}:{" "}
            <span className="font-mono font-medium text-ink">
              {maxSellable === null ? t("availabilityUnlimited") : maxSellable}
            </span>
          </p>
          {limitBy ? (
            <p className="text-xs text-ink-soft">
              {t("limitedBy", { name: locale === "ar" ? limitBy.nameAr : limitBy.nameFr })}
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex flex-col gap-5 border-t border-border pt-8" aria-live="polite">
        {state && !state.ok ? (
          <p role="alert" className="flex items-start gap-2 rounded-xs border border-plum px-3.5 py-2.5 text-sm font-medium text-plum">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {state.error.message}
          </p>
        ) : null}

        {isEditMode && confirmingDelete ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink">
              {t("deleteConfirmPrompt", { name: locale === "ar" ? values.nameAr : values.nameFr })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                ref={confirmDeleteRef}
                disabled={isDeletePending}
                onClick={handleDelete}
                className="h-11 rounded-xs border-plum px-4 text-sm text-plum transition-colors hover:bg-plum hover:text-paper"
              >
                {isDeletePending ? t("deleteSubmitting") : t("delete")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-xs px-4 text-sm"
                onClick={() => setConfirmingDelete(false)}
              >
                {t("cancel")}
              </Button>
            </div>
            {deleteError ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-plum" aria-live="polite">
                <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                {deleteError}
              </p>
            ) : null}
          </div>
        ) : null}

        {items.length === 0 ? <p className="text-sm text-ink-soft">{t("addItemsFirst")}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/bundles"
            className="inline-flex h-11 items-center justify-center rounded-xs border border-border px-5 text-sm font-medium text-ink transition-colors hover:bg-paper"
          >
            {t("back")}
          </Link>

          {isEditMode ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xs border-plum px-5 text-sm text-plum transition-colors hover:bg-plum hover:text-paper"
              onClick={() => setConfirmingDelete(true)}
            >
              {t("delete")}
            </Button>
          ) : null}

          <Button
            type="submit"
            disabled={isPending || items.length === 0}
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
      </div>
    </form>
  );
}
