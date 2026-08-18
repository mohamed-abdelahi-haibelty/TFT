export type PromotionStatus = "scheduled" | "active" | "ended" | "disabled";

/**
 * Disabled overrides the clock entirely; otherwise status follows the same
 * `starts_at` inclusive / `ends_at` exclusive window `getEffectivePrice` uses,
 * so the admin list never shows "active" a tick after pricing stops applying it.
 */
export function computePromotionStatus(
  promotion: { isActive: boolean; startsAt: Date; endsAt: Date },
  now: Date,
): PromotionStatus {
  if (!promotion.isActive) return "disabled";
  if (now < promotion.startsAt) return "scheduled";
  if (now >= promotion.endsAt) return "ended";
  return "active";
}

export type RemainingTime = { days: number; hours: number; minutes: number };

/** Whole-minute breakdown of the time left until `endsAt`, floored at zero. */
export function remainingUntil(endsAt: Date, now: Date): RemainingTime {
  const totalMinutes = Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 60_000));
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  };
}
