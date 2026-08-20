import { Link } from "@/src/i18n/navigation";

/**
 * "Atelier Blanc": a plain uppercase tracked label with a plum underline on
 * hover — no pill, no fill. `active` (task 09 — the catalog page is the
 * first place a storefront chip has a real "current" state to show) keeps
 * that same underline on permanently instead of only on hover.
 */
export function CategoryChip({ slug, name, active = false }: { slug: string; name: string; active?: boolean }) {
  return (
    <Link
      href={`/catalog/${slug}`}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 shrink-0 snap-start items-end border-b-2 pb-2 text-xs font-semibold tracking-[0.04em] uppercase transition-colors hover:border-plum hover:text-ink ${
        active ? "border-plum text-ink" : "border-transparent text-ink-soft"
      }`}
    >
      {name}
    </Link>
  );
}
