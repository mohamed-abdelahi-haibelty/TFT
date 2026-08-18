"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { remainingUntil } from "@/src/lib/promotion-status";

/**
 * "Ends in Xd Xh Xm" — cosmetic and client-ticking only (task-09 scope); the
 * pricing service, not the clock here, is what actually stops applying a
 * promo. Renders nothing until mount (avoids a server/client time mismatch)
 * and nothing once `endsAt` has passed (the next real page load drops the
 * promo from `getEffectivePrice` itself).
 */
export function PromoCountdown({ endsAt }: { endsAt: string }) {
  const t = useTranslations("store.badges");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Deliberate: the first tick has to run once, synchronously, right after
    // mount — it's what turns the server's `null` (no time to render safely
    // with) into the client-only real clock. `set-state-in-effect` is right
    // to flag most direct effect-body setState calls, but not this one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const end = new Date(endsAt);
  if (now >= end) return null;

  const { days, hours, minutes } = remainingUntil(end, now);

  return (
    <span className="inline-flex w-fit items-center rounded-[2px] border border-plum px-1.5 py-0.5 text-xs font-medium leading-none text-plum">
      {t("promoEndsIn", { days, hours, minutes })}
    </span>
  );
}
