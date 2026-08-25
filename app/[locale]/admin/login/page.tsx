import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/admin/login-form";
import { ADMIN_MESSAGE_NAMESPACES, pickMessages } from "@/src/i18n/messages";
import { requireUser } from "@/src/services/authz";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.login" });
  return { title: t("title") };
}

/**
 * Unlike the rest of admin, this page does *not* opt out of prerendering. The
 * login form is the same for everybody and is the one thing an operator is
 * here for, so it ships in the static shell and paints immediately. The only
 * per-request work is the courtesy redirect for someone who is already signed
 * in — that reads `headers()`, so it streams in its own boundary rather than
 * holding the form back for a check that fails for almost every visitor.
 */
export default async function AdminLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, messages] = await Promise.all([
    getTranslations("admin.login"),
    pickMessages(ADMIN_MESSAGE_NAMESPACES),
  ]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Suspense fallback={null}>
        <RedirectIfSignedIn locale={locale} />
      </Suspense>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="font-display text-3xl font-semibold text-ink">TFT</span>
          <p className="mt-3 text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
            {t("brand")}
          </p>
          <h1 className="mt-3 font-heading text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="mt-1.5 text-sm text-ink-soft">{t("subtitle")}</p>
        </div>

        <NextIntlClientProvider messages={messages}>
          <LoginForm />
        </NextIntlClientProvider>
      </div>
    </main>
  );
}

/** Renders nothing; exists only to send an already-authenticated operator on to the dashboard. */
async function RedirectIfSignedIn({ locale }: { locale: string }) {
  const auth = await requireUser();
  if (auth.ok) redirect(`/${locale}/admin`);
  return null;
}
