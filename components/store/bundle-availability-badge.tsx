/**
 * A bundle has no per-product backorder state of its own — `maxSellable`
 * (from `deriveMaxSellable`) collapses every component's stock into one
 * number, and `0` is the only case worth a badge. Same silent-by-default,
 * muted-label treatment as `StockBadge`'s own out-of-stock branch.
 */
export function BundleAvailabilityBadge({ maxSellable, label }: { maxSellable: number | null; label: string }) {
  if (maxSellable !== 0) return null;

  return (
    <span className="inline-flex w-fit items-center text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
      {label}
    </span>
  );
}
