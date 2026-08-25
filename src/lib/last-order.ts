/**
 * The confirmation screen used to live only in React state, so a refresh —
 * or the OS reclaiming the tab while the customer switched to WhatsApp —
 * destroyed the order code permanently. There are no accounts here: the page
 * itself says the code plus the phone number is the only credential that will
 * ever retrieve the order, and the cart is already cleared by then, so there
 * is nothing to re-submit either.
 *
 * Same posture as `cart.ts`: browser-local, best-effort, never a source of
 * truth. A private window or blocked site data just returns `null` and the
 * customer sees the ordinary empty-cart checkout.
 */

export type StoredOrderItem = { name: string; qty: number; unitPrice: number };

export type StoredOrder = {
  code: string;
  customerName: string;
  city: "ndb" | "nkc";
  items: StoredOrderItem[];
  subtotal: number;
  discountTotal: number;
  total: number;
  /** Local part only (8 digits), to pre-fill the tracking form. */
  phone: string;
  savedAt: number;
};

const STORAGE_KEY = "tft-last-order";

/** A confirmation older than this is stale — the customer has moved on. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isStoredOrder(value: unknown): value is StoredOrder {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredOrder>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.total === "number" &&
    typeof candidate.savedAt === "number" &&
    Array.isArray(candidate.items)
  );
}

export function readLastOrder(): StoredOrder | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredOrder(parsed)) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastOrder(order: Omit<StoredOrder, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...order, savedAt: Date.now() }));
  } catch {
    // Storage full or blocked — the in-memory confirmation still renders.
  }
}

export function clearLastOrder(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to recover from; the entry expires on its own.
  }
}
