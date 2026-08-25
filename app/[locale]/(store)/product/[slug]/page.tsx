import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductInteractive } from "@/components/store/product-interactive";
import { ProductDetailSkeleton } from "@/components/store/skeletons";
import { Link } from "@/src/i18n/navigation";
import { buildCloudinaryUrl } from "@/src/lib/cloudinary";
import { localized } from "@/src/lib/locale-text";
import { absoluteUrl, localeAlternates } from "@/src/lib/site";
import { deriveStockStatus } from "@/src/lib/stock-status";
import { getShopSettings } from "@/src/services/settings";
import { getSitemapCatalogCore, getStorefrontProductBySlug } from "@/src/services/storefront";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await getStorefrontProductBySlug(slug);
  if (!product) return {};

  const name = localized(locale, product.nameAr, product.nameFr);
  const description = localized(locale, product.descriptionAr ?? "", product.descriptionFr ?? "") || undefined;
  const path = `/product/${product.slug}`;
  const image = product.images[0] ? buildCloudinaryUrl(product.images[0], "gallery") : undefined;

  return {
    title: name,
    description,
    alternates: { canonical: absoluteUrl(locale, path), languages: localeAlternates(path) },
    openGraph: {
      title: name,
      description,
      url: absoluteUrl(locale, path),
      siteName: "TFT",
      locale,
      type: "website",
      ...(image ? { images: [image] } : {}),
    },
  };
}

/**
 * Every active product is prerendered (see `generateStaticParams`). The slug
 * is awaited inside the boundary rather than at the top so that a product
 * *not* in that list — one just added in admin — still gets an instant App
 * Shell instead of a blank wait while the page renders.
 */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  // `params` is not awaited here — not even for the locale. Reading URL data
  // in the page body is exactly what stops the shell from being reusable
  // across slugs, which is the whole point of prerendering one. The body
  // component does it inside the boundary, and calls `setRequestLocale` there.
  return (
    <Suspense fallback={<ProductDetailSkeleton />}>
      <ProductBody params={params} />
    </Suspense>
  );
}

/**
 * Slugs are globally unique, so one entry per product covers both locales —
 * the `[locale]` segment's own `generateStaticParams` supplies the other half
 * of the pair. Only active products are listed; an inactive one 404s anyway.
 */
export async function generateStaticParams() {
  const catalog = await getSitemapCatalogCore();
  return catalog.products.map((product) => ({ slug: product.slug }));
}

async function ProductBody({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [product, settings] = await Promise.all([getStorefrontProductBySlug(slug), getShopSettings()]);
  if (!product) notFound();

  const t = await getTranslations({ locale, namespace: "product" });
  const name = localized(locale, product.nameAr, product.nameFr);
  const description = localized(locale, product.descriptionAr ?? "", product.descriptionFr ?? "");
  const categoryName = localized(locale, product.categoryNameAr, product.categoryNameFr);
  const status = deriveStockStatus(product.stockQty, product.allowBackorder);
  const productUrl = absoluteUrl(locale, `/product/${product.slug}`);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    sku: product.sku,
    ...(description ? { description } : {}),
    ...(product.images.length ? { image: product.images.map((id) => buildCloudinaryUrl(id, "gallery")) } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "MRU",
      price: product.effectivePrice,
      availability: `https://schema.org/${
        status === "in-stock" ? "InStock" : status === "backorder" ? "BackOrder" : "OutOfStock"
      }`,
      url: productUrl,
    },
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label={t("breadcrumbLabel")} className="mb-4 flex items-center gap-2 text-xs text-ink-soft uppercase sm:mb-8">
        <Link href={`/catalog/${product.categorySlug}`} className="tracking-[0.04em] transition-colors hover:text-ink">
          {categoryName}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="tracking-[0.04em] text-ink">{name}</span>
      </nav>

      <h1 className="mb-6 font-display text-2xl font-medium text-ink sm:mb-10 sm:text-3xl">{name}</h1>

      <ProductInteractive
        productId={product.id}
        slug={product.slug}
        sku={product.sku}
        productUrl={productUrl}
        name={name}
        nameAr={product.nameAr}
        nameFr={product.nameFr}
        images={product.images}
        variants={product.variants.map((variant) => ({
          id: variant.id,
          nameAr: variant.nameAr,
          nameFr: variant.nameFr,
          name: localized(locale, variant.nameAr, variant.nameFr),
          colorHex: variant.colorHex,
          stockQty: variant.stockQty,
          images: variant.images,
        }))}
        productStockQty={product.stockQty}
        allowBackorder={product.allowBackorder}
        basePrice={product.basePrice}
        effectivePrice={product.effectivePrice}
        postPromoPrice={product.postPromoPrice}
        promo={product.promo ? { endsAt: new Date(product.promo.endsAt).toISOString() } : null}
        whatsappNumber={settings.whatsappNumber}
      />

      {description && (
        <div className="mt-14 max-w-[65ch] border-t border-border pt-10">
          <h2 className="mb-4 text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
            {t("descriptionTitle")}
          </h2>
          <p className="font-reading text-base leading-relaxed whitespace-pre-line text-ink">{description}</p>
        </div>
      )}
    </div>
  );
}
