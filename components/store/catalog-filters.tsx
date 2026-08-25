import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";

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
    "h-11 rounded-[2px] border border-border bg-background px-3 text-base text-ink outline-none focus-visible:border-ink md:text-sm";
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
          {/* A native `<select>`, not the `ui/select` primitive. Three static
              options inside a form that already submits without JavaScript —
              and the Base UI version was the *only* thing pulling
              @base-ui/react into this route, at ~168 KB of uncompressed client
              JS that also has to hydrate before the control does anything. The
              native one works from first paint, gets the platform picker on a
              low-end phone, and drops the `items`-vs-`SelectItem` identity
              workaround this needed to render its own labels across the RSC
              boundary. */}
          <div className="relative">
            <select
              id="catalog-sort"
              name="sort"
              defaultValue={values.sort ?? "newest"}
              className={`${fieldClass} w-full appearance-none pe-9`}
            >
              <option value="newest">{t("sortNewest")}</option>
              <option value="price-asc">{t("sortPriceAsc")}</option>
              <option value="price-desc">{t("sortPriceDesc")}</option>
            </select>
            <ChevronDown
              className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
              aria-hidden="true"
            />
          </div>
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
