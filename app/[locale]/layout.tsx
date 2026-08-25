import type { Metadata } from "next";
import { Suspense } from "react";
import { Fraunces, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import localFont from "next/font/local";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { pickMessages, ROOT_MESSAGE_NAMESPACES } from "@/src/i18n/messages";
import { routing } from "@/src/i18n/routing";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import { absoluteUrl, localeAlternates, siteOrigin } from "@/src/lib/site";
import "../globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-latin",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Latin storefront display face — "Atelier Blanc": an editorial serif
// headline paired with the existing Plus Jakarta Sans body, replacing the
// bold-sans-only display role the previous storefront direction used.
const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

// Arabic UI/body face — public/fonts/thmanyahsans
const thmanyahSans = localFont({
  variable: "--font-arabic",
  display: "swap",
  src: [
    { path: "../../public/fonts/thmanyahsans/thmanyahsans-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/thmanyahsans/thmanyahsans-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/thmanyahsans/thmanyahsans-Bold.woff2", weight: "700", style: "normal" },
  ],
});

// Arabic long-form reading face — public/fonts/thmanyahseriftext
const thmanyahSerifText = localFont({
  variable: "--font-arabic-reading",
  display: "swap",
  src: [
    { path: "../../public/fonts/thmanyahseriftext/thmanyahseriftext-Light.woff2", weight: "300", style: "normal" },
    { path: "../../public/fonts/thmanyahseriftext/thmanyahseriftext-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/thmanyahseriftext/thmanyahseriftext-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/thmanyahseriftext/thmanyahseriftext-Bold.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/thmanyahseriftext/thmanyahseriftext-Black.woff2", weight: "900", style: "normal" },
  ],
});

// Arabic display/hero face — public/fonts/thmanyahserifdisplay
const thmanyahSerifDisplay = localFont({
  variable: "--font-arabic-display",
  display: "swap",
  src: [
    { path: "../../public/fonts/thmanyahserifdisplay/thmanyahserifdisplay-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/thmanyahserifdisplay/thmanyahserifdisplay-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/thmanyahserifdisplay/thmanyahserifdisplay-Bold.woff2", weight: "700", style: "normal" },
  ],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  const tHome = await getTranslations({ locale, namespace: "home.seo" });

  return {
    metadataBase: new URL(siteOrigin()),
    title: { default: t("appName"), template: `%s · ${t("appName")}` },
    description: tHome("description"),
    alternates: { canonical: absoluteUrl(locale), languages: localeAlternates() },
    openGraph: { siteName: t("appName"), locale, type: "website" },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const dir = locale === "ar" ? "rtl" : "ltr";

  // Only what a client component *outside* a route group can reach (today,
  // `error.tsx`). The storefront and admin layouts each declare their own,
  // larger set — see src/i18n/messages.ts for why this isn't just the whole
  // catalog.
  const messages = await pickMessages(ROOT_MESSAGE_NAMESPACES);

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${plusJakartaSans.variable} ${fraunces.variable} ${thmanyahSans.variable} ${thmanyahSerifText.variable} ${thmanyahSerifDisplay.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          {children}
          {/* Reads `usePathname()`, which suspends while Next generates the
              App Shell for any route below with params it doesn't yet know.
              It renders null either way, so a null fallback costs nothing and
              keeps the shell prerenderable. */}
          <Suspense fallback={null}>
            <PostHogProvider />
          </Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
