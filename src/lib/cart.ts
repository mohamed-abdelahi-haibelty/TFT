/**
 * Storefront cart, client-side only (no accounts to hang server state off —
 * see PRODUCT.md). Task 09 only needs an add + a header count; task 11 owns
 * the cart page/drawer, qty edit, remove, and subtotal, and extends this same
 * module rather than replacing it. `addCartItem`/`cartCount` are pure and
 * unit-tested directly; `getCart`/`addToCart` are the thin localStorage
 * wrapper other components call.
 */

import { trackEvent } from "./analytics-client";

export type CartItemKind = "product" | "bundle";

export type CartItem = {
  /** Unique line identity: a bare product, one of its variants, or a bundle each get their own line. */
  key: string;
  kind: CartItemKind;
  productId?: string;
  variantId?: string;
  bundleId?: string;
  slug: string;
  /**
   * Both locales are snapshotted at add time. A single resolved `name` used to
   * be stored instead, which froze the line in whatever locale it was added
   * in — switch to French from the header and the checkout listed Arabic
   * product names (PRODUCT.md principle 4).
   */
  nameAr: string;
  nameFr: string;
  /** @deprecated Single-locale snapshot written by carts predating the bilingual fix; read only as a fallback. */
  name?: string;
  image: string | null;
  /** Effective-price snapshot for display only — checkout (task 11) always re-prices server-side. */
  unitPrice: number;
  qty: number;
};

export type NewCartItem = Omit<CartItem, "key">;

const STORAGE_KEY = "tft-cart";
export const CART_UPDATED_EVENT = "tft:cart-updated";

export function cartItemKey(item: Pick<CartItem, "kind" | "productId" | "variantId" | "bundleId">): string {
  if (item.kind === "bundle") return `bundle:${item.bundleId}`;
  return item.variantId ? `product:${item.productId}:${item.variantId}` : `product:${item.productId}`;
}

/** Adding an already-present line merges quantities and refreshes the price snapshot; otherwise appends a new line. */
export function addCartItem(cart: CartItem[], item: NewCartItem): CartItem[] {
  const key = cartItemKey(item);
  const existingIndex = cart.findIndex((line) => line.key === key);

  if (existingIndex === -1) return [...cart, { ...item, key }];

  return cart.map((line, index) =>
    index === existingIndex ? { ...line, qty: line.qty + item.qty, unitPrice: item.unitPrice } : line,
  );
}

/** Resolves a line's display name for the locale being rendered, falling back to a pre-bilingual cart's frozen snapshot. */
export function cartItemName(item: CartItem, locale: string): string {
  return (locale === "ar" ? item.nameAr : item.nameFr) || item.name || "";
}

export function cartCount(cart: CartItem[]): number {
  return cart.reduce((sum, line) => sum + line.qty, 0);
}

export function cartSubtotal(cart: CartItem[]): number {
  return cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
}

export function removeCartItem(cart: CartItem[], key: string): CartItem[] {
  return cart.filter((line) => line.key !== key);
}

/** `qty <= 0` removes the line — the cart page's "−" stepper reaching zero reads as "remove", not a stuck-at-1 dead end. */
export function updateCartItemQty(cart: CartItem[], key: string, qty: number): CartItem[] {
  if (qty <= 0) return removeCartItem(cart, key);
  return cart.map((line) => (line.key === key ? { ...line, qty } : line));
}

function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

function writeCart(cart: CartItem[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function getCart(): CartItem[] {
  return readCart();
}

export function addToCart(item: NewCartItem): CartItem[] {
  const next = addCartItem(readCart(), item);
  writeCart(next);

  // The one place both the product page and the bundle page pass through, so
  // the event cannot drift out of sync with one of them. It belongs on this
  // wrapper rather than on the pure `addCartItem` above, which stays free of
  // side effects and is unit-tested directly.
  trackEvent("added_to_cart", { type: item.kind, slug: item.slug, qty: item.qty });

  return next;
}

export function removeFromCart(key: string): CartItem[] {
  const next = removeCartItem(readCart(), key);
  writeCart(next);
  return next;
}

export function setCartItemQty(key: string, qty: number): CartItem[] {
  const next = updateCartItemQty(readCart(), key, qty);
  writeCart(next);
  return next;
}

export function clearCart(): void {
  writeCart([]);
}
