import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BundleInteractive } from "@/components/store/bundle-interactive";
import { BundleDetailSkeleton } from "@/components/store/skeletons";
import { JsonLd } from "@/components/seo/json-ld";
import { Link } from "@/src/i18n/navigation";
import { buildCloudinaryUrl } from "@/src/lib/cloudinary";
import { localized } from "@/src/lib/locale-text";
import { formatMoney } from "@/src/lib/money";
import { buildPageMetadata, NOINDEX } from "@/src/lib/seo";
import { breadcrumbJsonLd, productJsonLd } from "@/src/lib/structured-data";
import { absoluteUrl } from "@/src/lib/site";
import { getSitemapCatalogCore, getStorefrontBundleBySlug } from "@/src/services/storefront";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const bundle = await getStorefrontBundleBySlug(slug);
  // See the product page's twin: `{}` on a 404 inherited the site-wide title
  // and description, leaving an indexable duplicate of the home page.
  if (!bundle) return NOINDEX;

  const name = localized(locale, bundle.nameAr, bundle.nameFr);
  const description = localized(locale, bundle.descriptionAr ?? "", bundle.descriptionFr ?? "") || undefined;
  const image = bundle.images[0] ? buildCloudinaryUrl(bundle.images[0], "gallery") : undefined;

  // See the product page for why there are no `product:price:*` tags here.
  return buildPageMetadata({
    locale,
    path: `/boxes/${bundle.slug}`,
    title: name,
    description,
    images: image ? [image] : undefined,
  });
}

/** Same shape as the product page — see its comment. */
export default async function BundlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  // `params` is not awaited here — not even for the locale. Reading URL data
  // in the page body is exactly what stops the shell from being reusable
  // across slugs, which is the whole point of prerendering one. The body
  // component does it inside the boundary, and calls `setRequestLocale` there.
  return (
    <Suspense fallback={<BundleDetailSkeleton />}>
      <BundleBody params={params} />
    </Suspense>
  );
}

export async function generateStaticParams() {
  const catalog = await getSitemapCatalogCore();
  return catalog.bundles.map((bundle) => ({ slug: bundle.slug }));
}

async function BundleBody({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const bundle = await getStorefrontBundleBySlug(slug);
  if (!bundle) notFound();

  const [t, tNav] = await Promise.all([
    getTranslations({ locale, namespace: "box" }),
    getTranslations({ locale, namespace: "store.nav" }),
  ]);
  const tItemCount = await getTranslations({ locale, namespace: "store" });
  const name = localized(locale, bundle.nameAr, bundle.nameFr);
  const description = localized(locale, bundle.descriptionAr ?? "", bundle.descriptionFr ?? "");

  const bundleUrl = absoluteUrl(locale, `/boxes/${bundle.slug}`);

  return (
    // `max-w-4xl`, not `6xl`: this page's content is a 320px gallery, a
    // button-width purchase panel, and a manifest meant to be added up by eye.
    // At 1152px those three sat in a row with ~330px of unexplained void
    // beside them, and the manifest's names ended ~500px from their own
    // prices — which breaks the one thing the manifest exists to prove.
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <JsonLd
        data={productJsonLd({
          name,
          url: bundleUrl,
          price: bundle.effectivePrice,
          // A box has no stock row of its own — it is sellable only as deep as
          // its scarcest component, which `maxSellable` already resolves.
          availability: bundle.maxSellable === 0 ? "out-of-stock" : "in-stock",
          description: description || undefined,
          images: bundle.images.map((id) => buildCloudinaryUrl(id, "gallery")),
          priceValidUntil: bundle.promo ? new Date(bundle.promo.endsAt).toISOString() : undefined,
        })}
      />
      <JsonLd data={breadcrumbJsonLd([{ name: tNav("boxes"), url: absoluteUrl(locale, "/boxes") }, { name }])} />

      <nav aria-label={t("breadcrumbLabel")} className="mb-8 flex items-center gap-2 text-xs text-ink-soft uppercase">
        <Link href="/boxes" className="tracking-[0.04em] transition-colors hover:text-ink">
          {tNav("boxes")}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="tracking-[0.04em] text-ink">{name}</span>
      </nav>

      <h1 className="mb-10 font-display text-2xl font-medium text-ink sm:text-3xl">{name}</h1>

      <BundleInteractive
        bundleId={bundle.id}
        slug={bundle.slug}
        name={name}
        nameAr={bundle.nameAr}
        nameFr={bundle.nameFr}
        images={bundle.images}
        basePrice={bundle.basePrice}
        effectivePrice={bundle.effectivePrice}
        postPromoPrice={bundle.postPromoPrice}
        promo={bundle.promo ? { endsAt: new Date(bundle.promo.endsAt).toISOString() } : null}
        maxSellable={bundle.maxSellable}
        componentPriceSum={bundle.componentPriceSum}
      />

      {/* Contents manifest — the page's real subject (task 10, rolled structure): an itemized ledger, not a footnote list, closed by a receipt-style total that proves the savings claim above rather than just asserting it. */}
      <div className="mt-14 max-w-xl border-t border-border pt-10">
        <h2 className="mb-1 text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">{t("contentsTitle")}</h2>
        <p className="mb-6 font-mono text-xs text-ink-soft">{tItemCount("itemCount", { count: bundle.items.length })}</p>

        <ul>
          {bundle.items.map((item) => {
            const itemName = localized(locale, item.nameAr, item.nameFr);
            const variantName =
              item.variantNameAr || item.variantNameFr ? localized(locale, item.variantNameAr ?? "", item.variantNameFr ?? "") : null;
            return (
              // `bundle_items.id`: the same product may legitimately appear
              // twice in one box, which collided on a product-derived key.
              <li key={item.id} className="border-b border-border">
                <Link
                  href={`/product/${item.productSlug}`}
                  className="group flex items-center justify-between gap-4 py-4"
                  aria-label={t("viewProductAria", { name: itemName })}
                >
                  {/* Name and quantity travel together; only the money sits in
                      the end column. Grouping ×qty with the price instead left
                      the name stranded alone at the far edge of the row, which
                      is precisely the reading this manifest cannot afford —
                      its whole job is letting the eye add a column and check
                      the total against the box price. */}
                  <span className="min-w-0 text-sm text-ink underline-offset-4 transition-colors group-hover:text-plum group-hover:underline">
                    {variantName ? `${itemName} — ${variantName}` : itemName}{" "}
                    <span className="font-mono text-xs text-ink-soft">×{item.qty}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
                    {formatMoney(item.unitPrice * item.qty)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {bundle.componentPriceSum > bundle.effectivePrice && (
          <div className="flex items-baseline justify-between gap-4 border-t border-ink pt-4">
            <span className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">{t("subtotalLabel")}</span>
            <span className="font-mono text-sm text-ink-soft line-through">{formatMoney(bundle.componentPriceSum)}</span>
          </div>
        )}
      </div>

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
