import { getTranslations } from "next-intl/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/src/lib/rate-limit";
import { withErrorHandling } from "@/src/lib/with-error-handling";
import { createOrder } from "@/src/services/orders";

// Generous enough for a genuine customer retry (a promo reprice, a fixed
// typo) but tight enough to blunt a script — the real backstop is the
// Cloudflare edge rule `rate-limit.ts` documents, this is a courtesy limit
// per warm lambda instance.
const RATE_LIMIT = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export const POST = withErrorHandling(async (request) => {
  const body: unknown = await request.json().catch(() => null);
  const locale = body && typeof body === "object" && (body as { locale?: unknown }).locale === "fr" ? "fr" : "ar";

  const ip = clientIp(request);
  if (!checkRateLimit(`orders:${ip}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    const t = await getTranslations({ locale, namespace: "orderErrors" });
    return { ok: false, error: { code: "RATE_LIMITED", message: t("rateLimited") } };
  }

  return createOrder(body);
});
