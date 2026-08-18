"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { APIError } from "better-auth";
import { z } from "zod";
import { auth } from "@/src/lib/auth";
import type { ErrorCode } from "@/src/lib/errors";

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
