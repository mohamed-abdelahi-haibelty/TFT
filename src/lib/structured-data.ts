import { SCHEMA_DAYS } from "@/src/lib/days";
import { absoluteUrl, siteOrigin } from "@/src/lib/site";
import type { StockStatus } from "@/src/lib/stock-status";
import type { ShopSettings } from "@/src/services/settings";

/**
 * Every JSON-LD block the site emits, as pure functions over plain data.
 *
 * They are pure so they can be unit-tested without a Next render, and so the
 * shape of what search engines see is reviewable in one file instead of being
 * spread across five `dangerouslySetInnerHTML` call sites. Render them with
 * `<JsonLd data={…} />` (components/seo/json-ld.tsx), never by stringifying
 * at the call site.
 *
 * The `import type { ShopSettings }` above is type-only and erased at compile
 * time, so this stays a leaf module at runtime with no path into the database.
 */

/** Stable node ids, so an offer's `seller` can point at the shop instead of restating the whole business on every product page. */
export function shopNodeId(): string {
  return `${siteOrigin()}/#shop`;
}

export function webSiteNodeId(): string {
  return `${siteOrigin()}/#website`;
}

const SCHEMA_URL = "https://schema.org";

/** The registered trade name, identical in both locales. `common.appName` ("TFT") is the short form the UI shows; search engines want the full one. */
export const BUSINESS_LEGAL_NAME = "THE FIRST TRADE";

const AVAILABILITY: Record<StockStatus, string> = {
  "in-stock": `${SCHEMA_URL}/InStock`,
  backorder: `${SCHEMA_URL}/BackOrder`,
  "out-of-stock": `${SCHEMA_URL}/OutOfStock`,
};

/** Drops keys whose value is null/undefined/empty-string, so a half-filled shop profile emits a valid record rather than one full of empty properties. */
function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  ) as Partial<T>;
}

export type StoreJsonLdInput = {
  locale: string;
  /** The registered business name, e.g. "THE FIRST TRADE". */
  name: string;
  alternateName?: string;
  description: string;
  settings: ShopSettings;
  /** Absolute URL of a logo or storefront photo. There is no brand asset in `public/` yet, so this is usually omitted. */
  image?: string;
};

/**
 * The shop itself — `Store` rather than the broader `LocalBusiness` because
 * the more specific type is what Google's retail treatment keys off.
 *
 * The street address falls back to the free-text `addressAr`/`addressFr` the
 * footer already prints, so the record is useful the moment the shop has an
 * address at all, without waiting for the structured fields to be filled in.
 */
export function storeJsonLd({ locale, name, alternateName, description, settings, image }: StoreJsonLdInput) {
  const street =
    (locale === "ar" ? settings.streetAr : settings.streetFr) ??
    (locale === "ar" ? settings.addressAr : settings.addressFr);

  const sameAs = [settings.instagramUrl, settings.facebookUrl].filter((url): url is string => Boolean(url));

  return compact({
    "@context": SCHEMA_URL,
    "@type": "Store",
    "@id": shopNodeId(),
    name,
    alternateName,
    url: absoluteUrl(locale),
    description,
    image,
    logo: image,
    // Stored digits-only; `+` is what the tel: vocabulary expects.
    telephone: settings.whatsappNumber ? `+${settings.whatsappNumber}` : undefined,
    address: compact({
      "@type": "PostalAddress",
      streetAddress: street,
      addressLocality: settings.city,
      postalCode: settings.postalCode,
      addressCountry: settings.country ?? "MR",
    }),
    geo:
      settings.latitude !== null && settings.longitude !== null
        ? { "@type": "GeoCoordinates", latitude: settings.latitude, longitude: settings.longitude }
        : undefined,
    hasMap: settings.mapsUrl,
    openingHoursSpecification: openingHoursSpecification(settings),
    areaServed: settings.city ? { "@type": "City", name: settings.city } : undefined,
    currenciesAccepted: "MRU",
    // The shop's actual two routes to payment — see PRODUCT.md's order flow.
    paymentAccepted: "Cash, Bankily",
    sameAs: sameAs.length ? sameAs : undefined,
  });
}

/**
 * One specification covering the whole week minus the closing day. This is a
 * single counter with one set of hours, not a chain with per-branch schedules,
 * so modelling it per-day would be seven identical entries.
 */
function openingHoursSpecification(settings: ShopSettings) {
  if (!settings.opensAt || !settings.closesAt) return undefined;
  const days = SCHEMA_DAYS.filter((day) => day !== settings.closedDay);
  if (days.length === 0) return undefined;

  return {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: days.map((day) => `${SCHEMA_URL}/${day}`),
    opens: settings.opensAt,
    closes: settings.closesAt,
  };
}

/**
 * The site as an entity, with the sitelinks search box pointing at the catalog
 * search that already exists at `/catalog?q=`.
 */
export function webSiteJsonLd({
  locale,
  name,
  description,
}: {
  locale: string;
  name: string;
  description: string;
}) {
  return {
    "@context": SCHEMA_URL,
    "@type": "WebSite",
    "@id": webSiteNodeId(),
    name,
    url: absoluteUrl(locale),
    description,
    inLanguage: locale,
    publisher: { "@id": shopNodeId() },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl(locale, "/catalog")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export type BreadcrumbItem = { name: string; url?: string };

/** Both detail pages have rendered a visible breadcrumb `<nav>` since task 09 with no machine-readable counterpart. The final crumb is the current page, so it carries no `item`. */
export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": SCHEMA_URL,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) =>
      compact({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: item.url,
      }),
    ),
  };
}

export type ProductJsonLdInput = {
  name: string;
  url: string;
  price: number;
  availability: StockStatus;
  sku?: string;
  description?: string;
  images?: string[];
  category?: string;
  /** ISO date. Only ever set from a promotion's real `endsAt` — never a computed "a year from now", since these pages are prerendered and would bake in the build-time clock. */
  priceValidUntil?: string;
};

export function productJsonLd({
  name,
  url,
  price,
  availability,
  sku,
  description,
  images,
  category,
  priceValidUntil,
}: ProductJsonLdInput) {
  return compact({
    "@context": SCHEMA_URL,
    "@type": "Product",
    "@id": `${url}#product`,
    name,
    url,
    sku,
    description,
    category,
    image: images?.length ? images : undefined,
    offers: compact({
      "@type": "Offer",
      priceCurrency: "MRU",
      price,
      availability: AVAILABILITY[availability],
      itemCondition: `${SCHEMA_URL}/NewCondition`,
      url,
      priceValidUntil,
      seller: { "@id": shopNodeId() },
    }),
  });
  // No `brand`: this is a reseller of third-party stationery, and naming TFT
  // as the brand of every pencil would be false. No `aggregateRating` either —
  // there is no review data, and inventing it is a manual-action risk.
}

/** A listing page's contents, in order. Gives Google the set of URLs a category or catalog page is *about*, which a wall of anchors alone does not. */
export function itemListJsonLd({ url, items }: { url: string; items: { name: string; url: string }[] }) {
  return {
    "@context": SCHEMA_URL,
    "@type": "ItemList",
    "@id": `${url}#list`,
    url,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}
