"use server";

import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { track } from "@/src/lib/analytics";
import { getAnalyticsDistinctId } from "@/src/lib/analytics-identity";
import type { ServiceResult } from "@/src/lib/errors";
import { checkRateLimit } from "@/src/lib/rate-limit";
import { trackOrder, type TrackOrderResult } from "@/src/services/tracking";

/**
 * Order lookup as a POST, not a GET.
 *
 * The form used to submit to itself, which put `?code=…&phone=…` in the
 * address bar — and the checkout confirmation linked there pre-filled. That
 * pair is stated to be the only credential guarding an order, and a query
 * string is the one place it must never be: browser history, server and proxy
 * access logs, and any `Referer` sent onward all keep a copy. Order codes are
 * sequential, so a leaked phone number plus a few hundred guesses enumerates
 * that customer's orders.
 *
 * A shared tracking link is no longer possible, which is the point.
 */
const RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

export type TrackOrderState = ServiceResult<TrackOrderResult> | null;

async function clientIp(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function trackOrderAction(_prev: TrackOrderState, formData: FormData): Promise<TrackOrderState> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "track.errors" });

  const code = String(formData.get("code") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!code || !phone) {
    return { ok: false, error: { code: "VALIDATION", message: t("missingFields") } };
  }

  const ip = await clientIp();
  if (!checkRateLimit(`track:${ip}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return { ok: false, error: { code: "RATE_LIMITED", message: t("rateLimited") } };
  }

  const result = await trackOrder({ code, phone }, locale);

  // Only whether a lookup landed, never what was looked up. The code/phone pair
  // is stated to be this order's only credential, and the docblock above is the
  // reason it is kept out of the URL — putting either into an analytics event
  // would hand it to a third party by a different route.
  track("order_tracked", { found: result.ok }, await getAnalyticsDistinctId());

  return result;
}
