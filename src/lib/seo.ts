import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/src/i18n/routing";
import { absoluteUrl, localeAlternates } from "@/src/lib/site";

/**
 * OpenGraph wants `language_TERRITORY`, not a bare language tag. Every page
 * used to emit `og:locale: "ar"`, which scrapers ignore.
 */
const OG_LOCALES: Record<string, string> = { ar: "ar_MR", fr: "fr_FR" };

function ogLocale(locale: string): string {
  return OG_LOCALES[locale] ?? locale;
}

/**
 * The share card served by `app/[locale]/opengraph-image.tsx`, named here so
 * the route and the metadata cannot drift apart.
 *
 * It has to be named *explicitly* rather than left to Next's file convention:
 * every page below builds its own `openGraph` object, and a child's
 * `openGraph` replaces the parent's wholesale — which took the auto-injected
 * image with it. The deployed home page and all three listing pages shipped
 * with no `og:image` at all until this was passed by hand.
 */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_IMAGE_ALT = "TFT — THE FIRST TRADE · Nouadhibou";

function defaultOgImage(locale: string) {
  return {
    url: absoluteUrl(locale, "/opengraph-image"),
    ...OG_IMAGE_SIZE,
    alt: OG_IMAGE_ALT,
  };
}

export type PageMetadataInput = {
  locale: string;
  /** Storefront path with no locale prefix, e.g. `/catalog`. Defaults to the home page. */
  path?: string;
  title: string;
  description?: string;
  /** Absolute image URLs. Omit and the route's `opengraph-image` file fills in instead. */
  images?: string[];
  /** Spread over the result — for page-specific `robots`, `other`, and the like. */
  extra?: Metadata;
};

/**
 * The single place a storefront page's canonical, hreflang, OpenGraph and
 * Twitter tags are assembled.
 *
 * Before this, all nine `generateMetadata` functions built the same object by
 * hand and had already drifted apart: three hardcoded `siteName: "TFT"` while
 * the layout read `common.appName`, the three listing routes had no
 * `openGraph` at all, and nothing anywhere emitted a Twitter card. Adding a
 * tag here now adds it to every page at once.
 *
 * `getTranslations` is safe in this file: `generateMetadata` is an ordinary
 * server render, not a `use cache` scope — that restriction is what keeps
 * `src/services/*` from translating, and it does not reach metadata.
 */
export async function buildPageMetadata({
  locale,
  path = "/",
  title,
  description,
  images,
  extra,
}: PageMetadataInput): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "common" });
  const url = absoluteUrl(locale, path);
  // A page-specific image (a product photo) when there is one, the brand card
  // otherwise. Never nothing: WhatsApp is this shop's real distribution
  // channel, and a pasted link with no card is a bare URL in a chat.
  const imageEntry = { images: images?.length ? images : [defaultOgImage(locale)] };

  return {
    title,
    description,
    alternates: { canonical: url, languages: localeAlternates(path) },
    openGraph: {
      title,
      description,
      url,
      siteName: t("appName"),
      locale: ogLocale(locale),
      alternateLocale: routing.locales.filter((other) => other !== locale).map(ogLocale),
      type: "website",
      ...imageEntry,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...imageEntry,
    },
    ...extra,
  };
}

/** Metadata for a page that must never be indexed — admin, and any route whose content is per-visitor. */
export const NOINDEX: Metadata = { robots: { index: false, follow: false } };
