import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { CategoryRow } from "@/components/admin/category-row";
import { CreateCategoryForm } from "@/components/admin/create-category-form";
import { listCategories } from "@/src/services/categories";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.categories" });
  return { title: t("title") };
}

export default async function AdminCategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireUser();
  if (!auth.ok) return null;

  if (!hasPermission(auth.data, "catalog.view")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const result = await listCategories();
  const categories = result.ok ? result.data : [];
  const allIds = categories.map((category) => category.id);

  const t = await getTranslations("admin.categories");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("subtitle")}</p>
        </div>
        {hasPermission(auth.data, "catalog.manage") ? <CreateCategoryForm /> : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-140 border-collapse text-start">
          <caption className="sr-only">{t("tableCaption")}</caption>
          <thead>
            <tr className="border-b-2 border-border text-start">
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableNameAr")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableNameFr")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableSlug")}
              </th>
              {hasPermission(auth.data, "catalog.manage") ? (
                <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                  {t("tableActions")}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td
                  colSpan={hasPermission(auth.data, "catalog.manage") ? 4 : 3}
                  className="px-5 py-8 text-center text-sm text-ink-soft"
                >
                  {t("empty")}
                </td>
              </tr>
            ) : hasPermission(auth.data, "catalog.manage") ? (
              categories.map((category, index) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  allIds={allIds}
                  index={index}
                />
              ))
            ) : (
              categories.map((category) => (
                <tr
                  key={category.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-paper"
                >
                  <td className="px-5 py-4 text-sm font-medium text-ink" dir="rtl">
                    {category.nameAr}
                  </td>
                  <td className="px-5 py-4 text-sm text-ink">{category.nameFr}</td>
                  <td className="px-5 py-4 font-mono text-sm text-ink-soft">{category.slug}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
