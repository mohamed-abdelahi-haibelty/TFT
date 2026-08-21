"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/admin/image-uploader";
import { VariantRow, type VariantFormState } from "@/components/admin/variant-row";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@/src/i18n/navigation";
import { slugify } from "@/src/lib/slug";
import { createProductAction, deleteProductAction, updateProductAction } from "@/src/services/product-actions";
import type { ProductDetail } from "@/src/services/products";

const inputClass = "h-11 rounded-xs border-border px-3.5 focus-visible:border-ink focus-visible:ring-0";
const textareaClass =
  "rounded-xs border border-border px-3.5 py-2.5 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-0";

type FormValues = {
  nameAr: string;
  nameFr: string;
  descriptionAr: string;
  descriptionFr: string;
  categoryId: string;
  slug: string;
  price: string;
  discountPrice: string;
  stockQty: string;
  lowStockThreshold: string;
  allowBackorder: boolean;
  isActive: boolean;
};

export function ProductForm({
  product,
  categoryOptions,
  canEditPricing = true,
}: {
  product?: ProductDetail;
  categoryOptions: { id: string; nameAr: string; nameFr: string }[];
  /**
   * `catalog.manage` without `catalog.pricing`: the form still saves, the two
   * money fields are read-only. They stay in the DOM and keep posting their
   * current values — `updateProduct` compares against what is stored and only
   * refuses an actual change, so an unchanged price is not a rejected save.
   */
  canEditPricing?: boolean;
}) {
  const t = useTranslations("admin.products");
  const isEditMode = !!product;

  const action = isEditMode ? updateProductAction.bind(null, product.id) : createProductAction;
  const [state, formAction, isPending] = useActionState(action, null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const confirmDeleteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingDelete) confirmDeleteRef.current?.focus();
  }, [confirmingDelete]);

  async function handleDelete() {
    if (!product) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteProductAction(product.id, null);
      if (!result.ok) setDeleteError(result.error.message);
    });
  }

  // Every field lives in React state rather than as an uncontrolled
  // `defaultValue` — a failed Server Action submission re-renders this form
  // from a fresh server payload, which resets uncontrolled fields to their
  // original defaultValue (the same issue the sign-in form hit; see
  // progress-tracker.md). State survives that re-render, so a rejected
  // submission (e.g. discount >= price) never throws away what was typed.
  const [values, setValues] = useState<FormValues>(() => ({
    nameAr: product?.nameAr ?? "",
    nameFr: product?.nameFr ?? "",
    descriptionAr: product?.descriptionAr ?? "",
    descriptionFr: product?.descriptionFr ?? "",
    categoryId: product?.categoryId ?? "",
    slug: product?.slug ?? "",
    price: product?.price != null ? String(product.price) : "",
    discountPrice: product?.discountPrice != null ? String(product.discountPrice) : "",
    stockQty: "0",
    lowStockThreshold: product?.lowStockThreshold != null ? String(product.lowStockThreshold) : "5",
    allowBackorder: product?.allowBackorder ?? false,
    isActive: product?.isActive ?? true,
  }));
  const [slugTouched, setSlugTouched] = useState(isEditMode);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const [images, setImages] = useState<string[]>(product?.images.map((i) => i.publicId) ?? []);
  const [variants, setVariants] = useState<VariantFormState[]>(
    (product?.variants ?? []).map((v) => ({
      key: v.id,
      dbId: v.id,
      nameAr: v.nameAr,
      nameFr: v.nameFr,
      colorHex: v.colorHex ?? "",
      stockQty: "",
      images: v.images.map((i) => i.publicId),
      sku: v.sku,
      isActive: v.isActive,
    })),
  );

  function addVariant() {
    setVariants((prev) => [
      ...prev,
      { key: crypto.randomUUID(), nameAr: "", nameFr: "", colorHex: "", stockQty: "0", images: [] },
    ]);
  }

  function updateVariant(key: string, patch: Partial<VariantFormState>) {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  function removeVariant(key: string) {
    setVariants((prev) => prev.filter((v) => v.key !== key));
  }

  const serializedVariants = JSON.stringify(
    variants.map((v) => ({
      id: v.dbId,
      nameAr: v.nameAr,
      nameFr: v.nameFr,
      colorHex: v.colorHex || null,
      stockQty: v.dbId ? null : v.stockQty ? Number(v.stockQty) : null,
      images: v.images,
    })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-10" noValidate>
      <input type="hidden" name="images" value={JSON.stringify(images)} readOnly />
      <input type="hidden" name="variants" value={serializedVariants} readOnly />

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold text-ink">{t("sectionGeneral")}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-name-ar">{t("nameArLabel")}</Label>
            <Input
              id="product-name-ar"
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
            <Label htmlFor="product-name-fr">{t("nameFrLabel")}</Label>
            <Input
              id="product-name-fr"
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
            <Label htmlFor="product-description-ar">{t("descriptionArLabel")}</Label>
            <textarea
              id="product-description-ar"
              name="descriptionAr"
              dir="rtl"
              value={values.descriptionAr}
              onChange={(event) => set("descriptionAr", event.target.value)}
              rows={4}
              className={textareaClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-description-fr">{t("descriptionFrLabel")}</Label>
            <textarea
              id="product-description-fr"
              name="descriptionFr"
              value={values.descriptionFr}
              onChange={(event) => set("descriptionFr", event.target.value)}
              rows={4}
              className={textareaClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-category">{t("categoryLabel")}</Label>
            <Select
              name="categoryId"
              value={values.categoryId}
              onValueChange={(value) => set("categoryId", value ?? "")}
            >
              <SelectTrigger id="product-category" size="lg" className="w-full">
                <SelectValue placeholder={t("categoryPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.nameFr} — {category.nameAr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-slug">{t("slugLabel")}</Label>
            <Input
              id="product-slug"
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
                {product.sku}
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
            <Label htmlFor="product-price">{t("priceLabel")}</Label>
            <Input
              id="product-price"
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
            <Label htmlFor="product-discount-price">{t("discountPriceLabel")}</Label>
            <Input
              id="product-discount-price"
              name="discountPrice"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={values.discountPrice}
              onChange={(event) => set("discountPrice", event.target.value)}
              readOnly={!canEditPricing}
              aria-readonly={!canEditPricing || undefined}
              className={`${inputClass} font-mono ${canEditPricing ? "" : "cursor-not-allowed bg-paper text-ink-soft"}`}
            />
          </div>

          {!isEditMode ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-stock-qty">{t("stockQtyLabel")}</Label>
              <Input
                id="product-stock-qty"
                name="stockQty"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={values.stockQty}
                onChange={(event) => set("stockQty", event.target.value)}
                required
                className={`${inputClass} font-mono`}
              />
              <p className="text-xs text-ink-soft">{t("stockQtyHint")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>{t("stockQtyLabel")}</Label>
              <p className="flex h-11 items-center rounded-xs border border-border bg-paper px-3.5 font-mono text-sm text-ink-soft">
                {product.stockQty}
              </p>
              <p className="text-xs text-ink-soft">{t("stockQtyHint")}</p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-low-stock-threshold">{t("lowStockThresholdLabel")}</Label>
            <Input
              id="product-low-stock-threshold"
              name="lowStockThreshold"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={values.lowStockThreshold}
              onChange={(event) => set("lowStockThreshold", event.target.value)}
              required
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
          <label className="flex items-center gap-2.5 text-sm font-medium text-ink">
            <input
              type="checkbox"
              name="allowBackorder"
              checked={values.allowBackorder}
              onChange={(event) => set("allowBackorder", event.target.checked)}
              className="size-5 rounded-xs border-border accent-ink"
            />
            {t("allowBackorderLabel")}
          </label>
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
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <h2 className="font-heading text-lg font-semibold text-ink">{t("sectionImages")}</h2>
        <ImageUploader initialPublicIds={images} onChange={setImages} maxFiles={8} />
      </section>

      <section className="flex flex-col gap-5 border-t border-border pt-8">
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">{t("sectionVariants")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("variantsSubtitle")}</p>
        </div>

        {variants.length === 0 ? <p className="text-sm text-ink-soft">{t("noVariants")}</p> : null}

        <div className="flex flex-col gap-6">
          {variants.map((variant) => (
            <VariantRow
              key={variant.key}
              variant={variant}
              productId={product?.id}
              onChange={(patch) => updateVariant(variant.key, patch)}
              onRemove={() => removeVariant(variant.key)}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={addVariant}
          className="h-10 w-fit gap-1.5 rounded-xs border-border px-4 text-sm"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("addVariant")}
        </Button>
      </section>

      <div className="flex flex-col gap-5 border-t border-border pt-8" aria-live="polite">
        {state && !state.ok ? (
          <p role="alert" className="mb-4 flex items-start gap-2 rounded-xs border border-plum px-3.5 py-2.5 text-sm font-medium text-plum">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {state.error.message}
          </p>
        ) : null}

        {isEditMode && confirmingDelete ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink">{t("deleteConfirmPrompt", { name: product.nameFr })}</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                ref={confirmDeleteRef}
                disabled={isDeletePending}
                onClick={handleDelete}
                className="h-9 rounded-xs border-plum px-4 text-xs text-plum transition-colors hover:bg-plum hover:text-paper"
              >
                {isDeletePending ? t("deleteSubmitting") : t("delete")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-xs px-4 text-xs"
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

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/products"
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
            disabled={isPending}
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
