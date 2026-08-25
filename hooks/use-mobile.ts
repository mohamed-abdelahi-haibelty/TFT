import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * `useSyncExternalStore` rather than an effect: the viewport is external state
 * that already exposes a subscribe/read pair, so React can read it during
 * render on the client and take the server snapshot on the server — no
 * setState-in-effect, and no extra commit on mount.
 */
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

/** There is no viewport on the server; the previous hook reported the same `false` until its effect ran. */
function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
