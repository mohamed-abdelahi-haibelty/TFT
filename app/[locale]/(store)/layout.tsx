import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CartDrawer } from "@/components/store/cart-drawer";
import { CartDrawerProvider } from "@/components/store/cart-drawer-context";
import { SiteFooter } from "@/components/store/site-footer";
import { SiteHeader } from "@/components/store/site-header";
import { pickMessages, STORE_MESSAGE_NAMESPACES } from "@/src/i18n/messages";

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, messages] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    pickMessages(STORE_MESSAGE_NAMESPACES),
  ]);

  return (
    // Nested inside the root provider and replacing it for this subtree: the
    // storefront's client components get their own namespaces and none of
    // admin's. See src/i18n/messages.ts.
    <NextIntlClientProvider messages={messages}>
      <CartDrawerProvider>
        <div className="storefront flex min-h-full flex-1 flex-col bg-background">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-[60] focus:inline-flex focus:bg-ink focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:tracking-[0.04em] focus:text-paper focus:uppercase"
          >
            {t("skipToContent")}
          </a>
          <SiteHeader locale={locale} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter locale={locale} />
          <CartDrawer />
        </div>
      </CartDrawerProvider>
    </NextIntlClientProvider>
  );
}
