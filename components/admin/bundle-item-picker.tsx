"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Plus, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localized } from "@/src/lib/locale-text";
import { formatMoney } from "@/src/lib/money";
import type { BundlePickerProduct } from "@/src/services/bundles";

export function BundleItemPicker({
  products,
  onAdd,
}: {
  products: BundlePickerProduct[];
  onAdd: (product: BundlePickerProduct, variantId: string | null) => void;
}) {
  const t = useTranslations("admin.bundles");
  // The admin defaults to Arabic; the picker only ever printed French names.
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [variantChoice, setVariantChoice] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const addedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (product) =>
        product.nameFr.toLowerCase().includes(term) ||
        product.nameAr.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term),
    );
  }, [products, search]);

  function handleAdd(product: BundlePickerProduct, variantId: string | null) {
    onAdd(product, variantId || null);
    setVariantChoice((prev) => ({ ...prev, [product.id]: "" }));
    setAdded((prev) => ({ ...prev, [product.id]: true }));
    if (addedTimers.current[product.id]) clearTimeout(addedTimers.current[product.id]);
    addedTimers.current[product.id] = setTimeout(() => {
      setAdded((prev) => ({ ...prev, [product.id]: false }));
    }, 600);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-soft"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("pickerSearchPlaceholder")}
          className="h-10 w-full rounded-xs border border-border ps-9 pe-3.5 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-0"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="max-h-72 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-160 border-collapse text-start">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b-2 border-border">
                <th className="px-4 py-2.5 text-start text-xs font-semibold tracking-wide text-ink-soft">
                  {t("pickerName")}
                </th>
                <th className="px-4 py-2.5 text-start text-xs font-semibold tracking-wide text-ink-soft">
                  {t("pickerSku")}
                </th>
                <th className="px-4 py-2.5 text-start text-xs font-semibold tracking-wide text-ink-soft">
                  {t("pickerPrice")}
                </th>
                <th className="px-4 py-2.5 text-start text-xs font-semibold tracking-wide text-ink-soft">
                  {t("pickerStock")}
                </th>
                <th className="px-4 py-2.5 text-start text-xs font-semibold tracking-wide text-ink-soft">
                  {t("pickerVariant")}
                </th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-soft">
                    {t("pickerEmpty")}
                  </td>
                </tr>
              ) : (
                filtered.map((product) => {
                  const chosenVariantId = variantChoice[product.id] ?? "";
                  const effectivePrice = product.discountPrice ?? product.price;
                  const isAdded = Boolean(added[product.id]);
                  return (
                    <tr
                      key={product.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-paper"
                    >
                      <td className="px-4 py-2.5 text-sm text-ink">{localized(locale, product.nameAr, product.nameFr)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{product.sku}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-baseline gap-1">
                          <span className="font-mono text-sm text-ink">{formatMoney(effectivePrice)}</span>
                          {product.discountPrice != null ? (
                            <span className="font-mono text-xs text-ink-soft line-through">
                              {formatMoney(product.price)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm text-ink">{product.stockQty}</span>
                          {product.allowBackorder ? (
                            <span className="text-xs font-semibold text-ink-soft">{t("pickerBackorder")}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {product.variants.length > 0 ? (
                          <Select
                            value={chosenVariantId}
                            onValueChange={(value) =>
                              setVariantChoice((prev) => ({ ...prev, [product.id]: value ?? "" }))
                            }
                          >
                            <SelectTrigger
                              size="md"
                              className="w-40"
                              aria-label={t("pickerVariantSelect", { name: localized(locale, product.nameAr, product.nameFr) })}
                            >
                              <SelectValue placeholder={t("pickerVariantNone")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">{t("pickerVariantNone")}</SelectItem>
                              {product.variants.map((variant) => (
                                <SelectItem key={variant.id} value={variant.id}>
                                  {localized(locale, variant.nameAr, variant.nameFr)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-ink-soft">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          aria-label={isAdded ? t("pickerAdded") : t("addItem")}
                          disabled={isAdded}
                          onClick={() => handleAdd(product, chosenVariantId || null)}
                          className="flex size-11 items-center justify-center rounded-xs text-ink-soft transition-colors hover:bg-ink hover:text-paper disabled:text-ink"
                        >
                          {isAdded ? (
                            <Check className="size-4" aria-hidden="true" />
                          ) : (
                            <Plus className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
