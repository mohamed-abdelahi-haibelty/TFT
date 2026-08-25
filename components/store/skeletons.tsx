import { Skeleton } from "@/components/ui/skeleton";

/**
 * Streaming fallbacks for the storefront's Suspense boundaries and
 * `loading.tsx` files.
 *
 * These exist to be *geometrically identical* to the content they stand in
 * for — same tray aspect, same grid tracks, same gaps, same text line
 * heights. A skeleton that merely gestures at the shape trades a blank screen
 * for a layout shift, which on the mobile connections PRODUCT.md targets is
 * the worse of the two. Everything below mirrors a real component; if one of
 * those grids changes, its skeleton has to change with it.
 */

/** Mirrors `ProductCard` / `BundleCard`: bordered square plate, name line, price line. */
function CardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="mb-4 aspect-square border border-border p-6">
        <Skeleton className="size-full rounded-[2px]" />
      </div>
      <Skeleton className="h-4 w-3/4 rounded-[2px]" />
      <Skeleton className="mt-2 h-3.5 w-1/3 rounded-[2px]" />
    </div>
  );
}

/** Mirrors the `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` product grid on home and catalog. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <CardSkeleton key={index} />
      ))}
    </div>
  );
}

/** The catalog's heading + result count + filter block + grid, i.e. everything below the category rail. */
export function CatalogResultsSkeleton() {
  return (
    <>
      <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-border pb-4">
        <Skeleton className="h-8 w-48 rounded-[2px]" />
        <Skeleton className="h-3.5 w-20 shrink-0 rounded-[2px]" />
      </div>
      <div className="mb-10 h-11 border border-border lg:border-0" />
      <ProductGridSkeleton count={8} />
    </>
  );
}

/**
 * The detail-page skeletons are split per page and mirror their real layout
 * *exactly*, because a detail page is where a mismatch hurts most: it is one
 * tall column on a phone, so any difference in the plate's aspect ratio or in
 * which breakpoint the grid splits at moves everything below it when the real
 * content arrives.
 *
 * The first version of this was one shared skeleton with a square plate and a
 * `md:grid-cols-2` split. Both detail pages disagreed with it — the product
 * plate is 4:5, and both pages split at `lg`, not `md` — so every product page
 * visibly re-flowed on load, and between 768px and 1024px the skeleton showed
 * two columns where the content had one. If either layout below changes, its
 * skeleton has to change with it.
 */

/** The purchase panel: price, a couple of option rows, quantity, CTA. */
function PurchasePanelSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="h-9 w-40 rounded-[2px]" />
      <Skeleton className="mt-3 h-5 w-24 rounded-[2px]" />
      <div className="mt-8">
        <Skeleton className="h-3.5 w-20 rounded-[2px]" />
        <Skeleton className="mt-3 h-5 w-32 rounded-[2px]" />
      </div>
      <div className="mt-8 flex items-center gap-4">
        <Skeleton className="h-3.5 w-16 rounded-[2px]" />
        <Skeleton className="h-11 w-32 rounded-[2px]" />
      </div>
      <Skeleton className="mt-8 h-12 w-full rounded-[2px]" />
    </div>
  );
}

/** Mirrors `app/[locale]/(store)/product/[slug]/page.tsx` + `ProductInteractive`. */
export function ProductDetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Skeleton className="mb-4 h-3.5 w-40 rounded-[2px] sm:mb-8" />
      <Skeleton className="mb-6 h-8 w-2/3 rounded-[2px] sm:mb-10 sm:h-9" />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-16">
        <div className="flex min-w-0 flex-col gap-4">
          {/* aspect-4/5 and the max-h caps, not a square — this is the one that
              was wrong and moved the whole page on load. */}
          <div className="flex aspect-4/5 max-h-[55vh] items-center justify-center border border-border p-8 lg:max-h-[68vh]">
            <Skeleton className="size-full rounded-[2px]" />
          </div>
          <div className="flex gap-3 overflow-x-auto">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="size-16 shrink-0 rounded-[2px]" />
            ))}
          </div>
        </div>
        <PurchasePanelSkeleton />
      </div>
    </div>
  );
}

/** Mirrors `app/[locale]/(store)/boxes/[slug]/page.tsx` + `BundleInteractive`. */
export function BundleDetailSkeleton() {
  return (
    // `max-w-4xl`, not `6xl` — the box page is narrower than the product page.
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Skeleton className="mb-8 h-3.5 w-40 rounded-[2px]" />
      <Skeleton className="mb-10 h-8 w-2/3 rounded-[2px] sm:h-9" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start lg:gap-12">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex aspect-square items-center justify-center border border-border p-6">
            <Skeleton className="size-full rounded-[2px]" />
          </div>
          <div className="flex gap-3 overflow-x-auto">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="size-14 shrink-0 rounded-[2px]" />
            ))}
          </div>
        </div>
        <PurchasePanelSkeleton />
      </div>
    </div>
  );
}

/** Mirrors the boxes ledger: a plate, two stacked text lines, a price in the end column. */
export function BundleListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="border-b border-border">
          <div className="flex items-center gap-5 py-5">
            <Skeleton className="size-20 shrink-0 rounded-[2px] sm:size-24" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-1/2 rounded-[2px]" />
              <Skeleton className="mt-2 h-3.5 w-20 rounded-[2px]" />
            </div>
            <Skeleton className="h-5 w-24 shrink-0 rounded-[2px]" />
          </div>
        </li>
      ))}
    </ul>
  );
}
