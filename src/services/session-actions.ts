"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { APIError } from "better-auth";
import { z } from "zod";
import { auth } from "@/src/lib/auth";
import type { ErrorCode } from "@/src/lib/errors";
import { logger } from "@/src/lib/logger";
import { checkRateLimit } from "@/src/lib/rate-limit";

/**
 * Sign-in throttling. There is no Better Auth HTTP handler mounted in this app
 * — every auth flow goes through a server action calling `auth.api.*`
 * directly — so Better Auth's own rate limiter, which is middleware on its
 * router, never runs. Without this the admin console, which holds prices,
 * orders, customer phone numbers, the register and the staff accounts, took
 * unlimited password attempts, while the two endpoints that matter least
 * (order tracking, order creation) were already limited.
 *
 * Both keys must pass: the IP bucket stops one host spraying many accounts,
 * the e-mail bucket stops a botnet grinding one account. `rate-limit.ts` is
 * per-instance and in-memory by its own admission, so this is a floor — the
 * Cloudflare rule that file documents belongs on this route above all others.
 */
const SIGN_IN_LIMIT = 5;
const SIGN_IN_WINDOW_MS = 15 * 60_000;

async function clientIp(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

const signInSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

export type SignInState = {
  ok: false;
  email: string;
  error: { code: ErrorCode; message: string };
} | null;

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const t = await getTranslations("authErrors");
  const rawEmail = String(formData.get("email") ?? "");
  const parsed = signInSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      email: rawEmail,
      error: { code: "VALIDATION", message: t("invalidCredentials") },
    };
  }

  const ip = await clientIp();
  const withinLimit =
    checkRateLimit(`signin:ip:${ip}`, SIGN_IN_LIMIT, SIGN_IN_WINDOW_MS) &&
    checkRateLimit(`signin:email:${parsed.data.email}`, SIGN_IN_LIMIT, SIGN_IN_WINDOW_MS);

  if (!withinLimit) {
    logger.warn("Sign-in throttled", { code: "RATE_LIMITED", ip, email: parsed.data.email });
    return {
      ok: false,
      email: parsed.data.email,
      error: { code: "RATE_LIMITED", message: t("tooManyAttempts") },
    };
  }

  try {
    await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      return {
        ok: false,
        email: parsed.data.email,
        error: { code: "UNAUTHORIZED", message: t("invalidCredentials") },
      };
    }
    throw error;
  }

  const locale = await getLocale();
  redirect(`/${locale}/admin`);
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  const locale = await getLocale();
  redirect(`/${locale}/admin/login`);
}
