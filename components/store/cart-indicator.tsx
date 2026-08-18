"use client";

import { ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { useCartDrawer } from "@/components/store/cart-drawer-context";
import { CART_UPDATED_EVENT, cartCount, getCart } from "@/src/lib/cart";

function useCartCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(cartCount(getCart()));
    sync();
    window.addEventListener(CART_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return count;
}

/**
 * Anchored to the *control's* top-end corner, not the bag icon's. On the
 * desktop pill the icon is followed inline by the word "السلة"/"PANIER", so an
 * icon-anchored badge landed exactly on the label's first letters in both
 * locales — on every page of the site.
 */
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -end-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-[2px] bg-ink px-1 font-mono text-xs leading-none text-paper"
    >
      {count}
    </span>
  );
}

/** Desktop header cart pill — same markup task 08 shipped as a static placeholder, now opens `<CartDrawer>` (task 11). */
export function DesktopCartIndicator({ label }: { label: string }) {
  const count = useCartCount();
  const { toggle } = useCartDrawer();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-haspopup="dialog"
      className="relative hidden min-h-11 items-center gap-2 rounded-[2px] border border-ink px-3.5 py-2.5 text-xs font-medium tracking-[0.04em] text-ink uppercase transition-colors hover:bg-ink hover:text-paper md:inline-flex"
    >
      <ShoppingBag className="size-3.5" aria-hidden="true" />
      {label}
      <CountBadge count={count} />
      <span className="sr-only" aria-live="polite">
        {count}
      </span>
    </button>
  );
}

/** Mobile bottom-bar cart item — same slot task 08 shipped, now opens `<CartDrawer>` (task 11). */
export function MobileCartIndicator({ label }: { label: string }) {
  const count = useCartCount();
  const { toggle } = useCartDrawer();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-haspopup="dialog"
      className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center text-xs leading-tight font-medium tracking-[0.03em] text-ink uppercase"
    >
      <span className="relative inline-flex">
        <ShoppingBag className="size-4" aria-hidden="true" />
        <CountBadge count={count} />
      </span>
      {label}
      <span className="sr-only" aria-live="polite">
        {count}
      </span>
    </button>
  );
}
