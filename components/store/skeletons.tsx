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

/** Mirrors the product/box detail layout: gallery plate beside the purchase panel. */
export function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Skeleton className="mb-4 h-3.5 w-40 rounded-[2px] sm:mb-8" />
      <Skeleton className="mb-6 h-9 w-2/3 rounded-[2px] sm:mb-10" />
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          <div className="aspect-square border border-border p-6">
            <Skeleton className="size-full rounded-[2px]" />
          </div>
          <div className="mt-4 flex gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="size-20 shrink-0 rounded-[2px]" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-32 rounded-[2px]" />
          <Skeleton className="h-4 w-24 rounded-[2px]" />
          <Skeleton className="mt-4 h-12 w-full rounded-[2px]" />
          <Skeleton className="h-12 w-full rounded-[2px]" />
        </div>
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
