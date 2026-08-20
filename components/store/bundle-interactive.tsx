"use client";

import { ChevronLeft, ChevronRight, Gift, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { BundleAvailabilityBadge } from "@/components/store/bundle-availability-badge";
import { PromoCountdown } from "@/components/store/promo-countdown";
import { useCartDrawer } from "@/components/store/cart-drawer-context";
import { addToCart } from "@/src/lib/cart";
import { buildCloudinarySrcSet, buildCloudinaryUrl } from "@/src/lib/cloudinary";
import { formatMoney } from "@/src/lib/money";

export type BundleInteractiveProps = {
  bundleId: string;
  slug: string;
  name: string;
  /** Both locales, carried purely so the cart line can be re-rendered in either — see `cartItemName`. */
  nameAr: string;
  nameFr: string;
  images: string[];
  basePrice: number;
  effectivePrice: number;
  promo: { endsAt: string } | null;
  /** `null` = unlimited, `0` = sold out. */
  maxSellable: number | null;
  /** Sum of each component's own effective price × qty — drives the savings line. */
  componentPriceSum: number;
};

// A bundle's ceiling is its own derived stock (`maxSellable`); this only
// bounds the rare unlimited case (every component allows backorder), the
// same way `product-interactive.tsx` caps its own backorder quantity.
const UNLIMITED_QTY_CAP = 99;

/**
 * The bundle page's purchase island — gallery, price/savings, quantity,
 * add-to-cart. Deliberately smaller and secondary next to the page's real
 * subject, the contents manifest (rendered separately, server-side, below
 * this): a bundle's story is "everything you get," not one hero photo.
 */
export function BundleInteractive({
  bundleId,
  slug,
  name,
  nameAr,
  nameFr,
  images,
  basePrice,
  effectivePrice,
  promo,
  maxSellable,
  componentPriceSum,
}: BundleInteractiveProps) {
  const t = useTranslations("box");
  const tBadges = useTranslations("store.badges");
  const { open } = useCartDrawer();

  const [imageIndex, setImageIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  // Same client-side promo-expiry guard as `product-interactive.tsx`: the
  // countdown is cosmetic by design, but the chargeable price must not outlive
  // the promotion on an already-open page.
  const [promoExpired, setPromoExpired] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeImage = images[imageIndex] ?? null;
  const disabled = maxSellable === 0;
  const maxQty = maxSellable ?? UNLIMITED_QTY_CAP;
  const liveEffectivePrice = promo && !promoExpired ? effectivePrice : basePrice;
  const savings = componentPriceSum - liveEffectivePrice;

  useEffect(() => {
    if (!promo) return;
    // Deliberate synchronous first tick: converts the server's optimistic
    // "promo still live" render into the real client clock, mirroring
    // `promo-countdown.tsx`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPromoExpired(new Date(promo.endsAt).getTime() <= Date.now());
    const id = setInterval(() => setPromoExpired(new Date(promo.endsAt).getTime() <= Date.now()), 60_000);
    return () => clearInterval(id);
  }, [promo]);

  function showImage(index: number) {
    setImageIndex(((index % images.length) + images.length) % images.length);
  }

  function handleTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: React.TouchEvent) {
    if (touchStartX.current == null || images.length < 2) return;
    const deltaX = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(deltaX) < 40) return;
    showImage(imageIndex + (deltaX < 0 ? 1 : -1));
    touchStartX.current = null;
  }

  const handleAdd = useCallback(() => {
    if (confirmed || disabled) return;
    addToCart({
      kind: "bundle",
      bundleId,
      slug,
      nameAr,
      nameFr,
      image: activeImage,
      unitPrice: liveEffectivePrice,
      qty,
    });
    setConfirmed(true);
    open();
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmed(false), 2500);
  }, [bundleId, slug, nameAr, nameFr, activeImage, liveEffectivePrice, qty, confirmed, disabled, open]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start lg:gap-12">
      {/* Gallery — smaller and secondary, matching the manifest-led structure. */}
      <div className="flex flex-col gap-3">
        <div
          className="relative flex aspect-square touch-manipulation items-center justify-center border border-border p-6"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {activeImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary delivery URL, fixed size transform
            <img
              key={activeImage}
              src={buildCloudinaryUrl(activeImage, "gallery")}
              srcSet={buildCloudinarySrcSet(activeImage, ["card", "gallery", "zoom"])}
              sizes="(min-width: 1024px) 320px, 90vw"
              width={800}
              height={800}
              fetchPriority="high"
              alt={t("imageAlt", { name })}
              className="size-full object-contain mix-blend-multiply"
            />
          ) : (
            <Gift className="size-14 text-ink-soft" aria-hidden="true" />
          )}

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => showImage(imageIndex - 1)}
                aria-label={t("previousImage")}
                className="absolute start-2 top-1/2 flex size-11 -translate-y-1/2 touch-manipulation items-center justify-center border border-ink bg-background text-ink transition-colors hover:bg-ink hover:text-paper"
              >
                <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => showImage(imageIndex + 1)}
                aria-label={t("nextImage")}
                className="absolute end-2 top-1/2 flex size-11 -translate-y-1/2 touch-manipulation items-center justify-center border border-ink bg-background text-ink transition-colors hover:bg-ink hover:text-paper"
              >
                <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex gap-3 overflow-x-auto">
            {images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => showImage(index)}
                aria-label={t("thumbnailLabel", { index: index + 1 })}
                aria-current={index === imageIndex}
                className={`flex size-14 shrink-0 touch-manipulation items-center justify-center border p-2 transition-colors ${
                  index === imageIndex ? "border-ink" : "border-border hover:border-ink"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary delivery URL, fixed size transform */}
                <img
                  src={buildCloudinaryUrl(image, "thumbnail")}
                  alt={t("imageAlt", { name })}
                  width={120}
                  height={120}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-contain mix-blend-multiply"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Purchase panel — capped to a button-sized measure. As a bare `1fr`
          track it stretched the add-to-cart button to ~730px on desktop, a CTA
          wider than any reasonable button, with the price and savings floating
          alone across the same width. */}
      <div className="flex max-w-md flex-col">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-3xl font-medium text-ink">{formatMoney(liveEffectivePrice)}</span>
          {liveEffectivePrice < basePrice && (
            <span className="font-mono text-base text-ink-soft line-through">{formatMoney(basePrice)}</span>
          )}
        </div>

        {/* The one number that justifies buying a box rather than the items
            separately, previously the smallest text in the price block. */}
        {savings > 0 && (
          <p className="mt-2.5 inline-flex w-fit border border-plum px-2.5 py-1 text-sm font-semibold text-plum">
            {t("savingsLabel", { amount: formatMoney(savings) })}
          </p>
        )}

        {((promo && !promoExpired) || disabled) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {promo && !promoExpired && <PromoCountdown endsAt={promo.endsAt} />}
            <BundleAvailabilityBadge maxSellable={maxSellable} label={tBadges("outOfStock")} />
          </div>
        )}

        <div className="mt-8 flex items-center gap-4">
          <span className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">{t("quantityLabel")}</span>
          <div className="flex items-center border border-border">
            <button
              type="button"
              onClick={() => setQty((current) => Math.max(1, current - 1))}
              disabled={disabled || qty <= 1}
              aria-label={t("decreaseQty")}
              className="flex size-11 items-center justify-center text-ink transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:text-ink-soft/40 disabled:hover:bg-transparent"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <span aria-live="polite" className="flex min-w-10 items-center justify-center font-mono text-sm text-ink">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((current) => Math.min(maxQty, current + 1))}
              disabled={disabled || qty >= maxQty}
              aria-label={t("increaseQty")}
              className="flex size-11 items-center justify-center text-ink transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:text-ink-soft/40 disabled:hover:bg-transparent"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {!disabled && qty >= maxQty && (
          <p className="mt-2 text-xs text-ink-soft">{t("maxQtyHint", { max: maxQty })}</p>
        )}

        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled || confirmed}
          // See `product-interactive.tsx`'s own comment: `scroll-mb` (not page
          // padding) keeps this button clear of the fixed mobile bottom bar.
          className="mt-8 h-12 w-full scroll-mb-24 rounded-[2px] bg-ink text-xs font-semibold tracking-[0.05em] text-paper uppercase transition-colors hover:bg-[oklch(0.29_0.012_59.14)] disabled:cursor-not-allowed disabled:bg-ink/30"
        >
          {disabled ? tBadges("outOfStock") : confirmed ? t("added") : t("addToCart")}
        </button>
        <p aria-live="polite" className="sr-only">
          {disabled ? tBadges("outOfStock") : confirmed ? t("added") : ""}
        </p>
        {!disabled && (
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">{t("addReassurance")}</p>
        )}
      </div>
    </div>
  );
}
