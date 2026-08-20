import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BundleCard } from "@/components/store/bundle-card";
import { CategoryChip } from "@/components/store/category-chip";
import { ProductCard } from "@/components/store/product-card";
import { Link } from "@/src/i18n/navigation";
import { buildCloudinaryUrl } from "@/src/lib/cloudinary";
import { localized } from "@/src/lib/locale-text";
import { absoluteUrl, localeAlternates } from "@/src/lib/site";
import { getShopSettings } from "@/src/services/settings";
import { getFeaturedProducts, getHomeBundles, getStorefrontCategories } from "@/src/services/storefront";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.seo" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: absoluteUrl(locale), languages: localeAlternates() },
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: absoluteUrl(locale),
      siteName: "TFT",
      locale,
      type: "website",
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, categories, featuredProducts, bundles, settings] = await Promise.all([
    getTranslations({ locale, namespace: "home" }),
    getStorefrontCategories(),
    getFeaturedProducts(8),
    getHomeBundles(6),
    getShopSettings(),
  ]);

  const heroProduct = featuredProducts[0];

  // Static class strings, not an interpolated column count — Tailwind only
  // emits utilities it can see at build time. The grid's own width is capped
  // alongside the track count so a short list fills its row *at card size*:
  // dropping to two full-width tracks would fill the row too, by inflating two
  // boxes into half-page slabs.
  const boxGridColumns =
    bundles.length === 1
      ? "grid-cols-1 max-w-64"
      : bundles.length === 2
        ? "grid-cols-2 max-w-xl"
        : bundles.length === 3
          ? "grid-cols-2 sm:grid-cols-3 sm:max-w-3xl"
          : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: "THE FIRST TRADE",
    alternateName: "TFT",
    url: absoluteUrl(locale),
    description: t("seo.description"),
    ...(settings.whatsappNumber ? { telephone: `+${settings.whatsappNumber}` } : {}),
    ...(settings.addressAr || settings.addressFr
      ? { address: localized(locale, settings.addressAr ?? "", settings.addressFr ?? "") }
      : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero — "Atelier Blanc": an editorial split, white ground, serif headline. No eyebrow above the H1 (craft-floor bans a kicker outright, brief or not). */}
      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-28">
        <div>
          <h1 className="text-balance font-display text-[clamp(2.25rem,1.5rem+3.2vw,3.75rem)] leading-[1.05] font-medium text-ink">
            {t("hero.title")}
          </h1>
          <p className="mt-6 max-w-md text-pretty text-base leading-relaxed text-ink-soft">{t("hero.subtitle")}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/catalog"
              className="inline-flex h-12 items-center rounded-[2px] bg-ink px-7 text-xs font-semibold tracking-[0.05em] text-paper uppercase transition-colors hover:bg-[oklch(0.29_0.012_59.14)]"
            >
              {t("hero.ctaPrimary")}
            </Link>
            <Link
              href="/boxes"
              className="inline-flex h-12 items-center rounded-[2px] border border-ink px-7 text-xs font-semibold tracking-[0.05em] text-ink uppercase transition-colors hover:bg-ink hover:text-paper"
            >
              {t("hero.ctaSecondary")}
            </Link>
          </div>
        </div>

        {heroProduct && (
          // Shown at every width, not just `md:flex` — that gate removed the
          // hero photo from every real phone, leaving mobile (the primary
          // audience) a text-only hero while the editorial split it's meant
          // to carry only rendered on desktop.
          <div className="flex aspect-4/5 items-center justify-center border border-border p-6 sm:p-8 md:p-10">
            {heroProduct.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- Cloudinary delivery URL, fixed card transform
              <img
                src={buildCloudinaryUrl(heroProduct.image, "gallery")}
                alt=""
                width={800}
                height={800}
                loading="eager"
                className="size-full object-contain mix-blend-multiply"
              />
            ) : null}
          </div>
        )}
      </section>

      {/* The mechanism this shop runs on — no accounts, no online payment,
          order → WhatsApp → Bankily screenshot → shop or bus station — used to
          appear nowhere but one clause of the hero subtitle. PRODUCT.md's
          defining constraint is an audience with no experience of online
          shopping at all, so the funnel's own rules are content, not chrome.
          Three numbered steps, because here the sequence IS the information. */}
      {/* Pure white with a hairline under the heading, matching the catalog
          sections' own structure — the Paper tint stays reserved for the Boxes
          band, which DESIGN.md names as the storefront's one non-white ground. */}
      <section className="py-12 sm:py-14" aria-labelledby="home-how">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 id="home-how" className="border-b border-border pb-4 font-display text-2xl font-medium text-ink">
            {t("how.title")}
          </h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3 sm:gap-10">
            {(["step1", "step2", "step3"] as const).map((step, index) => (
              <li key={step} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center border border-ink font-mono text-sm text-ink"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-semibold tracking-[0.04em] text-ink uppercase">
                    {t(`how.${step}Title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t(`how.${step}Body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-labelledby="home-categories">
          {/* The heading string existed in both message files and was never
              rendered, so this shipped as four bare grey words floating in
              whitespace — worse than icon-only, which PRODUCT.md already
              rules out: unlabeled text with no affordance at all. */}
          <h2 id="home-categories" className="mb-5 font-display text-2xl font-medium text-ink">
            {t("categories.title")}
          </h2>
          {/* The edge fade hints there's more to scroll. It used to fade BOTH
              edges, so at scroll position 0 — what every visitor sees first —
              the leading category was permanently half-faded, at every width,
              including desktop where the row never overflows. Fading only the
              trailing edge is correct at rest, and costs nothing when the row
              is short because the chips pack to the start and the faded strip
              falls on empty space. Mirrored for RTL; CSS masks have no logical
              direction of their own. */}
          <div className="flex snap-x snap-proximity gap-8 overflow-x-auto touch-pan-x mask-[linear-gradient(to_right,black_calc(100%-24px),transparent)] rtl:mask-[linear-gradient(to_left,black_calc(100%-24px),transparent)]">
            {categories.map((category) => (
              <CategoryChip
                key={category.id}
                slug={category.slug}
                name={localized(locale, category.nameAr, category.nameFr)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-border pb-4">
          <h2 className="font-display text-2xl font-medium text-ink">{t("featured.title")}</h2>
          <Link href="/catalog" className="flex min-h-11 shrink-0 items-center text-xs font-semibold tracking-[0.04em] text-plum uppercase hover:underline">
            {t("featured.viewAll")}
          </Link>
        </div>
        {featuredProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                name={localized(locale, product.nameAr, product.nameFr)}
                locale={locale}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">{t("featured.empty")}</p>
        )}
      </section>

      {/* Boxes — a barely-there tint (Paper, not a full color region) to separate the section without shouting. */}
      <section className="border-y border-border bg-paper py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-border pb-4">
            <h2 className="font-display text-2xl font-medium text-ink">{t("boxes.title")}</h2>
            <Link href="/boxes" className="flex min-h-11 shrink-0 items-center text-xs font-semibold tracking-[0.04em] text-plum uppercase hover:underline">
              {t("boxes.viewAll")}
            </Link>
          </div>
          <p className="-mt-4 mb-8 max-w-md text-sm text-ink-soft">{t("boxes.subtitle")}</p>
          {bundles.length > 0 ? (
            // The widest track count is capped by how many boxes there are, so
            // the row fills. A shop realistically has 2–5 boxes forever, and a
            // fixed 4-column grid holding two of them left half a row empty on
            // desktop — the section reading as though something failed to load.
            <div className={`grid gap-x-6 gap-y-10 ${boxGridColumns}`}>
              {bundles.map((bundle) => (
                <BundleCard key={bundle.id} bundle={bundle} name={localized(locale, bundle.nameAr, bundle.nameFr)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">{t("boxes.empty")}</p>
          )}
        </div>
      </section>
    </>
  );
}
