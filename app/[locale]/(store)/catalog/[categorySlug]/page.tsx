import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogShellSkeleton, CatalogView } from "@/app/[locale]/(store)/catalog/_view";
import { localized } from "@/src/lib/locale-text";
import { absoluteUrl, localeAlternates } from "@/src/lib/site";
import { getStorefrontCategories, getStorefrontCategoriesCore } from "@/src/services/storefront";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; categorySlug: string }>;
}): Promise<Metadata> {
  const { locale, categorySlug } = await params;
  const [t, categories] = await Promise.all([
    getTranslations({ locale, namespace: "catalog.seo" }),
    getStorefrontCategories(),
  ]);
  const category = categories.find((candidate) => candidate.slug === categorySlug);
  const path = `/catalog/${categorySlug}`;

  return {
    title: category ? t("categoryTitle", { category: localized(locale, category.nameAr, category.nameFr) }) : t("title"),
    description: t("description"),
    alternates: { canonical: absoluteUrl(locale, path), languages: localeAlternates(path) },
  };
}

/**
 * Prerenders one shell for every category (see `generateStaticParams`), with
 * both the category slug and `searchParams` resolved inside the boundary —
 * awaiting either at the top would block the shell for all of them.
 */
export default async function CatalogCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; categorySlug: string }>;
  searchParams: Promise<{ q?: string; min?: string; max?: string; stock?: string; sort?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<CatalogShellSkeleton />}>
      <CatalogView locale={locale} params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * One prerendered shell per category. Categories are a small, closed set that
 * changes only when an admin edits one — and `revalidateTag("categories")`
 * already fires there. A slug not in this list is still served: Next hands
 * back the App Shell immediately and upgrades it once the param is known.
 */
export async function generateStaticParams() {
  const categories = await getStorefrontCategoriesCore();
  return categories.map((category) => ({ categorySlug: category.slug }));
}
