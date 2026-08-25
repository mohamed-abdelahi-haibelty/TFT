import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogShellSkeleton, CatalogView } from "@/app/[locale]/(store)/catalog/_view";
import { absoluteUrl, localeAlternates } from "@/src/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "catalog.seo" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: absoluteUrl(locale, "/catalog"), languages: localeAlternates("/catalog") },
  };
}

/**
 * `searchParams` is request-time by definition, so awaiting it here would
 * block the whole route's prerender. `CatalogView` awaits it inside this
 * boundary instead: the shell (header, category rail, filter form) is
 * prerendered and served instantly, and only the results grid streams in.
 */
export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; min?: string; max?: string; stock?: string; sort?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<CatalogShellSkeleton />}>
      <CatalogView locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
