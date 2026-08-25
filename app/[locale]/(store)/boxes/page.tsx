import type { Metadata } from "next";
import { Suspense } from "react";
import { ChevronRight, Gift } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BundleAvailabilityBadge } from "@/components/store/bundle-availability-badge";
import { ProductImage } from "@/components/store/product-image";
import { BundleListSkeleton } from "@/components/store/skeletons";
import { Link } from "@/src/i18n/navigation";
import { localized } from "@/src/lib/locale-text";
import { formatMoney } from "@/src/lib/money";
import { absoluteUrl, localeAlternates } from "@/src/lib/site";
import { listCatalogBundles } from "@/src/services/storefront";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "boxes.seo" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: absoluteUrl(locale, "/boxes"), languages: localeAlternates("/boxes") },
  };
}

/**
 * Task 10, rolled structure: a manifest, not a photo grid — each bundle is
 * one hairline-divided ledger line (plate, name, item count, price,
 * availability) rather than a squared-off card, so a shopper scanning for
 * "what's in it and what do I save" reads the whole list top to bottom
 * instead of parsing a tile grid. Still pure Atelier Blanc: same border/
 * plate/mix-blend-multiply photo treatment, same type and color tokens, no
 * new radii or motion.
 */
export default async function BoxesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "boxes" });

  return (
    // A ledger row only reads as one row if its ends stay within a glance of
    // each other. At `max-w-3xl` a short box name ended ~300px from its own
    // price, so each row split into three unrelated islands.
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-border pb-4">
        <h1 className="font-display text-2xl font-medium text-ink sm:text-3xl">{t("heading")}</h1>
        <Suspense fallback={<span className="h-4 w-20 shrink-0" />}>
          <BoxCount locale={locale} />
        </Suspense>
      </div>
      {/* The home section carries a line explaining what a box *is*; the
          destination page dropped it and opened with a bare count — leaving
          the explanation on the page for people who were already convinced,
          and withholding it from the ones who clicked through to find out. */}
      <p className="mt-4 mb-2 max-w-md text-sm leading-relaxed text-ink-soft">{t("intro")}</p>

      {/* The heading and the explanation of what a box *is* are the static
          shell; only the ledger waits on the query. */}
      <Suspense fallback={<BundleListSkeleton count={4} />}>
        <BoxLedger locale={locale} />
      </Suspense>
    </div>
  );
}

async function BoxCount({ locale }: { locale: string }) {
  const [t, bundleList] = await Promise.all([
    getTranslations({ locale, namespace: "boxes" }),
    listCatalogBundles(),
  ]);
  return <p className="shrink-0 text-xs text-ink-soft">{t("resultCount", { count: bundleList.length })}</p>;
}

async function BoxLedger({ locale }: { locale: string }) {
  const [t, tStore, tBadges, bundleList] = await Promise.all([
    getTranslations({ locale, namespace: "boxes" }),
    getTranslations({ locale, namespace: "store" }),
    getTranslations({ locale, namespace: "store.badges" }),
    listCatalogBundles(),
  ]);

  if (bundleList.length === 0) return <p className="pt-8 text-sm text-ink-soft">{t("empty")}</p>;

  return (
    <ul>
      {bundleList.map((bundle) => {
        const name = localized(locale, bundle.nameAr, bundle.nameFr);
        return (
          <li key={bundle.id} className="border-b border-border">
            <Link href={`/boxes/${bundle.slug}`} className="group flex items-center gap-5 py-5">
              <div className="flex size-20 shrink-0 items-center justify-center border border-border p-3 transition-colors group-hover:border-ink sm:size-24">
                {bundle.image ? (
                  <ProductImage publicId={bundle.image} sizes="(min-width: 640px) 72px, 56px" />
                ) : (
                  <Gift className="size-7 text-ink-soft" aria-hidden="true" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <span className="block text-base font-medium text-ink sm:text-lg">{name}</span>
                <span className="mt-1 block font-mono text-xs text-ink-soft">
                  {tStore("itemCount", { count: bundle.itemCount })}
                </span>
                <div className="mt-1.5">
                  <BundleAvailabilityBadge maxSellable={bundle.maxSellable} label={tBadges("outOfStock")} />
                </div>
              </div>

              {/* A fixed end column with tabular figures, so prices form a real
                  column across rows instead of each floating wherever its own
                  digit count lands. */}
              <span className="shrink-0 text-end font-mono text-base tabular-nums text-ink sm:min-w-32 sm:text-lg">
                {formatMoney(bundle.effectivePrice)}
              </span>

              {/* The row is the primary action on this page and had no
                  affordance at all: a photo, a name, a price, a hairline. */}
              <ChevronRight
                className="size-5 shrink-0 text-ink-soft transition-colors group-hover:text-ink rtl:rotate-180"
                aria-hidden="true"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
