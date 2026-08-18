import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckoutView } from "@/components/store/checkout-view";
import { absoluteUrl, localeAlternates } from "@/src/lib/site";
import { getShopSettings } from "@/src/services/settings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout.seo" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: absoluteUrl(locale, "/checkout"), languages: localeAlternates("/checkout") },
    // A transactional, per-customer page — nothing here should ever rank.
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const settings = await getShopSettings();

  return <CheckoutView locale={locale} whatsappNumber={settings.whatsappNumber} />;
}
