import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TrackView } from "@/app/[locale]/(store)/track/_view";
import { absoluteUrl, localeAlternates } from "@/src/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "track.seo" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: absoluteUrl(locale, "/track"), languages: localeAlternates("/track") },
    // A per-customer lookup, not a catalog page — nothing here should ever rank, same posture as checkout.
    robots: { index: false, follow: false },
  };
}

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  // Only the order code is ever carried in the URL. The phone number is half
  // of this order's only credential and is typed each time, never linked.
  searchParams: Promise<{ code?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // `?code=` is request-time, and it only prefills one input — no reason to
  // hold the whole lookup form back for it.
  return (
    <Suspense fallback={<TrackView locale={locale} />}>
      <TrackForm locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}

async function TrackForm({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return <TrackView locale={locale} defaultCode={code} />;
}
