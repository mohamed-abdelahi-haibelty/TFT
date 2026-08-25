"use client";

import { ChevronLeft, ChevronRight, MessageCircle, Minus, Package, Plus, ZoomIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageLightbox } from "@/components/store/image-lightbox";
import { ProductImage } from "@/components/store/product-image";
import { PromoCountdown } from "@/components/store/promo-countdown";
import { StockBadge } from "@/components/store/stock-badge";
import { useCartDrawer } from "@/components/store/cart-drawer-context";
import { addToCart } from "@/src/lib/cart";
import { formatMoney } from "@/src/lib/money";
import { buildWhatsAppUrl } from "@/src/lib/whatsapp";
import { deriveStockStatus } from "@/src/lib/stock-status";

export type InteractiveVariant = {
  id: string;
  name: string;
  nameAr: string;
  nameFr: string;
  colorHex: string | null;
  stockQty: number | null;
  images: string[];
};

export type ProductInteractiveProps = {
  productId: string;
  slug: string;
  sku: string;
  /** Absolute, locale-prefixed URL to this product page — built server-side (`absoluteUrl`) since `src/lib/site.ts` pulls in server-only env vars. Included in the WhatsApp ask message so the chat gets a link-preview card with the product photo. */
  productUrl: string;
  name: string;
  /** Both locales, carried purely so the cart line can be re-rendered in either — see `cartItemName`. */
  nameAr: string;
  nameFr: string;
  images: string[];
  variants: InteractiveVariant[];
  productStockQty: number;
  allowBackorder: boolean;
  basePrice: number;
  effectivePrice: number;
  /**
   * What this item costs once the promo clock runs out. Falling back to
   * `basePrice` here discarded any standing `discount_price`, so a
   * permanently-discounted product was quoted at its full list price on its
   * own detail page — above the price its catalog card had just advertised,
   * and above the price the server actually charges.
   */
  postPromoPrice: number;
  promo: { endsAt: string } | null;
  /** From `getShopSettings()`, not the env var — the owner can change it from Admin → Settings without a redeploy. */
  whatsappNumber: string | null;
};

// Backorder has no real ceiling, but an unbounded stepper invites typos — a
// generous cap keeps it a quantity field, not a free-text amount.
const BACKORDER_QTY_CAP = 99;

/**
 * The one interactive island on the product page (task 09): gallery,
 * variant selector, quantity, price/promo/stock, add-to-cart. Bundled
 * together because picking a variant has to move all four at once — separate
 * components would need to lift the same state back up anyway.
 */
