"use client";

import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useCartDrawer } from "@/components/store/cart-drawer-context";
import { Link } from "@/src/i18n/navigation";
import {
  CART_UPDATED_EVENT,
  type CartItem,
  cartItemName,
  cartSubtotal,
  getCart,
  removeFromCart,
  setCartItemQty,
} from "@/src/lib/cart";
import { buildCloudinaryUrl } from "@/src/lib/cloudinary";
import { formatMoney } from "@/src/lib/money";

function useCart(): CartItem[] {
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    const sync = () => setCart(getCart());
    sync();
    window.addEventListener(CART_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return cart;
}

/**
 * The Ambient-shadow slide-over DESIGN.md reserved for the storefront's cart
 * (task 11) — mounted once in the storefront layout, opened from either
 * header cart button via `CartDrawerProvider`. `inert` (not conditional
 * unmounting) keeps the panel in the DOM so the slide transition can play in
 * both directions, while removing it from tab order and hit-testing while
 * closed.
 */
export function CartDrawer() {
  const t = useTranslations("cart");
  const locale = useLocale();
  const { isOpen, close } = useCartDrawer();
  const cart = useCart();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Escape, plus a real focus trap. The panel asserts `aria-modal="true"`, but
  // Tab used to walk straight out of it: forward past the last control landed
  // on `<body>`, and Shift+Tab from the close button escaped backwards onto a
  // page link *behind* the open drawer.
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  const subtotal = cartSubtotal(cart);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={close}
        className={`fixed inset-0 z-50 bg-ink/40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        inert={!isOpen}
        className={`fixed inset-y-0 end-0 z-50 flex w-full flex-col border-s border-border sm:max-w-sm bg-background shadow-[0_8px_32px_oklch(0.204_0.009_59.14_/_0.16)] transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full rtl:-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-medium text-ink">{t("title")}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label={t("close")}
            className="flex size-11 items-center justify-center text-ink transition-colors hover:bg-paper"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
            <ShoppingBag className="size-10 text-ink-soft" aria-hidden="true" />
            <p className="text-sm text-ink-soft">{t("empty")}</p>
            <Link
              href="/catalog"
              onClick={close}
              className="inline-flex h-11 items-center rounded-[2px] border border-ink px-4 text-xs font-semibold tracking-[0.04em] text-ink uppercase transition-colors hover:bg-ink hover:text-paper"
            >
              {t("emptyCta")}
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-5">
              {cart.map((line) => {
                const name = cartItemName(line, locale);
                return (
                <li key={line.key} className="flex gap-4 border-b border-border py-4">
                  <div className="flex size-16 shrink-0 items-center justify-center border border-border p-2">
                    {line.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Cloudinary delivery URL, fixed size transform
                      <img
                        src={buildCloudinaryUrl(line.image, "thumbnail")}
                        alt=""
                        width={120}
                        height={120}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-contain mix-blend-multiply"
                      />
                    ) : (
                      <ShoppingBag className="size-6 text-ink-soft" aria-hidden="true" />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {/* `truncate` cut Latin brand names from the head in RTL. */}
                    <span className="line-clamp-2 text-sm font-medium text-ink">{name}</span>
                    {/* The line total, matching what checkout shows for the
                        same row. The drawer used to print the *unit* price
                        here, so three notebooks read "MRU 300" in the basket
                        and "MRU 900" one screen later. */}
                    <span className="font-mono text-xs text-ink-soft">
                      {formatMoney(line.unitPrice * line.qty)}
                      {line.qty > 1 && (
                        <span className="ms-1.5 text-ink-soft/70">
                          ({line.qty} × {formatMoney(line.unitPrice)})
                        </span>
                      )}
                    </span>

                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center border border-border">
                        <button
                          type="button"
                          onClick={() => setCartItemQty(line.key, line.qty - 1)}
                          aria-label={t("decreaseQty")}
                          className="flex size-11 items-center justify-center text-ink transition-colors hover:bg-paper"
                        >
                          <Minus className="size-4" aria-hidden="true" />
                        </button>
                        <span aria-live="polite" className="flex min-w-10 items-center justify-center font-mono text-sm text-ink">
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCartItemQty(line.key, line.qty + 1)}
                          aria-label={t("increaseQty")}
                          className="flex size-11 items-center justify-center text-ink transition-colors hover:bg-paper"
                        >
                          <Plus className="size-4" aria-hidden="true" />
                        </button>
                      </div>

                      {/* Was a bare 18×16 word sitting beside a 32px "−", with
                          no undo behind it. Now a real target, and padded away
                          from the stepper it used to be mistaken for. */}
                      <button
                        type="button"
                        onClick={() => removeFromCart(line.key)}
                        aria-label={t("removeAria", { name })}
                        className="flex min-h-11 min-w-11 items-center justify-center px-3 text-xs font-medium tracking-[0.03em] text-ink-soft uppercase underline underline-offset-4 transition-colors hover:text-ink"
                      >
                        {t("remove")}
                      </button>
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>

            <div className="border-t border-border px-5 py-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium text-ink">{t("subtotal")}</span>
                <span className="font-mono text-lg text-ink">{formatMoney(subtotal)}</span>
              </div>
              <Link
                href="/checkout"
                onClick={close}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-[2px] bg-ink text-xs font-semibold tracking-[0.05em] text-paper uppercase transition-colors hover:bg-[oklch(0.29_0.012_59.14)]"
              >
                {t("checkout")}
              </Link>
              {/* The first total a nervous first-time shopper ever sees. The
                  product page reassures, then the basket used to withdraw it
                  and show a black button over a number — which reads as "this
                  is where they ask for my card". */}
              <p className="mt-3 text-xs leading-relaxed text-ink-soft">{t("reassurance")}</p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
