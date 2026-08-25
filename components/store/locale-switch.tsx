"use client";

import { Link, usePathname } from "@/src/i18n/navigation";

/**
 * Swaps the locale on the *current* path rather than sending the visitor home.
 * `usePathname` from `@/src/i18n/navigation` returns the route without its
 * locale prefix, which is exactly what `<Link locale>` wants — so this is a
 * client component only because that hook is one.
 *
 * Search params are deliberately dropped: the only pages carrying them are the
 * catalog (whose filters are locale-independent and worth keeping, but are not
 * available to `usePathname`) and `/track`, where re-running a lookup across a
 * language switch is not something to preserve.
 */
export function LocaleSwitch({
  locale,
  label,
  navLabel,
}: {
  locale: "ar" | "fr";
  label: string;
  navLabel: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={navLabel} className="flex text-xs">
      <Link
        href={pathname}
        locale={locale}
        className="flex min-h-11 items-center rounded-[2px] border border-ink px-3 font-medium tracking-[0.04em] text-ink uppercase transition-colors hover:bg-ink hover:text-paper sm:px-3.5"
      >
        {label}
      </Link>
    </nav>
  );
}