export function ProductInteractive({
  productId,
  slug,
  sku,
  productUrl,
  name,
  nameAr,
  nameFr,
  images,
  variants,
  productStockQty,
  allowBackorder,
  basePrice,
  effectivePrice,
  postPromoPrice,
  promo,
  whatsappNumber,
}: ProductInteractiveProps) {
  const t = useTranslations("product");
  const tBadges = useTranslations("store.badges");
  const tCommon = useTranslations("common");
  const { open } = useCartDrawer();

  // Auto-select the first orderable variant (never a bare line the customer
  // didn't consciously choose — a bare product and its variant would otherwise
  // be two separate cart lines, and a missed chip set would add an
  // unspecified item). Falls back to the first variant even when everything
  // is out of stock so the page still has a coherent selected state.
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => {
    const orderable = variants.find((variant) => (variant.stockQty ?? productStockQty) > 0 || allowBackorder);
    return (orderable ?? variants[0] ?? null)?.id ?? null;
  });
  const [imageIndex, setImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  // Client-side promo expiry — the countdown is cosmetic by design, but the
  // discounted price shown beside it must not outlive the promotion. The
  // pricing service owns the authoritative price on the next load; this only
  // stops an already-open page from quoting a stale discount after midnight.
  const [promoExpired, setPromoExpired] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId) ?? null;
  const askUrl = buildWhatsAppUrl(whatsappNumber, t("askMessage", { name, sku, url: productUrl }));

  const activeImages = selectedVariant?.images.length ? selectedVariant.images : images;
  const activeImage = activeImages[imageIndex] ?? activeImages[0] ?? null;

  const stockQty = selectedVariant ? (selectedVariant.stockQty ?? productStockQty) : productStockQty;
  const status = deriveStockStatus(stockQty, allowBackorder);
  const disabled = status === "out-of-stock";
  const maxQty = allowBackorder ? BACKORDER_QTY_CAP : stockQty;

  const liveEffectivePrice = promo && !promoExpired ? effectivePrice : postPromoPrice;

  useEffect(() => {
    if (!promo) return;
    // Deliberate synchronous first tick: it converts the server's optimistic
    // "promo still live" render into the real client clock, mirroring
    // `promo-countdown.tsx`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPromoExpired(new Date(promo.endsAt).getTime() <= Date.now());
    const id = setInterval(() => setPromoExpired(new Date(promo.endsAt).getTime() <= Date.now()), 60_000);
    return () => clearInterval(id);
  }, [promo]);

  function selectVariant(variantId: string) {
    setSelectedVariantId(variantId);
    setImageIndex(0);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmed(false);
    // Keep the customer's quantity when the new variant allows it; clamp (not
    // silently reset) when the new ceiling is lower.
    setQty((current) => {
      const nextVariant = variants.find((variant) => variant.id === variantId);
      const nextStock = nextVariant ? (nextVariant.stockQty ?? productStockQty) : productStockQty;
      const nextMax = allowBackorder ? BACKORDER_QTY_CAP : nextStock;
      return Math.min(current, nextMax);
    });
  }

  function showImage(index: number) {
    setImageIndex(((index % activeImages.length) + activeImages.length) % activeImages.length);
  }

  function handleTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: React.TouchEvent) {
    if (touchStartX.current == null || activeImages.length < 2) return;
    const deltaX = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(deltaX) < 40) return;
    showImage(imageIndex + (deltaX < 0 ? 1 : -1));
    touchStartX.current = null;
  }

  const handleAdd = useCallback(
    () => {
      if (confirmed || disabled) return;
      addToCart({
        kind: "product",
        productId,
        variantId: selectedVariant?.id,
        slug,
        nameAr: selectedVariant ? `${nameAr} — ${selectedVariant.nameAr}` : nameAr,
        nameFr: selectedVariant ? `${nameFr} — ${selectedVariant.nameFr}` : nameFr,
        image: activeImage,
        unitPrice: liveEffectivePrice,
        qty,
      });
      setConfirmed(true);
      open();
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmed(false), 2500);
    },
    [productId, selectedVariant, slug, nameAr, nameFr, activeImage, liveEffectivePrice, qty, confirmed, disabled, open],
  );

  return (
    // `lg:items-start` + a sticky panel: the gallery is a tall 4:5 plate and
    // the purchase panel is short, so an items-stretch grid left ~430px of
    // dead column under the buy box. Bounding the gallery and letting the
    // panel travel with the scroll turns that gap into headroom.
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-16">
      {/* Gallery. `min-w-0`: this column is a CSS Grid item with no explicit
          track size below `lg` (only `lg:grid-cols-2` is set), so its
          implicit column defaulted to `min-width: auto` — Safari/WebKit was
          sizing that to the gallery img's max-content width (its
          `width={800}` attribute), overflowing the grid track and bleeding
          the whole gallery off-screen on real iPhone Safari. `min-w-0`
          overrides the auto-minimum so the track shrinks to the grid's
          actual available inline size instead — confirmed against real
          WebKit (Playwright's webkit engine), not just Chromium. */}
      <div className="flex min-w-0 flex-col gap-4">
        <div
          className="relative flex aspect-4/5 max-h-[55vh] touch-manipulation items-center justify-center border border-border p-8 lg:max-h-[68vh]"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {activeImage ? (
            <div className="relative size-full">
              {/* Keyed on the public_id so switching variant or gallery frame
                  remounts the image — otherwise the new photo would swap in
                  with no placeholder while it loads. */}
              <ProductImage
                key={activeImage}
                publicId={activeImage}
                sizes="(min-width: 1024px) 456px, 76vw"
                alt={t("imageAlt", { name })}
                preload
                previewFromGrid
              />
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                aria-label={t("zoomImage")}
                className="group/zoom absolute inset-0 cursor-zoom-in touch-manipulation"
              >
                <span
                  aria-hidden="true"
                  className="absolute end-2 bottom-2 flex size-9 items-center justify-center border border-ink bg-background text-ink transition-colors group-hover/zoom:bg-ink group-hover/zoom:text-paper"
                >
                  <ZoomIn className="size-4" aria-hidden="true" />
                </span>
              </button>
            </div>
          ) : (
            <Package className="size-16 text-ink-soft" aria-hidden="true" />
          )}

          {activeImages.length > 1 && (
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

        {activeImages.length > 1 && (
          <div className="flex gap-3 overflow-x-auto">
            {activeImages.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => showImage(index)}
                aria-label={t("thumbnailLabel", { index: index + 1 })}
                aria-current={index === imageIndex}
                className={`flex size-16 shrink-0 touch-manipulation items-center justify-center border p-2 transition-colors ${
                  index === imageIndex ? "border-ink" : "border-border hover:border-ink"
                }`}
              >
                <ProductImage publicId={image} sizes="48px" alt={t("imageAlt", { name })} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Purchase panel */}
      <div className="flex flex-col lg:sticky lg:top-24">
        <div className="flex items-baseline gap-3">
          {/* The price led at `text-2xl` under a ~30px display-serif name —
              third-loudest thing on the page, on a price-sensitive purchase
              for a price-sensitive audience. */}
          <span className="font-mono text-3xl font-medium text-ink">{formatMoney(liveEffectivePrice)}</span>
          {liveEffectivePrice < basePrice && (
            <span className="font-mono text-base text-ink-soft line-through">{formatMoney(basePrice)}</span>
          )}
        </div>

        {((promo && !promoExpired) || status !== "in-stock") && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {promo && !promoExpired && <PromoCountdown endsAt={promo.endsAt} />}
            <StockBadge status={status} label={tBadges(status === "backorder" ? "backorder" : "outOfStock")} />
          </div>
        )}

        {variants.length > 0 && (
          <div className="mt-8">
            <span className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">{t("variantLabel")}</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => selectVariant(variant.id)}
                  aria-pressed={variant.id === selectedVariantId}
                  className={`inline-flex h-11 items-center gap-2 rounded-[2px] border px-3.5 text-sm text-ink transition-colors ${
                    variant.id === selectedVariantId ? "border-ink" : "border-border hover:border-ink"
                  }`}
                >
                  {variant.colorHex && (
                    <span
                      aria-hidden="true"
                      className="size-3.5 rounded-full border border-border"
                      style={{ backgroundColor: variant.colorHex }}
                    />
                  )}
                  {variant.name}
                </button>
              ))}
            </div>
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
          // `scroll-mb` (not page padding): the mobile bottom nav is `fixed`,
          // so it sits outside the layout the browser's native
          // scroll-into-view math reasons about — without this, tabbing to
          // (or `.focus()`-ing) this button scrolls it exactly flush with
          // the viewport edge, right behind the bar, no matter how much
          // trailing page content or padding follows it.
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

        {/* This shop's whole mechanism is a human WhatsApp conversation, and
            "ask before you buy" is how this audience already shops — yet the
            product page offered add-to-cart and nothing else. Rendered only
            once a number is configured: PRODUCT.md lists the WhatsApp business
            number as an open question, and a dead "ask us" link is worse than
            none. */}
        {askUrl && (
          <a
            href={askUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex min-h-11 items-center gap-2 self-start border-b border-transparent text-xs font-semibold tracking-[0.04em] text-plum uppercase transition-colors hover:border-plum"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            {t("askCta")}
          </a>
        )}
      </div>

      {lightboxOpen && (
        <ImageLightbox
          images={activeImages}
          index={imageIndex}
          alt={t("imageAlt", { name })}
          closeLabel={tCommon("close")}
          previousLabel={t("previousImage")}
          nextLabel={t("nextImage")}
          onIndexChange={showImage}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
