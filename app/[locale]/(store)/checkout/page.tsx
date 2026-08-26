import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckoutView } from "@/components/store/checkout-view";
import { buildPageMetadata, NOINDEX } from "@/src/lib/seo";
import { getShopSettings } from "@/src/services/settings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout.seo" });

  return buildPageMetadata({
    locale,
    path: "/checkout",
    title: t("title"),
    description: t("description"),
    // A transactional, per-customer page — nothing here should ever rank. It
    // stays crawlable in robots.txt on purpose: a `Disallow` would stop the
    // crawler ever reading this directive.
    extra: NOINDEX,
  });
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const settings = await getShopSettings();

  return <CheckoutView locale={locale} whatsappNumber={settings.whatsappNumber} />;
}
