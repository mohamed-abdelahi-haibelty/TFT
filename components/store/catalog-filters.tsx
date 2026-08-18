import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CatalogFilterValues = {
  q?: string;
  min?: string;
  max?: string;
  stock?: string;
  sort?: string;
};

/**
 * Zero-JS filter form (task 09): a plain `method="get"` submit to the
 * current catalog path. The browser itself puts every field into the URL
 * search params — shareable, back-button-safe, and server-rendered — with
 * no client state to keep in sync. An explicit "Filtrer" button (rather than
 * auto-submitting on change) matches PRODUCT.md's audience constraint:
 * unambiguous, labeled actions, not a page that reflows as you type.
 *
 * Below `lg`, the five stacked fields are real vertical weight ahead of the
 * product grid — on the primary mobile surface that means scrolling past a
 * form before seeing a single product. A native `<details>` disclosure
 * (zero JS, same as the form itself) keeps it collapsed by default on
 * mobile — auto-expanded only when a filter is already active, e.g. via a
 * shared/back-button URL — and forced open at `lg:` where it already reads
 * as one compact row.
 */
export async function CatalogFilters({
  locale,
  action,
  values,
}: {
  locale: string;
  action: string;
  values: CatalogFilterValues;
}) {
  const t = await getTranslations({ locale, namespace: "catalog.filters" });

  const fieldClass =
    "h-11 rounded-[2px] border border-border bg-background px-3 text-sm text-ink outline-none focus-visible:border-ink";
  const labelClass = "text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase";
  const hasActiveFilters = Boolean(
    values.q || values.min || values.max || values.stock === "1" || (values.sort && values.sort !== "newest"),
  );

  return (
    <details className="group border border-border lg:border-0" open={hasActiveFilters || undefined}>
      <summary className="flex h-11 cursor-pointer items-center justify-between gap-2 px-4 text-xs font-semibold tracking-[0.04em] text-ink uppercase lg:hidden">
        {t("toggle")}
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>

      <form
        action={action}
        method="get"
        className="grid gap-4 border-t border-border p-4 sm:grid-cols-2 sm:p-5 lg:grid! lg:grid-cols-6 lg:items-end lg:border-t-0 lg:p-0"
      >
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
          <label htmlFor="catalog-q" className={labelClass}>
            {t("searchLabel")}
          </label>
          <input
            id="catalog-q"
            type="search"
            name="q"
            defaultValue={values.q}
            placeholder={t("searchPlaceholder")}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="catalog-min" className={labelClass}>
            {t("minPrice")}
          </label>
          <input
            id="catalog-min"
            type="number"
            min={0}
            inputMode="numeric"
            name="min"
            defaultValue={values.min}
            className={`${fieldClass} font-mono`}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="catalog-max" className={labelClass}>
            {t("maxPrice")}
          </label>
          <input
            id="catalog-max"
            type="number"
            min={0}
            inputMode="numeric"
            name="max"
            defaultValue={values.max}
            className={`${fieldClass} font-mono`}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="catalog-sort" className={labelClass}>
            {t("sortLabel")}
          </label>
          {/* `items` is passed explicitly because this is a *server*
              component: `Select` derives labels by matching children against
              the `SelectItem` function identity, and that identity does not
              survive the RSC boundary, so the trigger fell back to printing
              the raw enum ("newest") in both locales. */}
          <Select
            name="sort"
            defaultValue={values.sort ?? "newest"}
            items={{
              newest: t("sortNewest"),
              "price-asc": t("sortPriceAsc"),
              "price-desc": t("sortPriceDesc"),
            }}
          >
            <SelectTrigger
              id="catalog-sort"
              size="lg"
              className="w-full rounded-[2px]! focus-visible:border-ink! focus-visible:ring-0!"
            >
              <SelectValue placeholder={t("sortLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t("sortNewest")}</SelectItem>
              <SelectItem value="price-asc">{t("sortPriceAsc")}</SelectItem>
              <SelectItem value="price-desc">{t("sortPriceDesc")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4 sm:col-span-2 lg:col-span-6">
          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              name="stock"
              value="1"
              defaultChecked={values.stock === "1"}
              className="size-4 rounded-[2px] border border-border accent-ink"
            />
            {t("inStockOnly")}
          </label>
          <button
            type="submit"
            className="h-11 shrink-0 rounded-[2px] bg-ink px-6 text-xs font-semibold tracking-[0.05em] text-paper uppercase transition-colors hover:bg-[oklch(0.29_0.012_59.14)]"
          >
            {t("submit")}
          </button>
        </div>
      </form>
    </details>
  );
}
