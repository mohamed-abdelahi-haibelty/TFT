export type AvailabilityComponent = {
  qty: number;
  stock: number;
  allowBackorder: boolean;
};

export type LimitRef = { nameAr: string; nameFr: string };

/**
 * Max sellable units for a bundle = the smallest floor(component stock / qty)
 * across its components — except a component whose product allows backorder
 * never limits the bundle (task-07: "backorder components count as
 * available"). `null` means unlimited — every component allows backorder.
 * An empty item list can't be sold, so it derives to `0`.
 */
export function deriveMaxSellable(components: AvailabilityComponent[]): number | null {
  if (components.length === 0) return 0;

  let max: number | null = null;
  for (const component of components) {
    if (component.allowBackorder) continue;
    const unitsAvailable = Math.floor(component.stock / component.qty);
    max = max === null ? unitsAvailable : Math.min(max, unitsAvailable);
  }
  return max;
}

/**
 * The component that caps the bundle's sellable units — the non-backorder
 * component with the smallest floor(stock / qty), matched against the max
 * returned by `deriveMaxSellable`. `null` when nothing limits the bundle.
 */
export function deriveLimitingComponent(
  components: (AvailabilityComponent & LimitRef)[],
): LimitRef | null {
  const max = deriveMaxSellable(components);
  if (max === null) return null;

  for (const component of components) {
    if (component.allowBackorder) continue;
    if (Math.floor(component.stock / component.qty) === max) {
      return { nameAr: component.nameAr, nameFr: component.nameFr };
    }
  }
  return null;
}
