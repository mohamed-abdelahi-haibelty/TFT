"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localized } from "@/src/lib/locale-text";
import { formatMoney } from "@/src/lib/money";
import type {
  PromotionPickerBundle,
  PromotionPickerCategory,
  PromotionPickerProduct,
} from "@/src/services/promotions";

type Tab = "products" | "bundles";

export function PromotionItemPicker({
  categories,
  products,
  bundles,
  selectedProductIds,
  selectedBundleIds,
  onAddProduct,
  onAddBundle,
  onAddCategory,
}: {
  categories: PromotionPickerCategory[];
  products: PromotionPickerProduct[];
  bundles: PromotionPickerBundle[];
  selectedProductIds: string[];
  selectedBundleIds: string[];
  onAddProduct: (product: PromotionPickerProduct) => void;
  onAddBundle: (bundle: PromotionPickerBundle) => void;
  onAddCategory: (categoryId: string) => void;
}) {
  const t = useTranslations("admin.promotions");
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("products");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const selectedProducts = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);
  const selectedBundles = useMemo(() => new Set(selectedBundleIds), [selectedBundleIds]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (categoryId && product.categoryId !== categoryId) return false;
      if (!term) return true;
      return (
        product.nameFr.toLowerCase().includes(term) ||
        product.nameAr.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term)
      );
    });
  }, [products, search, categoryId]);

  const filteredBundles = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return bundles;
    return bundles.filter(
      (bundle) =>
        bundle.nameFr.toLowerCase().includes(term) ||
        bundle.nameAr.toLowerCase().includes(term) ||
        bundle.sku.toLowerCase().includes(term),
    );
  }, [bundles, search]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xs border border-border p-1">
          {(["products", "bundles"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={
                tab === value
                  ? "rounded-xs bg-ink px-4 py-2 text-sm font-medium text-paper focus-visible:ring-0"
                  : "rounded-xs px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink focus-visible:ring-0"
              }
            >
              {value === "products" ? t("pickerTabProducts") : t("pickerTabBundles")}
            </button>
          ))}
        </div>

        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-soft"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("pickerSearchPlaceholder")}
            className="h-10 w-full rounded-md border border-border ps-9 pe-3.5 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-0"
          />
        </div>

        {tab === "products" ? (
          <>
            <Select value={categoryId} onValueChange={(value) => setCategoryId(value ?? "")}>
              <SelectTrigger size="md" className="w-44">
                <SelectValue placeholder={t("pickerCategoryAll")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("pickerCategoryAll")}</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {localized(locale, category.nameAr, category.nameFr)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              disabled={!categoryId}
              onClick={() => onAddCategory(categoryId)}
              className="inline-flex h-11 items-center rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50"
            >
              {t("pickerAddCategory")}
            </button>
          </>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="max-h-72 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-140 border-collapse text-start">
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
                <th className="w-10 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {tab === "products" ? (
                filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-soft">
                      {t("pickerEmpty")}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-paper"
                    >
                      <td className="px-4 py-2.5 text-sm text-ink">{localized(locale, product.nameAr, product.nameFr)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{product.sku}</td>
                      <td className="px-4 py-2.5 font-mono text-sm text-ink">{formatMoney(product.price)}</td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          aria-label={t("addItem")}
                          disabled={selectedProducts.has(product.id)}
                          onClick={() => onAddProduct(product)}
                          className="flex size-11 items-center justify-center rounded-xs text-ink-soft transition-colors hover:bg-paper hover:text-ink focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Plus className="size-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))
                )
              ) : filteredBundles.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-soft">
                    {t("pickerEmpty")}
                  </td>
                </tr>
              ) : (
                filteredBundles.map((bundle) => (
                  <tr
                    key={bundle.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-paper"
                  >
                    <td className="px-4 py-2.5 text-sm text-ink">{localized(locale, bundle.nameAr, bundle.nameFr)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{bundle.sku}</td>
                    <td className="px-4 py-2.5 font-mono text-sm text-ink">{formatMoney(bundle.price)}</td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        aria-label={t("addItem")}
                        disabled={selectedBundles.has(bundle.id)}
                        onClick={() => onAddBundle(bundle)}
                        className="flex size-8 items-center justify-center rounded-xs text-ink-soft transition-colors hover:bg-paper hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Plus className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
