import type { StockStatus } from "@/src/lib/stock-status";

/**
 * Renders nothing for the default "in-stock" case — Atelier Blanc keeps the
 * common case silent and reserves the badge for what actually needs the
 * customer's attention. Never the five-hue status family (Admin/POS only,
 * per DESIGN.md); backorder gets a plain Ink outline (still orderable, said
 * plainly), out-of-stock a muted Ink-soft label, no border.
 */
export function StockBadge({ status, label }: { status: StockStatus; label: string }) {
  if (status === "in-stock") return null;

  return (
    <span
      className={
        status === "backorder"
          ? "inline-flex w-fit items-center rounded-[2px] border border-ink px-1.5 py-0.5 text-xs font-semibold tracking-[0.04em] text-ink uppercase"
          : "inline-flex w-fit items-center text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase"
      }
    >
      {label}
    </span>
  );
}
