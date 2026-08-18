import { cn } from "@/lib/utils";
import type { OrderStatusValue } from "@/src/lib/order-tracking";

const BADGE_STYLES: Record<OrderStatusValue, string> = {
  pending: "bg-gold-soft text-ink",
  confirmed: "bg-blue-bg text-blue-text",
  preparing: "bg-blue-bg text-blue-text",
  shipped: "bg-violet-bg text-violet-text",
  arrived: "bg-violet-bg text-violet-text",
  ready: "bg-violet-bg text-violet-text",
  delivered: "bg-green-bg text-green-text",
  cancelled: "bg-red-bg text-red-text",
  voided: "bg-red-bg text-red-text",
};

const DOT_STYLES: Record<OrderStatusValue, string> = {
  pending: "bg-gold-strong",
  confirmed: "bg-blue",
  preparing: "bg-blue",
  shipped: "bg-violet",
  arrived: "bg-violet",
  ready: "bg-violet",
  delivered: "bg-green",
  cancelled: "bg-red",
  voided: "bg-red",
};

/** The five-hue status family, task 13's own mapping: gold = needs action (pending), blue = confirmed work in progress, violet = in transit / awaiting pickup (shipped/arrived/ready), green = done, red = the two terminal non-fulfillment states. */
export function OrderStatusBadge({
  status,
  label,
  className,
}: {
  status: OrderStatusValue;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        BADGE_STYLES[status],
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", DOT_STYLES[status])} />
      {label}
    </span>
  );
}
