"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { buildCloudinaryUrl } from "@/src/lib/cloudinary";

export type ImageLightboxProps = {
  images: string[];
  index: number;
  alt: string;
  closeLabel: string;
  previousLabel: string;
  nextLabel: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

/**
 * Full-screen viewer for a product/bundle gallery image, opened by tapping
 * the gallery plate. Serves the "zoom" Cloudinary size (1600×1600) — already
 * fetched into the page's srcSet for responsive serving, now shown at full
 * resolution instead of scaled into the small gallery box. Tapping the image
 * toggles between fit-to-screen and natural size (scrollable) so a shopper
 * can inspect a detail closely; tapping the backdrop closes, matching the
 * "the image is the target, the space around it is the exit" convention
 * most native photo viewers use.
 */
/** The mount check never changes after hydration, so there is nothing to subscribe to. */
function subscribeToNothing() {
  return () => {};
}

export function ImageLightbox({
  images,
  index,
  alt,
  closeLabel,
  previousLabel,
  nextLabel,
  onIndexChange,
  onClose,
}: ImageLightboxProps) {
  const [zoomed, setZoomed] = useState(false);
  // Portaled to `document.body` below — nested this deep in the page tree,
  // a `fixed inset-0` overlay is one stray `transform`/`filter` ancestor away
  // from being contained instead of covering the real viewport (confirmed
  // live: without the portal, the overlay clipped to a mid-page band and the
  // header/breadcrumb/footer showed through above and below it). `CartDrawer`
  // gets away without one only because the layout mounts it at the root.
  // `useSyncExternalStore` with a `false` server snapshot and a `true` client
  // one is the mount check without the setState-in-effect: React reads it
  // during render on the client and never commits a second pass for it.
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const touchStartX = useRef<number | null>(null);
  const activeImage = images[index] ?? null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && images.length > 1) showImage(index - 1);
      if (event.key === "ArrowRight" && images.length > 1) showImage(index + 1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-bound per index/images below via closure capture is fine at this scale
  }, [index, images.length, onClose]);

  function showImage(nextIndex: number) {
    setZoomed(false);
    onIndexChange(((nextIndex % images.length) + images.length) % images.length);
  }

  function handleTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: React.TouchEvent) {
    if (zoomed || touchStartX.current == null || images.length < 2) return;
    const deltaX = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(deltaX) < 40) return;
    showImage(index + (deltaX < 0 ? 1 : -1));
    touchStartX.current = null;
  }

  if (!activeImage || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex flex-col bg-ink"
      onClick={onClose}
    >
      <div className="flex items-center justify-between p-4">
        {images.length > 1 ? (
          <span dir="ltr" className="font-mono text-xs text-paper">
            {index + 1} / {images.length}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="flex size-11 touch-manipulation items-center justify-center border border-paper text-paper transition-colors hover:bg-paper hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div
        className={`relative flex flex-1 items-center justify-center overflow-auto p-4 ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={(event) => event.stopPropagation()}
      >
        {/* The one storefront image that is still a raw <img>, deliberately.
            Zoomed mode is `w-auto max-w-none` inside a scroll container — the
            image must overflow at its natural size for panning to work at all,
            and `next/image` (whether `fill` or intrinsic) writes its own
            sizing that fights exactly that. Nothing is lost here: the viewer
            opens on demand, over a dark backdrop, on a photo the gallery hero
            has usually already warmed. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
        <img
          key={activeImage}
          src={buildCloudinaryUrl(activeImage, "zoom")}
          width={1600}
          height={1600}
          alt={alt}
          onClick={() => setZoomed((current) => !current)}
          className={
            zoomed
              ? "h-auto w-auto max-w-none touch-manipulation"
              : "max-h-full max-w-full touch-manipulation object-contain"
          }
        />

        {images.length > 1 && !zoomed && (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                showImage(index - 1);
              }}
              aria-label={previousLabel}
              className="absolute start-2 top-1/2 flex size-11 -translate-y-1/2 touch-manipulation items-center justify-center border border-paper text-paper transition-colors hover:bg-paper hover:text-ink"
            >
              <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                showImage(index + 1);
              }}
              aria-label={nextLabel}
              className="absolute end-2 top-1/2 flex size-11 -translate-y-1/2 touch-manipulation items-center justify-center border border-paper text-paper transition-colors hover:bg-paper hover:text-ink"
            >
              <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
