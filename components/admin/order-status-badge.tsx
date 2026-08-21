import {
  CircleCheck,
  Clock3,
  PackageCheck,
  PackageOpen,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderStatusValue } from "@/src/lib/order-tracking";

/**
 * Monochrome, Atelier Blanc-style status vocabulary — the old five-hue
 * family (gold/blue/green/red/violet) is retired; a state reads through
 * icon, weight, and the presence of a border, never through color, exactly
 * the technique the storefront's own StockBadge already uses (bordered =
 * needs a look, plain = calm, semibold = resolved).
 */
const ICONS: Record<OrderStatusValue, LucideIcon> = {
  pending: Clock3,
  confirmed: PackageOpen,
  preparing: PackageOpen,
  shipped: Truck,
  arrived: Truck,
  ready: PackageCheck,
  delivered: CircleCheck,
  cancelled: XCircle,
  voided: XCircle,
};

/** pending/cancelled/voided need a look, so they get the bordered tier; the rest are calm mid-flow states. */
const NEEDS_ATTENTION = new Set<OrderStatusValue>(["pending", "cancelled", "voided"]);

export function OrderStatusBadge({
  status,
  label,
  className,
}: {
  status: OrderStatusValue;
  label: string;
  className?: string;
}) {
  const Icon = ICONS[status];
  const attention = NEEDS_ATTENTION.has(status);
  const resolved = status === "delivered";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-semibold tracking-[0.02em]",
        attention ? "border border-ink text-ink" : "text-ink-soft",
        resolved && "text-ink",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
