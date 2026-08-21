"use client";

import { useTranslations } from "next-intl";
import { CircleCheck, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/admin/image-uploader";
import { useRouter } from "@/src/i18n/navigation";
import { toggleVariantActiveAction } from "@/src/services/product-actions";

export type VariantFormState = {
  /** Stable React key — also the DB id once persisted. */
  key: string;
  /** Present only for a variant that already exists in the DB. */
  dbId?: string;
  nameAr: string;
  nameFr: string;
  colorHex: string;
  /** Initial stock, only meaningful (and only sent) for a not-yet-created variant. */
  stockQty: string;
  images: string[];
  sku?: string;
  isActive?: boolean;
};

const inputClass =
  "h-10 rounded-md border-border px-3 text-sm focus-visible:border-ink focus-visible:ring-0";

export function VariantRow({
  variant,
  productId,
  onChange,
  onRemove,
}: {
  variant: VariantFormState;
  productId?: string;
  onChange: (patch: Partial<VariantFormState>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("admin.products");
  const router = useRouter();
  const isSaved = !!variant.dbId;

  return (
    <div className="rounded-lg border border-border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t("variantNameArLabel")}</Label>
            <Input
              type="text"
              dir="rtl"
              value={variant.nameAr}
              onChange={(event) => onChange({ nameAr: event.target.value })}
              required
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("variantNameFrLabel")}</Label>
            <Input
              type="text"
              value={variant.nameFr}
              onChange={(event) => onChange({ nameFr: event.target.value })}
              required
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("variantColorLabel")}</Label>
            <input
              type="color"
              value={variant.colorHex || "#000000"}
              onChange={(event) => onChange({ colorHex: event.target.value })}
              className="h-10 w-full cursor-pointer rounded-md border border-border bg-transparent p-1"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSaved ? (
            <span className="rounded-xs border border-border px-2.5 py-1 font-mono text-xs text-ink-soft">
              {variant.sku}
            </span>
          ) : null}
          {!isSaved ? (
            <button
              type="button"
              aria-label={t("removeVariant")}
              onClick={onRemove}
              className="flex size-8 items-center justify-center rounded-xs text-ink-soft transition-colors hover:bg-plum hover:text-paper"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {isSaved ? (
        <div className="mt-3 flex items-center gap-3">
          <span
            className={
              variant.isActive
                ? "inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-semibold text-ink"
                : "inline-flex items-center gap-1.5 rounded-xs border border-ink px-2.5 py-1 text-xs font-semibold text-ink"
            }
          >
            {variant.isActive ? (
              <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            {variant.isActive ? t("variantActive") : t("variantInactive")}
          </span>
          {productId && variant.dbId ? (
            <Button
              type="button"
              variant="ghost"
              className="h-7 rounded-xs px-3 text-xs"
              onClick={async () => {
                // A <form> here would nest inside ProductForm's own <form>,
                // which is invalid HTML (browsers reparent it and React 19
                // then flags the resulting phantom submit) — call the action
                // directly instead, same fix as the category reorder buttons.
                await toggleVariantActiveAction(productId, variant.dbId!, !variant.isActive);
                router.refresh();
              }}
            >
              {variant.isActive ? t("deactivate") : t("activate")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5 sm:w-48">
          <Label>{t("variantStockLabel")}</Label>
          <Input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={variant.stockQty}
            onChange={(event) => onChange({ stockQty: event.target.value })}
            className={`${inputClass} font-mono`}
          />
        </div>
      )}
      {isSaved ? <p className="mt-2 text-xs text-ink-soft">{t("variantStockLockedHint")}</p> : null}

      <div className="mt-4 flex flex-col gap-1.5">
        <Label>{t("variantImagesLabel")}</Label>
        <ImageUploader
          initialPublicIds={variant.images}
          onChange={(ids) => onChange({ images: ids })}
          maxFiles={4}
        />
      </div>
    </div>
  );
}
