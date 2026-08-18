"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type CartDrawerContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const CartDrawerContext = createContext<CartDrawerContextValue | null>(null);

/** One open/close boolean shared by the header cart button, the mobile bottom-bar cart button, and `<CartDrawer>` itself — mounted once in the storefront layout. */
export function CartDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  // Whatever had focus when the drawer opened — one of two cart buttons, or the
  // add-to-cart button that opened it programmatically. Closing used to drop
  // focus on `<body>`, dumping a keyboard user at the top of the page.
  const lastTrigger = useRef<HTMLElement | null>(null);

  const rememberTrigger = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) lastTrigger.current = active;
  }, []);

  const restoreTrigger = useCallback(() => {
    const trigger = lastTrigger.current;
    lastTrigger.current = null;
    // After the closing transition starts, so focus doesn't fight the drawer's
    // own `inert` toggle.
    requestAnimationFrame(() => trigger?.focus());
  }, []);

  const open = useCallback(() => {
    rememberTrigger();
    setIsOpen(true);
  }, [rememberTrigger]);

  const close = useCallback(() => {
    setIsOpen(false);
    restoreTrigger();
  }, [restoreTrigger]);

  const toggle = useCallback(() => {
    setIsOpen((current) => {
      if (current) restoreTrigger();
      else rememberTrigger();
      return !current;
    });
  }, [rememberTrigger, restoreTrigger]);

  const value = useMemo(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle]);

  return <CartDrawerContext.Provider value={value}>{children}</CartDrawerContext.Provider>;
}

export function useCartDrawer(): CartDrawerContextValue {
  const context = useContext(CartDrawerContext);
  if (!context) throw new Error("useCartDrawer must be used within a CartDrawerProvider");
  return context;
}
