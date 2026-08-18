import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogView } from "@/app/[locale]/(store)/catalog/_view";
import { localized } from "@/src/lib/locale-text";
import { absoluteUrl, localeAlternates } from "@/src/lib/site";
import { getStorefrontCategories } from "@/src/services/storefront";

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

export default async function CatalogCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; categorySlug: string }>;
  searchParams: Promise<{ q?: string; min?: string; max?: string; stock?: string; sort?: string }>;
}) {
  const { locale, categorySlug } = await params;
  setRequestLocale(locale);
  const resolvedSearchParams = await searchParams;

  return <CatalogView locale={locale} categorySlug={categorySlug} searchParams={resolvedSearchParams} />;
}
