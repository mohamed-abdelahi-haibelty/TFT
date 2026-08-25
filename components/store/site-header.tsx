import { getTranslations } from "next-intl/server";
import { DesktopCartIndicator, MobileCartIndicator } from "@/components/store/cart-indicator";
import { LocaleSwitch } from "@/components/store/locale-switch";
import { routing } from "@/src/i18n/routing";
import { Link } from "@/src/i18n/navigation";

/**
 * Storefront shell nav — "Atelier Blanc": a quiet editorial bar, white on
 * white, a 1px hairline instead of the previous system's thick ink rule.
 * The serif wordmark (font-display, same face the hero headline uses)
 * replaces the circular brand mark — Atelier Blanc's nav is typographic,
 * not iconographic. Zero client JS: the locale switch is a pair of plain
 * links, not a dropdown.
 *
 * The bottom bar is a sibling of `<header>`, not nested inside it, so a
 * future header effect that establishes a CSS containing block (a
 * `backdrop-filter` or `transform`) can never anchor its `bottom-0` to the
 * header's own box instead of the viewport.
 */
export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "store" });

  const links = [
    { href: "/catalog" as const, label: t("nav.catalog") },
    { href: "/boxes" as const, label: t("nav.boxes") },
    { href: "/track" as const, label: t("nav.track") },
  ];

  const otherLocale = routing.locales.find((candidate) => candidate !== locale) ?? routing.locales[0];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="-ms-1 flex min-h-11 items-center px-1 font-display text-xl font-semibold text-ink">
            TFT
          </Link>

          <nav className="hidden items-center gap-8 md:flex" aria-label={t("nav.catalog")}>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex min-h-11 items-center text-xs font-medium tracking-[0.04em] text-ink uppercase transition-colors hover:text-plum"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {/* Always visible, not `sm:`-gated — on real phone widths (<640px) that
                gate hid the only way to switch AR/FR, leaving mobile, the primary
                audience, with no language control anywhere in the storefront. */}
            {/* Switching language used to send the visitor back to the home
                page from wherever they were — including mid-checkout. */}
            <LocaleSwitch
              locale={otherLocale}
              label={t(`localeSwitch.${otherLocale}` as "localeSwitch.ar" | "localeSwitch.fr")}
              navLabel={`${t("localeSwitch.ar")} / ${t("localeSwitch.fr")}`}
            />

            <DesktopCartIndicator label={t("nav.cart")} />
          </div>
        </div>
      </header>

      {/* Mobile bottom bar — replaces the desktop nav + cart pill below md. */}
      <nav
        aria-label={t("nav.catalog")}
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center text-xs leading-tight font-medium tracking-[0.03em] text-ink uppercase"
          >
            {link.label}
          </Link>
        ))}
        <MobileCartIndicator label={t("nav.cart")} />
      </nav>
    </>
  );
}
