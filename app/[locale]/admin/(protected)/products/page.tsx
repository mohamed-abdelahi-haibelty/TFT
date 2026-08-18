import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { ProductRowActions } from "@/components/admin/product-row-actions";
import { QuickPickManager } from "@/components/admin/quick-pick-manager";
import { QuickPickToggle } from "@/components/admin/quick-pick-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@/src/i18n/navigation";
import { formatMoney } from "@/src/lib/money";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { listCategories } from "@/src/services/categories";
import { listProducts } from "@/src/services/products";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.products" });
  return { title: t("title") };
}

export default async function AdminProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; category?: string; activeOnly?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const auth = await requireUser();
  if (!auth.ok) return null;

  if (!hasPermission(auth.data, "catalog.view")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const [productsResult, categoriesResult] = await Promise.all([
    listProducts({
      search: query.q,
      categoryId: query.category,
      activeOnly: query.activeOnly === "on",
    }),
    listCategories(),
  ]);
  const products = productsResult.ok ? productsResult.data : [];
  const categories = categoriesResult.ok ? categoriesResult.data : [];

  const t = await getTranslations("admin.products");

  const quickPickItems = products
    .filter((product) => product.isQuickPick)
    .sort((a, b) => (a.quickPickSort ?? 0) - (b.quickPickSort ?? 0))
    .map((product) => ({ id: product.id, nameAr: product.nameAr, nameFr: product.nameFr }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("subtitle")}</p>
        </div>
        {hasPermission(auth.data, "catalog.pricing") ? (
          <Link
            href="/admin/products/new"
            className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-[color-mix(in_oklch,var(--ink),white_10%)] active:translate-y-0"
          >
            {t("addProduct")}
          </Link>
        ) : null}
      </div>

      {hasPermission(auth.data, "catalog.manage") ? <QuickPickManager items={quickPickItems} /> : null}

      <form className="flex flex-wrap items-center gap-3" method="get">
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          placeholder={t("searchPlaceholder")}
          className="h-10 min-w-56 flex-1 rounded-md border border-border px-3.5 text-sm text-ink outline-none focus-visible:border-gold focus-visible:ring-3 focus-visible:ring-gold/30"
        />
        <Select name="category" defaultValue={query.category ?? ""}>
          <SelectTrigger size="md" className="w-40">
            <SelectValue placeholder={t("categoryFilterAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("categoryFilterAll")}</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.nameFr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="activeOnly"
            defaultChecked={query.activeOnly === "on"}
            className="size-5 rounded border-border accent-gold"
          />
          {t("activeOnlyLabel")}
        </label>
        <button
          type="submit"
          className="h-10 rounded-full border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          {t("filterSubmit")}
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-180 border-collapse text-start">
          <thead>
            <tr className="border-b-2 border-border text-start">
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableName")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableCategory")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tablePrice")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableStock")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableStatus")}
              </th>
              {hasPermission(auth.data, "catalog.manage") ? (
                <>
                  <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                    {t("tablePos")}
                  </th>
                  <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                    {t("tableActions")}
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={hasPermission(auth.data, "catalog.manage") ? 7 : 5}
                  className="px-5 py-8 text-center text-sm text-ink-soft"
                >
                  {t("empty")}
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const isLow = product.stockQty > 0 && product.stockQty <= product.lowStockThreshold;
                const isOut = product.stockQty === 0;

                return (
                  <tr
                    key={product.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-paper"
                  >
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-nowrap text-ink">{product.nameFr}</p>
                      <p className="font-mono text-xs text-ink-soft">{product.sku}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-ink-soft">{product.categoryNameFr}</td>
                    <td className="px-5 py-4 font-mono text-sm text-ink">
                      {product.discountPrice != null ? (
                        <>
                          <span className="text-ink-soft line-through">{formatMoney(product.price)}</span>{" "}
                          <span className="text-ink">{formatMoney(product.discountPrice)}</span>
                        </>
                      ) : (
                        formatMoney(product.price)
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm text-ink">{product.stockQty}</span>
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-bg px-2 py-0.5 text-xs font-semibold text-red-text">
                            <AlertTriangle className="size-3" aria-hidden="true" />
                            {t("outOfStock")}
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-gold-strong">
                            <AlertTriangle className="size-3" aria-hidden="true" />
                            {t("lowStock")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={
                          product.isActive
                            ? "inline-flex items-center gap-1.5 rounded-full bg-green-bg px-2.5 py-1 text-xs font-semibold text-green-text"
                            : "inline-flex items-center gap-1.5 rounded-full bg-red-bg px-2.5 py-1 text-xs font-semibold text-red-text"
                        }
                      >
                        <span
                          className={
                            product.isActive ? "size-2 rounded-full bg-green" : "size-2 rounded-full bg-red"
                          }
                        />
                        {product.isActive ? t("statusActive") : t("statusInactive")}
                      </span>
                    </td>
                    {hasPermission(auth.data, "catalog.manage") ? (
                      <>
                        <td className="px-5 py-4">
                          <QuickPickToggle productId={product.id} isQuickPick={product.isQuickPick} />
                        </td>
                        <td className="px-5 py-4">
                          <ProductRowActions productId={product.id} isActive={product.isActive} />
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
